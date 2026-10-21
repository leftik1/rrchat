import fs from 'node:fs';
import path from 'node:path';
import type { ModelManager } from '../models/manager.js';
import { addMessage, excludeMessages } from '../db.js';
import { loadConfig, PROJECT_ROOT } from '../config.js';
import { runAgentLoop } from '../agent/loop.js';
import { searchWeb, formatSearchResults } from '../search/web.js';
import { evaluateWebSearchNeed } from '../search/smart.js';
import { getActiveSkillsPrompt } from '../skills/manager.js';

export interface StreamEvent {
  event: 'meta' | 'reasoning' | 'content' | 'tool_call' | 'tool_approval' | 'tool_result' | 'stats' | 'error' | 'done' | 'status';
  data: any;
}

export interface AttachmentData {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  textContent?: string;
  dataUrl?: string;
}

export interface ChatMessageInput {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: AttachmentData[];
  excluded?: boolean | number;
  kind?: string;
}

export interface StreamOptions {
  chatId: string;
  assistantMessageId: string;
  modelId: string;
  messages: ChatMessageInput[];
  isIncognito: boolean;
  mode?: 'chat' | 'work';
  reasoningEffort?: 'low' | 'medium' | 'high';
  enableReasoning?: boolean;
  temperature?: number;
  topP?: number;
  minP?: number;
  repeatPenalty?: number;
  chatSystemPrompt?: string;
  autoCompact?: boolean;
  webSearch?: boolean;
  visionMode?: 'ocr' | 'vision';
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
  accessClass?: string;
  sessionId?: string;
}

const activeStreams = new Map<string, AbortController>();

export function abortStream(chatId: string): boolean {
  const controller = activeStreams.get(chatId);
  if (controller) {
    controller.abort();
    activeStreams.delete(chatId);
    return true;
  }
  return false;
}

async function performOcrWithAuxModel(
  modelManager: ModelManager,
  auxModelId: string,
  imageDataUrl: string
): Promise<string> {
  console.log(`[OCR] Loading/using auxiliary model ${auxModelId} in parallel on aux port (CPU/RAM)...`);
  await modelManager.ensureAux(auxModelId);
  const baseUrl = modelManager.baseUrlFor(auxModelId);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: auxModelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: 'Text Recognition:' },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Aux OCR failed with HTTP ${res.status}`);
  }

  const json = (await res.json()) as any;
  return json.choices?.[0]?.message?.content || '';
}

export async function handleChatStream(
  modelManager: ModelManager,
  opts: StreamOptions
): Promise<void> {
  const { chatId, assistantMessageId, modelId, messages, isIncognito, onEvent } = opts;
  const { config } = loadConfig();

  // 1. Ensure the requested main model is running on main port
  try {
    await modelManager.ensureMain(modelId);
  } catch (err: any) {
    onEvent({ event: 'error', data: { code: 'MODEL_LOAD_FAILED', message: err.message || 'Failed to load model' } });
    return;
  }

  // 2. If in Work Mode, run the agent loop
  if (opts.mode === 'work') {
    const controller = new AbortController();
    activeStreams.set(chatId, controller);
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => controller.abort());
    }
    try {
      await runAgentLoop(modelManager, {
        ...opts,
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        onEvent({ event: 'error', data: { code: 'AGENT_LOOP_ERROR', message: err.message || 'Agent error' } });
      }
    } finally {
      activeStreams.delete(chatId);
    }
    return;
  }

  const controller = new AbortController();
  activeStreams.set(chatId, controller);

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => {
      controller.abort();
    });
  }

  onEvent({
    event: 'meta',
    data: { messageId: assistantMessageId, model: modelId },
  });

  const startTime = Date.now();
  let generatedTokensCount = 0;
  let fullContent = '';
  let fullReasoning = '';
  let insideThinkTag = false;
  let reasoningStartTime: number | null = null;
  let reasoningEndTime: number | null = null;

  try {
    // Find info about current model
    const allModels = await modelManager.list();
    const currentModel = allModels.find((m) => m.id === modelId);

  // 1. Resolve dataUrl for all images across all messages
  for (const msg of messages) {
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        if (att && att.isImage && !att.dataUrl && att.id) {
          try {
            const uploadsDir = path.join(PROJECT_ROOT, 'uploads');
            if (fs.existsSync(uploadsDir)) {
              const match = fs.readdirSync(uploadsDir).find((f) => f.startsWith(att.id));
              if (match) {
                const buf = fs.readFileSync(path.join(uploadsDir, match));
                att.dataUrl = `data:${att.mimeType || 'image/jpeg'};base64,${buf.toString('base64')}`;
              }
            }
          } catch (err) {
            console.warn('[stream] Failed to read image from disk:', err);
          }
        }
      }
    }
  }

  // Determine vision mode: OCR with aux model or direct multimodal Vision
  const effectiveVisionMode = opts.visionMode ?? (currentModel?.hasVision ? 'vision' : 'ocr');
  const needOcr = effectiveVisionMode === 'ocr' || !currentModel?.hasVision;

  // Check if latest user message contains images and if we need OCR
  const imageAttachments: { attachment: AttachmentData; msgIndex: number }[] = [];
  if (needOcr) {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    const targetMsg = lastUserIdx >= 0 ? messages[lastUserIdx] : null;
    if (targetMsg && targetMsg.attachments && targetMsg.attachments.length > 0) {
      targetMsg.attachments.forEach((att) => {
        if (att.isImage && att.dataUrl) {
          imageAttachments.push({ attachment: att, msgIndex: lastUserIdx });
        }
      });
    }
  }

  // Find auxiliary model candidate if OCR needed
  let auxModelCandidate = config.activeAuxModelId
    ? allModels.find((m) => m.id === config.activeAuxModelId)
    : undefined;

  if (!auxModelCandidate) {
    auxModelCandidate = allModels.find((m) => {
      const s = config.modelSettings[m.id];
      const role = s?.userRole || s?.role || m.role;
      return role === 'aux' && m.id !== modelId;
    });
  }

  // Perform parallel OCR for images if main model lacks vision
  const ocrResults = new Map<string, string>();
  if (imageAttachments.length > 0) {
    if (auxModelCandidate) {
      for (const item of imageAttachments) {
        const att = item.attachment;
        try {
          onEvent({
            event: 'status',
            data: { type: 'ocr', message: `Анализ фото (${auxModelCandidate.name})...` },
          });

          const ocrText = await performOcrWithAuxModel(
            modelManager,
            auxModelCandidate.id,
            att.dataUrl!
          );

          ocrResults.set(att.id, `[распознано: ${auxModelCandidate.name} | файл: ${att.filename}]:\n${ocrText.trim()}`);

          onEvent({
            event: 'status',
            data: {
              type: 'ocr_done',
              message: `Фото распознано (${auxModelCandidate.name})`,
              text: ocrText.trim(),
            },
          });
        } catch (ocrErr: any) {
          console.warn('[OCR] Parallel auxiliary model OCR failed:', ocrErr.message);
          ocrResults.set(att.id, `[Ошибка распознавания фото: ${ocrErr.message}]`);
          onEvent({
            event: 'status',
            data: {
              type: 'ocr_error',
              message: `Ошибка анализа фото: ${ocrErr.message}`,
            },
          });
        }
      }
    } else {
      for (const item of imageAttachments) {
        const att = item.attachment;
        ocrResults.set(
          att.id,
          `[Изображение "${att.filename}" прикреплено. Ведущая модель ${currentModel?.name || modelId} не поддерживает зрение, а вспомогательная модель OCR (GLM-OCR) не настроена в списке моделей]`
        );
      }
    }
  }

  const baseUrl = modelManager.baseUrlFor(modelId);
  const endpoint = `${baseUrl}/v1/chat/completions`;

  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const offsetMin = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMin) / 60);
  const offsetSign = offsetMin >= 0 ? '+' : '-';
  const tzStr = `UTC${offsetSign}${offsetHours}`;
  const dateInfo = `Текущая системная дата и время: ${dateStr}, ${timeStr} (${tzStr}). Current system date and time: ${now.toUTCString()}.`;

  // Handle smart web search if enabled
  let webSearchContext = '';
  let activeSearchResults: any[] = [];
  if (opts.webSearch) {
    try {
      const decision = await evaluateWebSearchNeed({
        endpoint,
        modelId,
        messages,
        dateInfo,
        signal: controller.signal,
      });

      if (decision.needed && decision.query) {
        const effectiveQuery = decision.query;
        onEvent({
          event: 'status',
          data: {
            type: 'web_search',
            query: effectiveQuery,
            message: `Поиск в сети: ${effectiveQuery.slice(0, 45)}...`,
          },
        });

        const searchResults = await searchWeb(effectiveQuery, 5);
        activeSearchResults = searchResults;
        if (searchResults.length > 0) {
          webSearchContext = formatSearchResults(effectiveQuery, searchResults);
          onEvent({
            event: 'status',
            data: {
              type: 'web_search_done',
              query: effectiveQuery,
              message: `Найдено ${searchResults.length} источников`,
              results: searchResults,
            },
          });
        } else {
          onEvent({
            event: 'status',
            data: {
              type: 'web_search_done',
              query: effectiveQuery,
              message: 'Источники не найдены',
              results: [],
            },
          });
        }
      }
    } catch (searchErr: any) {
      if (controller.signal.aborted) throw searchErr;
      console.warn('[stream] Smart web search error:', searchErr);
    }
  }

  // Prepare messages with attachments and document texts
  const formattedMessages: any[] = [];
  const { config: chatConfig } = loadConfig();
  const skillsPrompt = getActiveSkillsPrompt();

  let systemPrompt = dateInfo;
  if (opts.chatSystemPrompt?.trim()) {
    systemPrompt += `\n\n${opts.chatSystemPrompt.trim()}`;
  } else if (chatConfig.userPrePrompt?.trim()) {
    systemPrompt += `\n\n${chatConfig.userPrePrompt.trim()}`;
  }
  if (skillsPrompt) {
    systemPrompt += `\n\n${skillsPrompt}`;
  }
  if (webSearchContext) {
    systemPrompt += `\n\n${webSearchContext}`;
  }

  if (systemPrompt) {
    formattedMessages.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  for (const msg of messages) {
    if (msg.excluded) continue;

    let text = msg.content || '';

    // Append document text contents & OCR results
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        if (!att) continue;
        if (!att.isImage && att.textContent) {
          text += `\n\n[Вложенный документ: "${att.filename}"]:\n${att.textContent}`;
        } else if (att.isImage && ocrResults.has(att.id)) {
          text += `\n\n${ocrResults.get(att.id)}`;
        }
      }
    }

    // If model has vision, vision mode is selected (not OCR), and message has image attachments
    if (!needOcr && currentModel?.hasVision && Array.isArray(msg.attachments) && msg.attachments.some((a) => a && a.isImage && a.dataUrl)) {
      const promptText = text.trim() || 'Что изображено на этом изображении? Опиши подробно.';
      const parts: any[] = [{ type: 'text', text: promptText }];
      for (const att of msg.attachments) {
        if (att && att.isImage && att.dataUrl) {
          parts.push({
            type: 'image_url',
            image_url: { url: att.dataUrl },
          });
        }
      }
      formattedMessages.push({ role: msg.role, content: parts });
    } else {
      formattedMessages.push({ role: msg.role, content: text });
    }
  }

  // Automatic Context Compaction if nearing context limit
  const maxContextTokens = currentModel?.contextTokens || 8192;
  const compactThreshold = Math.round(maxContextTokens * 0.78);

  const estimateTokens = (msgs: any[]): number => {
    let count = 0;
    for (const m of msgs) {
      if (typeof m.content === 'string') {
        count += Math.ceil(m.content.length / 3.2);
      } else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if (p.type === 'text') count += Math.ceil((p.text || '').length / 3.2);
          else if (p.type === 'image_url') count += 800;
        }
      }
    }
    return count;
  };

  const activeNonExcluded = messages.filter((m) => !m.excluded);
  if (
    opts.autoCompact !== false &&
    activeNonExcluded.length > 4 &&
    estimateTokens(formattedMessages) > compactThreshold
  ) {
    const toCompact = activeNonExcluded.slice(0, activeNonExcluded.length - 2);
    const toCompactIds = toCompact.map((m) => m.id).filter(Boolean) as string[];

    if (!isIncognito && chatId && toCompactIds.length > 0) {
      try {
        excludeMessages(chatId, toCompactIds);
        addMessage({
          id: `msg_summary_${Date.now()}`,
          chat_id: chatId,
          role: 'system',
          content: `[Автоматическое сжатие контекста: предыдущие ${toCompact.length} сообщений сжаты для освобождения памяти]`,
          kind: 'summary',
        });
      } catch (compactErr) {
        console.warn('[stream] Auto-compact DB error:', compactErr);
      }
    }

    onEvent({
      event: 'status',
      data: {
        type: 'context_compacted',
        message: `Контекст сжат: ${toCompact.length} сообщений архивированы`,
      },
    });

    formattedMessages.length = 0;
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push({
      role: 'system',
      content: `[Предыдущие ${toCompact.length} сообщений были сжаты для освобождения контекста]`,
    });
    for (const msg of activeNonExcluded.slice(activeNonExcluded.length - 2)) {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const requestBody: any = {
    model: modelId,
    messages: formattedMessages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (typeof opts.temperature === 'number') {
    requestBody.temperature = opts.temperature;
  }
  if (typeof opts.topP === 'number') {
    requestBody.top_p = opts.topP;
  }
  if (typeof opts.minP === 'number') {
    requestBody.min_p = opts.minP;
  }
  if (typeof opts.repeatPenalty === 'number') {
    requestBody.repeat_penalty = opts.repeatPenalty;
  }

  // Add reasoning settings if specified
  if (opts.enableReasoning === false) {
    requestBody.reasoning_effort = 'none';
    requestBody.reasoning_budget_tokens = 0;
    requestBody.thinking_budget_tokens = 0;
    requestBody.chat_template_kwargs = {
      ...(requestBody.chat_template_kwargs || {}),
      enable_thinking: false,
    };
  } else {
    requestBody.reasoning_effort = opts.reasoningEffort || 'medium';
    requestBody.chat_template_kwargs = {
      ...(requestBody.chat_template_kwargs || {}),
      enable_thinking: true,
    };
  }

  const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`llama-server returned ${res.status}: ${errText}`);
    }

    if (!res.body) {
      throw new Error('No response body from llama-server');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let contentStreamBuffer = '';
    let usageData: any = null;
    let timingsData: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const payload = trimmed.substring(6).trim();
          if (payload === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(payload);
            if (parsed.usage) {
              usageData = parsed.usage;
            }
            if (parsed.timings) {
              timingsData = parsed.timings;
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta || {};

            // 1. Check native reasoning_content
            if (delta.reasoning_content) {
              if (!reasoningStartTime) reasoningStartTime = Date.now();
              const rChunk = delta.reasoning_content;
              fullReasoning += rChunk;
              generatedTokensCount++;
              onEvent({ event: 'reasoning', data: { delta: rChunk } });
            }

            // 2. Check content (and parse <think> tag with chunk-split resilience)
            if (delta.content) {
              contentStreamBuffer += delta.content;
              generatedTokensCount++;

              let progress = true;
              while (progress && contentStreamBuffer.length > 0) {
                progress = false;

                if (!insideThinkTag) {
                  const thinkIdx = contentStreamBuffer.indexOf('<think>');
                  if (thinkIdx !== -1) {
                    const textBefore = contentStreamBuffer.slice(0, thinkIdx);
                    if (textBefore) {
                      fullContent += textBefore;
                      onEvent({ event: 'content', data: { delta: textBefore } });
                    }
                    contentStreamBuffer = contentStreamBuffer.slice(thinkIdx + 7);
                    insideThinkTag = true;
                    if (!reasoningStartTime) reasoningStartTime = Date.now();
                    progress = true;
                    continue;
                  }

                  // Hold back trailing prefix if buffer ends with a prefix of '<think>'
                  let heldLen = 0;
                  for (let len = Math.min(6, contentStreamBuffer.length); len >= 1; len--) {
                    if ('<think>'.startsWith(contentStreamBuffer.slice(-len))) {
                      heldLen = len;
                      break;
                    }
                  }

                  const safeLen = contentStreamBuffer.length - heldLen;
                  if (safeLen > 0) {
                    const safeChunk = contentStreamBuffer.slice(0, safeLen);
                    fullContent += safeChunk;
                    onEvent({ event: 'content', data: { delta: safeChunk } });
                    contentStreamBuffer = contentStreamBuffer.slice(safeLen);
                  }
                } else {
                  const endThinkIdx = contentStreamBuffer.indexOf('</think>');
                  if (endThinkIdx !== -1) {
                    const reasoningBefore = contentStreamBuffer.slice(0, endThinkIdx);
                    if (reasoningBefore) {
                      fullReasoning += reasoningBefore;
                      onEvent({ event: 'reasoning', data: { delta: reasoningBefore } });
                    }
                    contentStreamBuffer = contentStreamBuffer.slice(endThinkIdx + 8);
                    insideThinkTag = false;
                    if (reasoningStartTime && !reasoningEndTime) reasoningEndTime = Date.now();
                    progress = true;
                    continue;
                  }

                  // Hold back trailing prefix if buffer ends with a prefix of '</think>'
                  let heldLen = 0;
                  for (let len = Math.min(7, contentStreamBuffer.length); len >= 1; len--) {
                    if ('</think>'.startsWith(contentStreamBuffer.slice(-len))) {
                      heldLen = len;
                      break;
                    }
                  }

                  const safeLen = contentStreamBuffer.length - heldLen;
                  if (safeLen > 0) {
                    const safeChunk = contentStreamBuffer.slice(0, safeLen);
                    fullReasoning += safeChunk;
                    onEvent({ event: 'reasoning', data: { delta: safeChunk } });
                    contentStreamBuffer = contentStreamBuffer.slice(safeLen);
                  }
                }
              }
            }
          } catch (parseErr) {
            // ignore non-json SSE lines
          }
        }
      }
    }

    // Flush any remaining content in stream buffer
    if (contentStreamBuffer.length > 0) {
      if (insideThinkTag) {
        fullReasoning += contentStreamBuffer;
        onEvent({ event: 'reasoning', data: { delta: contentStreamBuffer } });
      } else {
        fullContent += contentStreamBuffer;
        onEvent({ event: 'content', data: { delta: contentStreamBuffer } });
      }
      contentStreamBuffer = '';
    }

    // Compute final statistics
    const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.05);
    const completionTokens = usageData?.completion_tokens ?? timingsData?.predicted_n ?? generatedTokensCount;
    const promptTokens = usageData?.prompt_tokens ?? timingsData?.prompt_n ?? 0;
    const tokensPerSecond = timingsData?.predicted_per_second
      ? Number(timingsData.predicted_per_second.toFixed(1))
      : Number((completionTokens / elapsedSec).toFixed(1));

    const totalContext = currentModel?.contextTokens || 8192;
    const contextUsedPercent = Math.min(Math.round(((promptTokens + completionTokens) / totalContext) * 100), 100);
    const reasoningDurationSec = reasoningStartTime
      ? Math.max(1, Math.round(((reasoningEndTime || Date.now()) - reasoningStartTime) / 1000))
      : undefined;

    const stats: any = {
      tokensPerSecond,
      promptTokens,
      completionTokens,
      contextUsedPercent,
      reasoningDurationSec,
    };
    if (activeSearchResults.length > 0) {
      stats.webSearchResults = activeSearchResults;
    }

    onEvent({ event: 'stats', data: stats });

    // Clean up raw tool call tags if emitted inline
    let sanitizedContent = fullContent.replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/g, '').trim();
    if (!sanitizedContent && fullContent) {
      sanitizedContent = fullContent;
    }

    // Save to SQLite only if not in incognito mode
    if (!isIncognito) {
      addMessage({
        id: assistantMessageId,
        chat_id: chatId,
        role: 'assistant',
        content: sanitizedContent,
        reasoning: fullReasoning || null,
        stats,
        token_count: completionTokens,
      });
    }

    onEvent({ event: 'done', data: {} });
  } catch (err: any) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      // Stream stopped by user
      const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.05);
      const reasoningDurationSec = reasoningStartTime
        ? Math.max(1, Math.round(((reasoningEndTime || Date.now()) - reasoningStartTime) / 1000))
        : undefined;
      const stats = {
        tokensPerSecond: Number((generatedTokensCount / elapsedSec).toFixed(1)),
        completionTokens: generatedTokensCount,
        promptTokens: 0,
        reasoningDurationSec,
      };
      if (!isIncognito && (fullContent || fullReasoning)) {
        addMessage({
          id: assistantMessageId,
          chat_id: chatId,
          role: 'assistant',
          content: fullContent,
          reasoning: fullReasoning || null,
          stats,
          token_count: generatedTokensCount,
        });
      }
      onEvent({ event: 'done', data: { aborted: true } });
    } else {
      console.error('[Stream error]:', err);
      onEvent({ event: 'error', data: { code: 'STREAM_FAILED', message: err.message || 'Stream error' } });
      onEvent({ event: 'done', data: { error: true } });
    }
  } finally {
    activeStreams.delete(chatId);
  }
}
