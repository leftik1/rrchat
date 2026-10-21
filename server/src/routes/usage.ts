import type { FastifyPluginAsync } from 'fastify';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ModelManager, ModelInfo } from '../models/manager.js';
import { calculateVramEstimate } from '../models/process.js';
import { loadConfig } from '../config.js';
import { getChatById, getMessages, getActiveMessages } from '../db.js';

const execAsync = promisify(exec);

let prevCpuTimes: { idle: number; total: number } | null = null;

function getCpuUsagePercent(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  if (!prevCpuTimes) {
    prevCpuTimes = { idle: totalIdle, total: totalTick };
    return 5;
  }

  const idleDelta = totalIdle - prevCpuTimes.idle;
  const totalDelta = totalTick - prevCpuTimes.total;
  prevCpuTimes = { idle: totalIdle, total: totalTick };

  if (totalDelta <= 0) return 0;
  const usage = 100 - (idleDelta / totalDelta) * 100;
  return Math.min(100, Math.max(0, Math.round(usage)));
}

let cachedGpuStats: {
  data: {
    name: string;
    utilization: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    temperatureC: number;
  } | null;
  timestamp: number;
} | null = null;

async function getGpuStats(): Promise<{
  name: string;
  utilization: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  temperatureC: number;
} | null> {
  const now = Date.now();
  if (cachedGpuStats && now - cachedGpuStats.timestamp < 2000) {
    return cachedGpuStats.data;
  }
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits',
      { timeout: 3000 }
    );
    const line = stdout.trim().split('\n')[0];
    if (!line) {
      cachedGpuStats = { data: null, timestamp: now };
      return null;
    }

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length >= 6) {
      const data = {
        name: parts[0] || 'NVIDIA GPU',
        memoryTotalMB: parseInt(parts[1], 10) || 12288,
        memoryUsedMB: parseInt(parts[2], 10) || 0,
        temperatureC: parseInt(parts[4], 10) || 0,
        utilization: parseInt(parts[5], 10) || 0,
      };
      cachedGpuStats = { data, timestamp: now };
      return data;
    }
    cachedGpuStats = { data: null, timestamp: now };
    return null;
  } catch {
    cachedGpuStats = { data: null, timestamp: now };
    return null;
  }
}

export async function buildUsageSnapshot(manager: ModelManager, chatId?: string, modelId?: string) {
  const { config } = loadConfig();
  const allModels = await manager.list();
  const activeMainId = manager.getActiveModel();
  const activeAuxId = manager.getActiveAuxModel();

  // 1. Hardware stats
  const gpuStats = await getGpuStats();
  const totalRamMB = Math.round(os.totalmem() / (1024 * 1024));
  const freeRamMB = Math.round(os.freemem() / (1024 * 1024));
  const usedRamMB = totalRamMB - freeRamMB;
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim().replace(/\s+/g, ' ') || 'Generic CPU';

  const hardware = {
    gpu: gpuStats || {
      name: 'NVIDIA GPU',
      utilization: 0,
      memoryUsedMB: 0,
      memoryTotalMB: 12288,
      temperatureC: 45,
    },
    cpu: {
      model: cpuModel,
      usagePercent: getCpuUsagePercent(),
      cores: Math.max(1, Math.floor(cpus.length / 2)),
      threads: cpus.length,
    },
    ram: {
      usedMB: usedRamMB,
      totalMB: totalRamMB,
      percent: Math.round((usedRamMB / totalRamMB) * 100),
    },
  };

  // 2. Model stats
  const targetMainId = modelId || activeMainId;
  const mainModel = (targetMainId && allModels.find((m) => m.id === targetMainId)) ||
    allModels.find((m) => m.id === activeMainId) ||
    allModels.find((m) => m.role !== 'aux') || allModels[0];

  const auxModel = allModels.find((m) => m.id === activeAuxId) ||
    allModels.find((m) => m.role === 'aux');

  const formatModelCard = (m?: ModelInfo) => {
    if (!m) return null;
    const settings = config.modelSettings[m.id] || {};
    const offloaded = settings.gpuLayers ?? (m.role === 'aux' ? 0 : 99);
    const totalLayers = m.layersCount || 32;
    const est = calculateVramEstimate(
      m.sizeBytes,
      m.layersCount,
      offloaded,
      m.contextTokens || 8192,
      m.kvCacheType || 'f16',
      m.calibratedVramMB
    );

    return {
      id: m.id,
      name: m.name,
      status: m.status,
      role: m.role || 'main',
      parameters: m.parametersCount ? `${(m.parametersCount / 1e9).toFixed(1).replace(/\.0$/, '')}B` : undefined,
      quantization: m.quantization || 'Q4_K_M',
      context: m.contextTokens || 8192,
      placement: m.placement || est.placement,
      layers: {
        offloaded: Math.min(offloaded, totalLayers),
        total: totalLayers,
      },
      estimatedVramMB: m.estimatedVramMB || est.estimatedVramMB,
      physicalVramMB: m.status === 'loaded' ? (gpuStats?.memoryUsedMB || 0) : 0,
      kvCache: {
        type: m.kvCacheType || 'f16',
        sizeMB: est.kvCacheSizeMB,
      },
    };
  };

  // 3. Context & Session stats
  const totalContext = mainModel?.contextTokens || 8192;
  const prePromptTokens = config.userPrePrompt
    ? Math.max(1, Math.round(config.userPrePrompt.length / 3.5))
    : 0;

  const toPct = (val: number) => Number(((val / totalContext) * 100).toFixed(1));

  let context = {
    total: totalContext,
    used: prePromptTokens,
    usedPercent: Math.min(100, Math.round((prePromptTokens / totalContext) * 100)),
    breakdown: {
      prePrompt: { tokens: prePromptTokens, percent: toPct(prePromptTokens) },
      skills: { tokens: 0, percent: 0 },
      tools: { tokens: 0, percent: 0 },
      history: { tokens: 0, percent: 0 },
      reasoning: { tokens: 0, percent: 0 },
      attachments: { tokens: 0, percent: 0 },
      other: { tokens: 0, percent: 0 },
      free: { tokens: Math.max(0, totalContext - prePromptTokens), percent: Number((Math.max(0, 100 - toPct(prePromptTokens))).toFixed(1)) },
    },
  };

  let session = {
    userMessages: 0,
    assistantMessages: 0,
    totalMessages: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    averageSpeed: 0,
    lastSpeed: 0,
    reasoningTimeSec: 0,
    mode: 'chat',
  };

  if (chatId) {
    const chat = getChatById(chatId);
    const allMsgs = getMessages(chatId, true);
    const activeMsgs = getActiveMessages(chatId);

    const skillsTokens = 0;
    const toolsTokens = chat?.mode === 'work' ? 480 : 0;

    let historyTokens = 0;
    let attachmentsTokens = 0;
    let lastReasoningTokens = 0;

    for (const msg of activeMsgs) {
      if (msg.token_count) {
        historyTokens += msg.token_count;
      } else {
        historyTokens += Math.max(1, Math.round((msg.content || '').length / 3.5));
      }

      if (msg.reasoning) {
        lastReasoningTokens = Math.max(1, Math.round(msg.reasoning.length / 3.5));
      }

      if (msg.attachments) {
        try {
          const atts = JSON.parse(msg.attachments);
          if (Array.isArray(atts)) {
            for (const a of atts) {
              if (a.isImage) {
                attachmentsTokens += 576;
              } else if (a.textContent) {
                attachmentsTokens += Math.max(1, Math.round(a.textContent.length / 3.5));
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const lastAssistantWithStats = [...activeMsgs]
      .reverse()
      .find((m) => m.role === 'assistant' && m.stats);

    let slotUsed = 0;
    if (lastAssistantWithStats?.stats) {
      try {
        const s = JSON.parse(lastAssistantWithStats.stats);
        slotUsed = (s.promptTokens || 0) + (s.completionTokens || 0);
      } catch {
        // ignore
      }
    }

    const knownTokens = prePromptTokens + skillsTokens + toolsTokens + historyTokens + lastReasoningTokens + attachmentsTokens;
    const usedTokens = Math.min(totalContext, Math.max(slotUsed, knownTokens));
    const otherTokens = Math.max(0, usedTokens - knownTokens);
    const freeTokens = Math.max(0, totalContext - usedTokens);

    const pPrePrompt = toPct(prePromptTokens);
    const pSkills = toPct(skillsTokens);
    const pTools = toPct(toolsTokens);
    const pHistory = toPct(historyTokens);
    const pReasoning = toPct(lastReasoningTokens);
    const pAttachments = toPct(attachmentsTokens);
    const pOther = toPct(otherTokens);
    const usedPctSum = pPrePrompt + pSkills + pTools + pHistory + pReasoning + pAttachments + pOther;
    const pFree = Number((Math.max(0, 100 - usedPctSum)).toFixed(1));

    context = {
      total: totalContext,
      used: usedTokens,
      usedPercent: Math.min(100, Math.round((usedTokens / totalContext) * 100)),
      breakdown: {
        prePrompt: { tokens: prePromptTokens, percent: pPrePrompt },
        skills: { tokens: skillsTokens, percent: pSkills },
        tools: { tokens: toolsTokens, percent: pTools },
        history: { tokens: historyTokens, percent: pHistory },
        reasoning: { tokens: lastReasoningTokens, percent: pReasoning },
        attachments: { tokens: attachmentsTokens, percent: pAttachments },
        other: { tokens: otherTokens, percent: pOther },
        free: { tokens: freeTokens, percent: pFree },
      },
    };

    const userMsgs = allMsgs.filter((m) => m.role === 'user');
    const assistantMsgs = allMsgs.filter((m) => m.role === 'assistant');

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let speeds: number[] = [];
    let lastSpeed = 0;
    let lastReasoningDurationSec = 0;

    for (const m of assistantMsgs) {
      if (m.stats) {
        try {
          const s = JSON.parse(m.stats);
          if (s.promptTokens) totalPromptTokens += s.promptTokens;
          if (s.completionTokens) totalCompletionTokens += s.completionTokens;
          if (s.tokensPerSecond) {
            speeds.push(s.tokensPerSecond);
            lastSpeed = s.tokensPerSecond;
          }
          if (typeof s.reasoningDurationSec === 'number' && s.reasoningDurationSec > 0) {
            lastReasoningDurationSec = s.reasoningDurationSec;
          }
        } catch {
          // ignore
        }
      }
    }

    const averageSpeed = speeds.length > 0
      ? Number((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1))
      : 0;

    session = {
      userMessages: userMsgs.length,
      assistantMessages: assistantMsgs.length,
      totalMessages: allMsgs.length,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      averageSpeed,
      lastSpeed,
      reasoningTimeSec: lastReasoningDurationSec || (lastReasoningTokens > 0 ? Math.max(1, Math.round(lastReasoningTokens / 20)) : 0),
      mode: chat?.mode || 'chat',
    };
  }

  return {
    timestamp: Date.now(),
    hardware,
    model: {
      main: formatModelCard(mainModel),
      aux: formatModelCard(auxModel),
    },
    context,
    session,
  };
}

export const usageRoutes = (manager: ModelManager): FastifyPluginAsync => {
  return async (fastify) => {
    fastify.get('/snapshot', async (req, reply) => {
      if ((req as any).userRole === 'guest') {
        return reply.status(403).send({
          error: 'forbidden_guest',
          message: 'Доступно только в полном режиме',
        });
      }

      const { chatId, modelId } = (req.query as any) || {};
      const snapshot = await buildUsageSnapshot(manager, chatId, modelId);
      return snapshot;
    });

    fastify.get('/stream', async (req, reply) => {
      if ((req as any).userRole === 'guest') {
        return reply.status(403).send({
          error: 'forbidden_guest',
          message: 'Доступно только в полном режиме',
        });
      }

      const { chatId, modelId } = (req.query as any) || {};

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      let isClosed = false;
      let inFlight = false;

      const pingTimer = setInterval(() => {
        try {
          if (!reply.raw.destroyed && reply.raw.writable && !isClosed) {
            reply.raw.write(': ping\n\n');
          }
        } catch {
          // ignore
        }
      }, 15000);

      req.raw.on('close', () => {
        isClosed = true;
        clearInterval(pingTimer);
      });

      const sendSnapshot = async () => {
        if (isClosed || inFlight) return;
        inFlight = true;
        try {
          const payload = await buildUsageSnapshot(manager, chatId, modelId);
          if (!isClosed && !reply.raw.destroyed && reply.raw.writable) {
            reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        } catch (err: any) {
          console.error('[usage] error preparing snapshot:', err);
        } finally {
          inFlight = false;
        }
      };

      // Send initial snapshot immediately
      await sendSnapshot();

      // Send updates every 2 seconds
      const timer = setInterval(() => {
        if (isClosed) {
          clearInterval(timer);
          return;
        }
        sendSnapshot();
      }, 2000);

      req.raw.on('close', () => {
        clearInterval(timer);
      });
    });
  };
};
