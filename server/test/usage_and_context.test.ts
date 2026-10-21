import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { calculateVramEstimate } from '../src/models/process.js';
import {
  createChat,
  addMessage,
  getActiveMessages,
  getMessages,
  excludeMessages,
  unexcludeMessages,
  recordContextOp,
  getLastContextOp,
  deleteContextOp,
  deleteChat,
} from '../src/db.js';
import { chatsRoutes } from '../src/routes/chats.js';
import { usageRoutes } from '../src/routes/usage.js';
import type { ModelManager } from '../src/models/manager.js';

describe('VRAM estimation and Context Operations', () => {
  it('calculateVramEstimate computes placement and VRAM accurately', () => {
    // 14 GB model, 40 layers, 40 gpu layers, 16384 context, f16
    const estFull = calculateVramEstimate(14 * 1024 * 1024 * 1024, 40, 40, 16384, 'f16');
    expect(estFull.placement).toBe('GPU');
    expect(estFull.estimatedVramMB).toBeGreaterThan(14000);
    expect(estFull.kvCacheSizeMB).toBeGreaterThan(1000);

    // RAM placement (0 layers)
    const estRam = calculateVramEstimate(14 * 1024 * 1024 * 1024, 40, 0, 8192, 'f16');
    expect(estRam.placement).toBe('RAM');
    expect(estRam.estimatedVramMB).toBe(0);

    // Partial offload
    const estPartial = calculateVramEstimate(14 * 1024 * 1024 * 1024, 40, 20, 8192, 'f16');
    expect(estPartial.placement).toBe('GPU + RAM');
    expect(estPartial.estimatedVramMB).toBeGreaterThan(0);
    expect(estPartial.estimatedVramMB).toBeLessThan(estFull.estimatedVramMB);
  });

  describe('Database Context operations (clear, compact, undo)', () => {
    const testChatId = `test_chat_${Date.now()}`;

    beforeEach(() => {
      createChat({ id: testChatId, title: 'Context Test', mode: 'chat', model_id: 'test_model' });
      addMessage({ id: 'msg_1', chat_id: testChatId, role: 'user', content: 'Hello' });
      addMessage({ id: 'msg_2', chat_id: testChatId, role: 'assistant', content: 'Hi there!' });
      addMessage({ id: 'msg_3', chat_id: testChatId, role: 'user', content: 'Tell me more.' });
      addMessage({ id: 'msg_4', chat_id: testChatId, role: 'assistant', content: 'Sure thing!' });
    });

    afterEach(() => {
      deleteChat(testChatId);
    });

    it('active messages filter out excluded messages', () => {
      expect(getActiveMessages(testChatId).length).toBe(4);

      excludeMessages(testChatId, ['msg_1', 'msg_2']);
      expect(getActiveMessages(testChatId).length).toBe(2);
      expect(getMessages(testChatId, true).length).toBe(4);

      unexcludeMessages(testChatId, ['msg_1']);
      expect(getActiveMessages(testChatId).length).toBe(3);
    });

    it('records and retrieves context ops', () => {
      recordContextOp({
        id: 'op_1',
        chat_id: testChatId,
        kind: 'clear',
        message_ids: ['msg_1', 'msg_2'],
      });

      const lastOp = getLastContextOp(testChatId);
      expect(lastOp).toBeDefined();
      expect(lastOp?.kind).toBe('clear');
      expect(JSON.parse(lastOp!.message_ids)).toEqual(['msg_1', 'msg_2']);

      deleteContextOp('op_1');
      expect(getLastContextOp(testChatId)).toBeUndefined();
    });
  });

  describe('Fastify context REST endpoints', () => {
    let app: FastifyInstance;
    const testChatId = `test_chat_route_${Date.now()}`;

    const mockManager: ModelManager = {
      list: async () => [
        {
          id: 'test_model',
          name: 'Test Model',
          filePath: '/fake/path.gguf',
          sizeBytes: 8 * 1024 * 1024 * 1024,
          isLoaded: true,
          hasVision: false,
          status: 'loaded',
          contextTokens: 8192,
          gpuLayers: 99,
          role: 'main',
        },
      ],
      load: async () => {},
      unload: async () => {},
      ensureMain: async () => {},
      ensureAux: async () => {},
      unloadAux: async () => {},
      baseUrlFor: () => 'http://127.0.0.1:8888',
      getActiveModel: () => 'test_model',
      getActiveAuxModel: () => null,
      onProgress: () => () => {},
      dispose: async () => {},
    };

    beforeEach(async () => {
      createChat({ id: testChatId, title: 'Route Test', mode: 'chat', model_id: 'test_model' });
      addMessage({ id: 'm1', chat_id: testChatId, role: 'user', content: 'Turn 1' });
      addMessage({ id: 'm2', chat_id: testChatId, role: 'assistant', content: 'Resp 1' });
      addMessage({ id: 'm3', chat_id: testChatId, role: 'user', content: 'Turn 2' });
      addMessage({ id: 'm4', chat_id: testChatId, role: 'assistant', content: 'Resp 2' });

      app = Fastify();
      await app.register(cookie);
      await app.register(chatsRoutes(mockManager), { prefix: '/api/chats' });
      await app.register(usageRoutes(mockManager), { prefix: '/api/usage' });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
      deleteChat(testChatId);
    });

    it('POST /api/chats/:id/context/clear excludes all messages', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/chats/${testChatId}/context/clear`,
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.clearedCount).toBe(4);
      expect(getActiveMessages(testChatId).length).toBe(0);
    });

    it('POST /api/chats/:id/context/compact condenses older messages', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/chats/${testChatId}/context/compact`,
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.compactedCount).toBe(2);

      // 2 older excluded + 2 active remaining + 1 summary message
      const active = getActiveMessages(testChatId);
      expect(active.length).toBe(3);
      expect(active.some((m) => m.kind === 'summary')).toBe(true);
    });

    it('POST /api/chats/:id/context/undo rolls back previous context operation', async () => {
      // Clear first
      await app.inject({
        method: 'POST',
        url: `/api/chats/${testChatId}/context/clear`,
      });
      expect(getActiveMessages(testChatId).length).toBe(0);

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/api/chats/${testChatId}/context/undo`,
      });
      expect(undoRes.statusCode).toBe(200);
      const undoJson = JSON.parse(undoRes.payload);
      expect(undoJson.success).toBe(true);
      expect(undoJson.restoredCount).toBe(4);
      expect(getActiveMessages(testChatId).length).toBe(4);
    });
  });
});
