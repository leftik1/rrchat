import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import QRCode from 'qrcode';
import { localhostAdminHook, revokeAllSessions, recordAuditLog, classifyRequest } from '../auth.js';
import { getAuditLogs, getAllGuestChats, getChatById, getMessages, deleteChat, revokeGuestSessionsDb } from '../db.js';
import {
  loadConfig,
  saveConfig,
  getPlainToken,
  regeneratePlainToken,
  getPlainGuestToken,
  regenerateGuestToken,
  revokeGuestToken,
} from '../config.js';
import type { ProcessModelManager } from '../models/process.js';

function getConnectBaseUrl(req: any, preferredIp: string, port: number): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : '') || (req.protocol === 'https' ? 'https' : 'http');
  const hostHeader = (req.headers.host || '').trim();
  const accessClass = classifyRequest(req);

  if (accessClass === 'proxied' || (hostHeader && !hostHeader.startsWith('localhost') && !hostHeader.startsWith('127.0.0.1'))) {
    return `${proto}://${hostHeader}`;
  }
  return `http://${preferredIp}:${port}`;
}

interface GpuInfo {
  name: string;
  totalVramMB: number;
  usedVramMB: number;
  freeVramMB: number;
  temperatureC: number;
  utilizationPercent: number;
}

function getGpuStats(): Promise<GpuInfo | null> {
  return new Promise((resolve) => {
    exec(
      'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits',
      { timeout: 2000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        try {
          const parts = stdout.trim().split(',').map((p) => p.trim());
          if (parts.length >= 6) {
            resolve({
              name: parts[0],
              totalVramMB: parseInt(parts[1], 10) || 0,
              usedVramMB: parseInt(parts[2], 10) || 0,
              freeVramMB: parseInt(parts[3], 10) || 0,
              temperatureC: parseInt(parts[4], 10) || 0,
              utilizationPercent: parseInt(parts[5], 10) || 0,
            });
            return;
          }
        } catch {
          // ignore parse error
        }
        resolve(null);
      }
    );
  });
}

export const adminRoutes = (modelManager?: ProcessModelManager): FastifyPluginAsync => async (fastify) => {
  // Enforce localhost only
  fastify.addHook('preHandler', localhostAdminHook);

  fastify.get('/system', async () => {
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown CPU';
    const cpuCores = cpus.length;

    const gpu = await getGpuStats();

    return {
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      uptimeSec: Math.floor(os.uptime()),
      cpu: {
        model: cpuModel,
        cores: cpuCores,
      },
      ram: {
        totalBytes: totalMemBytes,
        usedBytes: usedMemBytes,
        freeBytes: freeMemBytes,
        usedPercent: Math.round((usedMemBytes / totalMemBytes) * 100),
      },
      gpu,
    };
  });

  fastify.get('/info', async (req) => {
    const { config } = loadConfig();
    const token = getPlainToken();

    // Get non-internal IPv4 addresses
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }

    const preferredIp = ips.find((ip) => ip.startsWith('192.168.')) || ips[0] || 'localhost';
    const baseUrl = getConnectBaseUrl(req, preferredIp, config.port);
    const connectUrl = token
      ? `${baseUrl}/#token=${token}`
      : `${baseUrl}/`;

    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(connectUrl, {
        margin: 2,
        width: 256,
        color: {
          dark: '#120e0e',
          light: '#f3eeee',
        },
      });
    } catch (err) {
      console.error('[Admin] QR code generation failed:', err);
    }

    const guestToken = getPlainGuestToken();
    const guestConnectUrl = guestToken
      ? `${baseUrl}/#token=${guestToken}`
      : null;
    let guestQrCodeDataUrl = '';
    if (guestConnectUrl) {
      try {
        guestQrCodeDataUrl = await QRCode.toDataURL(guestConnectUrl, {
          margin: 2,
          width: 256,
          color: {
            dark: '#120e0e',
            light: '#f3eeee',
          },
        });
      } catch (err) {
        console.error('[Admin] Guest QR code generation failed:', err);
      }
    }

    return {
      config,
      plainToken: token,
      preferredIp,
      allIps: ips,
      connectUrl,
      qrCodeDataUrl,
      plainGuestToken: guestToken,
      guestConnectUrl,
      guestQrCodeDataUrl,
    };
  });

  fastify.get('/browse', async (req, reply) => {
    const query = req.query as { path?: string };
    let targetPath = query.path;

    if (!targetPath) {
      // Return available drive roots on Windows or root on Unix
      if (process.platform === 'win32') {
        const drives: string[] = [];
        for (let i = 65; i <= 90; i++) {
          const drive = `${String.fromCharCode(i)}:\\`;
          if (fs.existsSync(drive)) {
            drives.push(drive);
          }
        }
        return { current: '', parent: null, directories: drives.map((d) => ({ name: d, fullPath: d })) };
      } else {
        targetPath = '/';
      }
    }

    targetPath = path.resolve(targetPath);
    if (!fs.existsSync(targetPath)) {
      return reply.status(404).send({ error: 'Path not found' });
    }

    try {
      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          fullPath: path.join(targetPath, e.name),
        }));

      const parent = path.dirname(targetPath);
      return {
        current: targetPath,
        parent: parent === targetPath ? null : parent,
        directories: dirs,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: 'Cannot read directory', message: err.message });
    }
  });

  fastify.put('/config', async (req, reply) => {
    const body = (req.body as any) || {};
    const { config } = loadConfig();

    if (body.modelsDir) {
      if (!fs.existsSync(body.modelsDir)) {
        return reply.status(400).send({ error: 'modelsDir does not exist' });
      }
      config.modelsDir = path.resolve(body.modelsDir);
      modelManager?.updateModelsDir();
    }

    if (body.llamaServerPath) {
      if (!fs.existsSync(body.llamaServerPath)) {
        return reply.status(400).send({ error: 'llamaServerPath does not exist' });
      }
      config.llamaServerPath = path.resolve(body.llamaServerPath);
    }

    if (body.port && typeof body.port === 'number') {
      config.port = body.port;
    }

    if (body.workDir) {
      const resolvedWork = path.resolve(body.workDir);
      if (!fs.existsSync(resolvedWork)) {
        fs.mkdirSync(resolvedWork, { recursive: true });
      }
      config.workDir = resolvedWork;
    }

    if (typeof body.workQuotaGB === 'number' && body.workQuotaGB > 0) {
      config.workQuotaGB = body.workQuotaGB;
    }

    if (typeof body.workModeEnabled === 'boolean') {
      const prev = config.workModeEnabled;
      config.workModeEnabled = body.workModeEnabled;
      if (prev !== body.workModeEnabled) {
        recordAuditLog('work_mode_toggle', req.ip || '', req.headers['user-agent'] || '', {
          workModeEnabled: body.workModeEnabled,
        });
      }
    }

    if (typeof body.maxAgentSteps === 'number' && body.maxAgentSteps >= 5 && body.maxAgentSteps <= 50) {
      config.maxAgentSteps = body.maxAgentSteps;
    }

    if (typeof body.commandTimeoutSec === 'number' && body.commandTimeoutSec >= 10 && body.commandTimeoutSec <= 300) {
      config.commandTimeoutSec = body.commandTimeoutSec;
    }

    if (typeof body.autoApproveCommands === 'boolean') {
      config.autoApproveCommands = body.autoApproveCommands;
    }

    if (typeof body.userPrePrompt === 'string') {
      config.userPrePrompt = body.userPrePrompt;
    }

    if (Array.isArray(body.disabledSkills)) {
      config.disabledSkills = body.disabledSkills;
    }

    if (typeof body.theme === 'string') {
      config.theme = body.theme;
    }

    if (typeof body.agentWebSearch === 'boolean') {
      config.agentWebSearch = body.agentWebSearch;
    }

    if (typeof body.language === 'string') {
      config.language = body.language === 'en' ? 'en' : 'ru';
    }

    if (typeof body.allowWorkOverTunnel === 'boolean') {
      config.allowWorkOverTunnel = body.allowWorkOverTunnel;
    }

    if (typeof body.allowAdminOverTunnel === 'boolean') {
      config.allowAdminOverTunnel = body.allowAdminOverTunnel;
    }

    if (typeof body.allowAdminRemote === 'boolean') {
      config.allowAdminRemote = body.allowAdminRemote;
    }

    if (Array.isArray(body.allowedHosts)) {
      config.allowedHosts = body.allowedHosts.filter((h: any) => typeof h === 'string');
    }

    saveConfig(config);
    return { ok: true, config };
  });

  fastify.get('/audit', async (req, reply) => {
    const { limit = '50', offset = '0', download } = (req.query as any) || {};
    if (download === '1' || download === 'true') {
      const logs = getAuditLogs(10000, 0);
      reply.header('Content-Disposition', 'attachment; filename="audit.json"');
      reply.header('Content-Type', 'application/json');
      return logs;
    }
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    const logs = getAuditLogs(lim, off);
    return { logs, limit: lim, offset: off };
  });

  fastify.post('/token/regenerate', async (req) => {
    revokeAllSessions();
    const newToken = regeneratePlainToken();
    const { config } = loadConfig();
    recordAuditLog('token_reset', req.ip || '', req.headers['user-agent'] || '');
    return { ok: true, plainToken: newToken, config };
  });

  fastify.post('/guest-token/generate', async (req) => {
    revokeGuestSessionsDb();
    const newGuestToken = regenerateGuestToken();
    const { config } = loadConfig();
    recordAuditLog('guest_token_generate', req.ip || '', req.headers['user-agent'] || '');

    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    const preferredIp = ips.find((ip) => ip.startsWith('192.168.')) || ips[0] || 'localhost';
    const baseUrl = getConnectBaseUrl(req, preferredIp, config.port);
    const guestConnectUrl = `${baseUrl}/#token=${newGuestToken}`;
    let guestQrCodeDataUrl = '';
    try {
      guestQrCodeDataUrl = await QRCode.toDataURL(guestConnectUrl, {
        margin: 2,
        width: 256,
        color: {
          dark: '#120e0e',
          light: '#f3eeee',
        },
      });
    } catch (err) {
      console.error('[Admin] Guest QR code generation failed:', err);
    }

    return {
      ok: true,
      plainGuestToken: newGuestToken,
      guestConnectUrl,
      guestQrCodeDataUrl,
      config,
    };
  });

  fastify.post('/guest-token/revoke', async (req) => {
    revokeGuestToken();
    revokeGuestSessionsDb();
    recordAuditLog('guest_token_revoked', req.ip || '', req.headers['user-agent'] || '');
    const { config } = loadConfig();
    return { ok: true, config };
  });

  fastify.get('/guest-chats', async () => {
    const rawChats = getAllGuestChats();
    const chats = rawChats.map((c) => {
      const msgs = getMessages(c.id);
      const lastMsg = msgs[msgs.length - 1];
      return {
        ...c,
        messageCount: msgs.length,
        lastSnippet: lastMsg ? (lastMsg.content ? lastMsg.content.slice(0, 100) : '') : '',
      };
    });
    return { chats };
  });

  fastify.get('/guest-chats/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = getChatById(id);
    if (!chat || !chat.guest_session_id) {
      return reply.status(404).send({ error: 'Guest chat not found' });
    }
    const messages = getMessages(id);
    return { chat, messages };
  });

  fastify.delete('/guest-chats/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = getChatById(id);
    if (!chat || !chat.guest_session_id) {
      return reply.status(404).send({ error: 'Guest chat not found' });
    }
    deleteChat(id);
    return { ok: true };
  });
};


