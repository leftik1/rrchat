import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { resolveInsideWorkDir, SandboxError } from '../agent/sandbox.js';
import { handleApprovalResponse, getPendingApprovals } from '../agent/approvals.js';
import { classifyRequest } from '../auth.js';

const DANGEROUS_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.svg',
  '.js',
  '.mjs',
  '.cjs',
  '.xml',
  '.xhtml',
  '.wasm',
  '.php',
  '.sh',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
]);

export const workRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if work mode is allowed (tunnel protection and enable toggle)
  fastify.addHook('preHandler', async (req, reply) => {
    if ((req as any).userRole === 'guest') {
      return reply.status(403).send({
        error: 'forbidden_guest',
        message: 'Доступно только в полном режиме',
      });
    }

    const accessClass = classifyRequest(req);
    const { config } = loadConfig();
    if (accessClass === 'proxied' && !config.allowWorkOverTunnel) {
      return reply.status(403).send({
        error: 'work_mode_unavailable_over_tunnel',
        message: 'Режим work доступен только по Wi-Fi или локально. Чтобы включить через интернет, активируйте туннельный доступ в настройках на ПК.',
      });
    }

    if (!config.workModeEnabled && req.url.startsWith('/api/work/files')) {
      return reply.status(403).send({ error: 'Режим Work выключен в настройках сервера.' });
    }
  });

  // GET /api/work/files?path=
  fastify.get('/files', async (req, reply) => {
    const { config } = loadConfig();
    const query = req.query as { path?: string };
    const userPath = query.path || '.';

    try {
      const { resolvedPath, relativePath } = resolveInsideWorkDir(config.workDir, userPath);
      if (!fs.existsSync(resolvedPath)) {
        return reply.status(404).send({ error: 'Path not found' });
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return reply.status(400).send({ error: 'Path is a file, not a directory' });
      }

      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const items = entries.map((entry) => {
        const itemFull = path.join(resolvedPath, entry.name);
        try {
          const s = fs.statSync(itemFull);
          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: s.size,
            mtime: s.mtimeMs,
          };
        } catch {
          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: 0,
            mtime: 0,
          };
        }
      });

      return {
        current: relativePath,
        items,
      };
    } catch (err: any) {
      if (err instanceof SandboxError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/work/download?path=
  fastify.get('/download', async (req, reply) => {
    const { config } = loadConfig();
    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.status(400).send({ error: "Missing 'path' query parameter" });
    }

    try {
      const { resolvedPath } = resolveInsideWorkDir(config.workDir, query.path);
      if (!fs.existsSync(resolvedPath)) {
        return reply.status(404).send({ error: 'File not found' });
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return reply.status(400).send({ error: 'Cannot download a directory' });
      }

      const filename = path.basename(resolvedPath);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      reply.header('Content-Security-Policy', 'sandbox');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(fs.createReadStream(resolvedPath));
    } catch (err: any) {
      if (err instanceof SandboxError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/work/view?path=
  // Streams file with proper MIME type and sandboxed security headers for previewing images, PDF, text
  // Executable / scriptable types (HTML, SVG, JS, XML) are forced to attachment download
  fastify.get('/view', async (req, reply) => {
    const { config } = loadConfig();
    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.status(400).send({ error: "Missing 'path' query parameter" });
    }

    try {
      const { resolvedPath } = resolveInsideWorkDir(config.workDir, query.path);
      if (!fs.existsSync(resolvedPath)) {
        return reply.status(404).send({ error: 'File not found' });
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return reply.status(400).send({ error: 'Cannot view a directory' });
      }

      const filename = path.basename(resolvedPath);
      const ext = path.extname(resolvedPath).toLowerCase();
      const isDangerous = DANGEROUS_EXTENSIONS.has(ext);

      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.htm': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
        '.md': 'text/plain; charset=utf-8',
        '.ts': 'text/plain; charset=utf-8',
        '.tsx': 'text/plain; charset=utf-8',
        '.py': 'text/plain; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';
      reply.header('Content-Type', contentType);
      reply.header('Content-Security-Policy', 'sandbox');
      reply.header('X-Content-Type-Options', 'nosniff');

      if (isDangerous) {
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      } else {
        reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      }

      return reply.send(fs.createReadStream(resolvedPath));
    } catch (err: any) {
      if (err instanceof SandboxError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/work/content?path=
  // Reads file as text for client code/text inspection
  fastify.get('/content', async (req, reply) => {
    const { config } = loadConfig();
    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.status(400).send({ error: "Missing 'path' query parameter" });
    }

    try {
      const { resolvedPath, relativePath } = resolveInsideWorkDir(config.workDir, query.path);
      if (!fs.existsSync(resolvedPath)) {
        return reply.status(404).send({ error: 'File not found' });
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return reply.status(400).send({ error: 'Path is a directory' });
      }

      if (stat.size > 2 * 1024 * 1024) {
        return reply.status(400).send({ error: 'File is too large for text preview (limit 2 MB)' });
      }

      const fd = fs.openSync(resolvedPath, 'r');
      const sample = Buffer.alloc(Math.min(1024, stat.size));
      fs.readSync(fd, sample, 0, sample.length, 0);
      fs.closeSync(fd);

      const isBinary = sample.includes(0);
      if (isBinary) {
        return { relativePath, filename: path.basename(resolvedPath), size: stat.size, isBinary: true, content: '' };
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return { relativePath, filename: path.basename(resolvedPath), size: stat.size, isBinary: false, content };
    } catch (err: any) {
      if (err instanceof SandboxError) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/work/approve - Respond to tool approval request (e.g. delete_path or run_command)
  fastify.post('/approve', async (req, reply) => {
    const body = (req.body as any) || {};
    const { approvalId, approvalToken, approved, rememberForChat } = body;

    if (!approvalId || typeof approved !== 'boolean') {
      return reply.status(400).send({ error: 'Invalid approval parameters' });
    }

    const accessClass = classifyRequest(req);
    const result = handleApprovalResponse({
      approvalId,
      approvalToken,
      approved,
      rememberForChat: accessClass === 'proxied' ? false : !!rememberForChat,
      accessClass,
    });

    if (typeof result === 'object' && !result.ok) {
      return reply.status(400).send({ error: result.error, message: result.message });
    }

    return { ok: true, handled: true };
  });

  // GET /api/work/approvals - List pending approvals
  fastify.get('/approvals', async () => {
    return getPendingApprovals();
  });
};
