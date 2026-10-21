import type { FastifyPluginAsync } from 'fastify';
import type { ModelManager } from '../models/manager.js';
import {
  getChats,
  getChatById,
  createChat,
  updateChat,
  deleteChat,
  getMessages,
  getActiveMessages,
  addMessage,
  updateMessage,
  deleteMessagesAfter,
  deleteMessage,
  excludeMessages,
  unexcludeMessages,
  recordContextOp,
  getLastContextOp,
  deleteContextOp,
} from '../db.js';
import { handleChatStream, abortStream } from '../chat/stream.js';
import { classifyRequest } from '../auth.js';
import { loadConfig } from '../config.js';

function checkChatAccess(req: any, id: string): { ok: boolean; status: number; error: string; chat?: any } {
  const chat = getChatById(id);
  if (!chat) {
    return { ok: false, status: 404, error: 'Chat not found' };
  }
  const role = req.userRole;
  const sessionHash = req.sessionHash;
  if (role === 'guest' && chat.guest_session_id !== sessionHash) {
    return { ok: false, status: 404, error: 'Chat not found' };
  }
  if (role !== 'guest' && chat.guest_session_id) {
    return { ok: false, status: 404, error: 'Chat not found' };
  }
  return { ok: true, status: 200, error: '', chat };
}

export const chatsRoutes = (manager: ModelManager): FastifyPluginAsync => {
  return async (fastify) => {
    // List chats
    fastify.get('/', async (req) => {
      const role = (req as any).userRole;
      const sessionHash = (req as any).sessionHash;
      if (role === 'guest') {
        return getChats(sessionHash);
      }
      return getChats(null);
    });

    // Create chat
    fastify.post('/', async (req, reply) => {
      const role = (req as any).userRole;
      const sessionHash = (req as any).sessionHash;
      const isGuest = role === 'guest';
      const body = (req.body as any) || {};
      const id = body.id || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const title = body.title || 'Новый чат';
      const mode = isGuest ? 'chat' : (body.mode || 'chat');
      const modelId = body.model_id || manager.getActiveModel() || '';

      if (!isGuest && mode === 'work') {
        const accessClass = classifyRequest(req);
        const { config } = loadConfig();
        if (accessClass === 'proxied' && !config.allowWorkOverTunnel) {
          return reply.status(403).send({
            error: 'work_mode_unavailable_over_tunnel',
            message: 'Режим work доступен только по Wi-Fi или локально. Чтобы включить через интернет, активируйте туннельный доступ в настройках на ПК.',
          });
        }
      }

      const chat = createChat({
        id,
        title,
        mode,
        model_id: modelId,
        guest_session_id: isGuest ? sessionHash : null,
      });
      return chat;
    });

    // Get chat details and messages
    fastify.get('/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      const messages = getMessages(id);
      return { chat: access.chat, messages };
    });

    // Update chat
    fastify.patch('/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }

      const body = (req.body as any) || {};
      if ((req as any).userRole === 'guest' && body.mode === 'work') {
        return reply.status(403).send({
          error: 'forbidden_guest',
          message: 'Доступно только в полном режиме',
        });
      }

      if (body.mode === 'work') {
        const accessClass = classifyRequest(req);
        const { config } = loadConfig();
        if (accessClass === 'proxied' && !config.allowWorkOverTunnel) {
          return reply.status(403).send({
            error: 'work_mode_unavailable_over_tunnel',
            message: 'Режим work доступен только по Wi-Fi или локально. Чтобы включить через интернет, активируйте туннельный доступ в настройках на ПК.',
          });
        }
      }

      updateChat(id, body);
      return { ok: true };
    });

    // Delete chat
    fastify.delete('/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      deleteChat(id);
      return { ok: true };
    });

    // Add message
    fastify.post('/:id/messages', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }

      const body = (req.body as any) || {};
      const msgId = body.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const msg = addMessage({
        id: msgId,
        chat_id: id,
        role: body.role,
        content: body.content,
        reasoning: body.reasoning,
        attachments: body.attachments,
        stats: body.stats,
      });
      return msg;
    });

    // Edit message & optionally truncate subsequent messages
    fastify.patch('/messages/:messageId', async (req, reply) => {
      const { messageId } = req.params as { messageId: string };
      const body = (req.body as any) || {};
      const { content, reasoning, truncateAfter, chatId, timestamp } = body;

      if (chatId) {
        const access = checkChatAccess(req, chatId);
        if (!access.ok) {
          return reply.status(access.status).send({ error: access.error });
        }
      }

      updateMessage(messageId, content, reasoning);

      if (truncateAfter && chatId && timestamp) {
        deleteMessagesAfter(chatId, timestamp);
      }

      return { ok: true };
    });

    // Delete single message
    fastify.delete('/:id/messages/:messageId', async (req, reply) => {
      const { id, messageId } = req.params as { id: string; messageId: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      deleteMessage(id, messageId);
      return { ok: true };
    });

    // Stream completions SSE
    fastify.post('/:id/stream', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      const chat = access.chat;

      const body = (req.body as any) || {};
      const {
        assistantMessageId,
        modelId,
        messages,
        isIncognito,
        reasoningEffort,
        enableReasoning,
        mode,
        webSearch,
        visionMode,
        temperature,
        topP,
        minP,
        repeatPenalty,
        chatSystemPrompt,
        autoCompact,
      } = body;

      if (!assistantMessageId || !modelId || !Array.isArray(messages)) {
        return reply.status(400).send({ error: 'Invalid stream request parameters' });
      }

      const isGuest = (req as any).userRole === 'guest';
      const effectiveMode = isGuest ? 'chat' : (mode || chat?.mode || 'chat');
      const accessClass = classifyRequest(req);
      const { config } = loadConfig();

      if (effectiveMode === 'work' && accessClass === 'proxied' && !config.allowWorkOverTunnel) {
        return reply.status(403).send({
          error: 'work_mode_unavailable_over_tunnel',
          message: 'Режим work доступен только по Wi-Fi или локально. Чтобы включить через интернет, активируйте туннельный доступ в настройках на ПК.',
        });
      }

      if (effectiveMode === 'work' && chat && chat.mode !== 'work') {
        updateChat(id, { mode: 'work' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const clientAbortController = new AbortController();
      let streamFinished = false;

      const pingTimer = setInterval(() => {
        try {
          if (!reply.raw.destroyed && reply.raw.writable && !streamFinished) {
            reply.raw.write(': ping\n\n');
          }
        } catch {
          // ignore write errors
        }
      }, 15000);

      req.raw.on('close', () => {
        clearInterval(pingTimer);
        if (!streamFinished) {
          console.log('client disconnected, command aborted');
          clientAbortController.abort();
          abortStream(id);
        }
      });

      const sendSse = (event: string, data: any) => {
        try {
          if (!reply.raw.destroyed && reply.raw.writable && !streamFinished) {
            reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        } catch {
          // Client disconnected or backgrounded, ignore socket write error
        }
      };

      try {
        await handleChatStream(manager, {
          chatId: id,
          assistantMessageId,
          modelId,
          messages,
          isIncognito: !!isIncognito,
          mode: effectiveMode,
          reasoningEffort,
          enableReasoning,
          temperature: typeof temperature === 'number' ? temperature : undefined,
          topP: typeof topP === 'number' ? topP : undefined,
          minP: typeof minP === 'number' ? minP : undefined,
          repeatPenalty: typeof repeatPenalty === 'number' ? repeatPenalty : undefined,
          chatSystemPrompt: typeof chatSystemPrompt === 'string' ? chatSystemPrompt : undefined,
          autoCompact: autoCompact !== false,
          webSearch: !!webSearch,
          visionMode: visionMode as 'ocr' | 'vision' | undefined,
          signal: clientAbortController.signal,
          accessClass,
          sessionId: req.cookies.rr_session,
          onEvent: (e) => {
            sendSse(e.event, e.data);
          },
        });
      } catch (err: any) {
        console.error('[Chats] Stream route unhandled exception:', err);
        sendSse('error', { code: 'STREAM_FAILED', message: err.message || 'Stream processing failed' });
        sendSse('done', { error: true });
      } finally {
        streamFinished = true;
        clearInterval(pingTimer);
        try {
          if (!reply.raw.destroyed && reply.raw.writable) {
            reply.raw.end();
          }
        } catch {
          // ignore
        }
      }
    });

    // Stop generation
    fastify.post('/:id/stop', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      const stopped = abortStream(id);
      return { ok: true, stopped };
    });

    // Clear context (exclude all active messages)
    fastify.post('/:id/context/clear', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      const activeMsgs = getActiveMessages(id);
      const msgIds = activeMsgs.map((m) => m.id);
      if (msgIds.length > 0) {
        excludeMessages(id, msgIds);
        recordContextOp({
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          chat_id: id,
          kind: 'clear',
          message_ids: msgIds,
        });
      }
      return { success: true, clearedCount: msgIds.length };
    });

    // Compact context (summarize or exclude older messages)
    fastify.post('/:id/context/compact', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      const activeMsgs = getActiveMessages(id);
      if (activeMsgs.length <= 2) {
        return { success: false, message: 'Too few messages to compact' };
      }

      // Keep the latest 2 messages active, exclude the rest
      const toExclude = activeMsgs.slice(0, activeMsgs.length - 2);
      const toExcludeIds = toExclude.map((m) => m.id);

      excludeMessages(id, toExcludeIds);

      // Add a concise marker message
      const markerId = `msg_summary_${Date.now()}`;
      addMessage({
        id: markerId,
        chat_id: id,
        role: 'system',
        content: `[Context compacted: ${toExclude.length} previous messages condensed]`,
        kind: 'summary',
      });

      recordContextOp({
        id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        chat_id: id,
        kind: 'compact',
        message_ids: [...toExcludeIds, markerId],
      });

      return { success: true, compactedCount: toExclude.length };
    });

    // Undo last context op
    fastify.post('/:id/context/undo', async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = checkChatAccess(req, id);
      if (!access.ok) {
        return reply.status(access.status).send({ error: access.error });
      }
      const lastOp = getLastContextOp(id);
      if (!lastOp) {
        return reply.status(400).send({ error: 'No context operations to undo' });
      }

      let ids: string[] = [];
      try {
        ids = JSON.parse(lastOp.message_ids);
      } catch {
        ids = [];
      }

      if (lastOp.kind === 'compact') {
        // The last item was the summary marker message
        const markerId = ids[ids.length - 1];
        if (markerId && markerId.startsWith('msg_summary_')) {
          deleteMessagesAfter(id, 0); // or delete specific message
          const { db } = await import('../db.js');
          db.prepare('DELETE FROM messages WHERE id = ?').run(markerId);
          ids = ids.slice(0, ids.length - 1);
        }
      }

      unexcludeMessages(id, ids);
      deleteContextOp(lastOp.id);

      return { success: true, restoredCount: ids.length, kind: lastOp.kind };
    });
  };
};
