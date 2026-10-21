import type { FastifyPluginAsync } from 'fastify';
import type { ModelManager, LoadEvent } from '../models/manager.js';
import { scanProjectors } from '../models/scanner.js';
import { loadConfig, saveConfig } from '../config.js';
import { requireAdminHook } from '../auth.js';

export const modelsRoutes = (manager: ModelManager): FastifyPluginAsync => {
  return async (fastify) => {
    fastify.get('/', async () => {
      const { config } = loadConfig();
      const list = await manager.list();
      const active = manager.getActiveModel();
      const activeAux = manager.getActiveAuxModel();
      const availableProjectors = scanProjectors(config.modelsDir);
      return {
        models: list,
        activeModelId: active,
        activeAuxModelId: config.activeAuxModelId || activeAux,
        availableProjectors,
      };
    });

    fastify.post('/:id/load', { preHandler: requireAdminHook }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body as any) || {};
      try {
        await manager.ensureMain(id, body);
        return { success: true, activeModelId: id };
      } catch (err: any) {
        return reply.status(500).send({ error: 'Load failed', message: err.message });
      }
    });

    fastify.post('/:id/unload', { preHandler: requireAdminHook }, async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        await manager.unload(id);
        return { success: true };
      } catch (err: any) {
        return reply.status(500).send({ error: 'Unload failed', message: err.message });
      }
    });

    fastify.post('/:id/load-aux', { preHandler: requireAdminHook }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body as any) || {};
      try {
        await manager.ensureAux(id, body);
        return { success: true, activeAuxModelId: id };
      } catch (err: any) {
        return reply.status(500).send({ error: 'Aux load failed', message: err.message });
      }
    });

    fastify.post('/unload-aux', { preHandler: requireAdminHook }, async (req, reply) => {
      try {
        await manager.unloadAux();
        return { success: true };
      } catch (err: any) {
        return reply.status(500).send({ error: 'Aux unload failed', message: err.message });
      }
    });

    fastify.put('/active-aux', { preHandler: requireAdminHook }, async (req, reply) => {
      const body = (req.body as any) || {};
      const { config } = loadConfig();
      config.activeAuxModelId = body.modelId || undefined;
      saveConfig(config);
      return { success: true, activeAuxModelId: config.activeAuxModelId };
    });

    fastify.get('/events', async (req, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const pingTimer = setInterval(() => {
        try {
          if (!reply.raw.destroyed && reply.raw.writable) {
            reply.raw.write(': ping\n\n');
          }
        } catch {
          // ignore
        }
      }, 15000);

      const sendEvent = (event: LoadEvent) => {
        try {
          if (!reply.raw.destroyed && reply.raw.writable) {
            reply.raw.write(`event: model_progress\ndata: ${JSON.stringify(event)}\n\n`);
          }
        } catch {
          // ignore
        }
      };

      const unsubscribe = manager.onProgress(sendEvent);

      req.raw.on('close', () => {
        clearInterval(pingTimer);
        unsubscribe();
      });
    });

    fastify.get('/:id/settings', async (req) => {
      const { id } = req.params as { id: string };
      const { config } = loadConfig();
      return config.modelSettings[id] || {};
    });

    fastify.put('/:id/settings', { preHandler: requireAdminHook }, async (req) => {
      const { id } = req.params as { id: string };
      const body = (req.body as any) || {};
      const { config } = loadConfig();

      const existing = config.modelSettings[id] || {};
      const updated = {
        ...existing,
        ...body,
      };

      if (body.role) {
        updated.role = body.role;
        updated.userRole = body.role;
      }

      config.modelSettings[id] = updated;
      saveConfig(config);
      return { success: true, settings: config.modelSettings[id] };
    });

    fastify.get('/:id/estimate', async (req, reply) => {
      const { id } = req.params as { id: string };
      const query = (req.query as any) || {};
      const list = await manager.list();
      const model = list.find((m) => m.id === id);
      if (!model) {
        return reply.status(404).send({ error: 'Model not found' });
      }

      const { config } = loadConfig();
      const settings = config.modelSettings[id] || {};
      const gpuLayers = query.gpuLayers !== undefined ? parseInt(query.gpuLayers, 10) : (settings.gpuLayers ?? 99);
      const contextTokens = query.contextTokens !== undefined ? parseInt(query.contextTokens, 10) : (settings.contextTokens ?? 8192);
      const kvCacheType = query.kvCacheType || settings.kvCacheType || 'f16';

      const { calculateVramEstimate } = await import('../models/process.js');
      const est = calculateVramEstimate(
        model.sizeBytes,
        model.layersCount,
        gpuLayers,
        contextTokens,
        kvCacheType,
        settings.calibratedVramMB
      );

      return {
        id,
        gpuLayers,
        contextTokens,
        kvCacheType,
        totalLayers: model.layersCount || 32,
        placement: est.placement,
        kvCacheSizeMB: est.kvCacheSizeMB,
        estimatedVramMB: est.estimatedVramMB,
        estimatedVramGB: Number((est.estimatedVramMB / 1024).toFixed(1)),
      };
    });
  };
};
