import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveConfig } from '../config.js';
import { isLocalhost, classifyRequest } from '../auth.js';

function getDirectorySizeBytes(dir: string): number {
  let total = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirectorySizeBytes(fullPath);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          total += stat.size;
        }
      } catch {
        // ignore unreadable files
      }
    }
  } catch {
    // ignore
  }
  return total;
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/settings
  fastify.get('/', async (req) => {
    const { config } = loadConfig();
    const accessClass = classifyRequest(req);
    const isGuest = (req as any).userRole === 'guest';
    const usedBytes = getDirectorySizeBytes(config.workDir);
    const workUsedGB = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(1));
    const workModeAllowed = !isGuest && (accessClass !== 'proxied' || !!config.allowWorkOverTunnel);
    return {
      workModeEnabled: !isGuest && !!config.workModeEnabled,
      workQuotaGB: config.workQuotaGB || 5,
      workUsedGB,
      workDir: isGuest ? '' : config.workDir,
      listenHost: config.listenHost,
      port: config.port,
      accessClass,
      allowWorkOverTunnel: !!config.allowWorkOverTunnel,
      workModeAllowed,
    };
  });

  // PUT /api/settings
  fastify.put('/', async (req, reply) => {
    if ((req as any).userRole === 'guest') {
      return reply.status(403).send({ error: 'forbidden_guest', message: 'Доступно только в полном режиме' });
    }
    const { config } = loadConfig();
    const accessClass = classifyRequest(req);
    const isAllowed =
      accessClass === 'local' ||
      isLocalhost(req.ip) ||
      (accessClass === 'proxied' && !!config.allowAdminOverTunnel) ||
      (accessClass === 'lan' && !!config.allowAdminRemote);

    if (!isAllowed) {
      return reply.status(403).send({ error: 'Settings can only be changed on the host PC (localhost)' });
    }

    const body = (req.body as any) || {};

    if (typeof body.workModeEnabled === 'boolean') {
      config.workModeEnabled = body.workModeEnabled;
    }
    if (typeof body.workQuotaGB === 'number' && body.workQuotaGB > 0) {
      config.workQuotaGB = body.workQuotaGB;
    }
    if (typeof body.workDir === 'string' && body.workDir.trim()) {
      config.workDir = body.workDir.trim();
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

    saveConfig(config);
    return {
      ok: true,
      settings: {
        workModeEnabled: config.workModeEnabled,
        workQuotaGB: config.workQuotaGB,
        workDir: config.workDir,
      },
    };
  });
};
