import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec } from 'node:child_process';
import QRCode from 'qrcode';

import { loadConfig, isConfigured, PROJECT_ROOT } from './config.js';
import { authHook, classifyRequest } from './auth.js';
import { hostCheckHook, originCheckHook, securityHeadersHook } from './security.js';
import { ProcessModelManager } from './models/process.js';
import { authRoutes } from './routes/auth.js';
import { modelsRoutes } from './routes/models.js';
import multipart from '@fastify/multipart';
import { chatsRoutes } from './routes/chats.js';
import { adminRoutes } from './routes/admin.js';
import { uploadsRoutes } from './routes/uploads.js';
import { workRoutes } from './routes/work.js';
import { settingsRoutes } from './routes/settings.js';
import { usageRoutes } from './routes/usage.js';
import { skillsRoutes } from './routes/skills.js';
import { setupRoutes } from './routes/setup.js';

import { setupLogRedaction } from './logger.js';
import { checkTailscaleFunnel } from './tailscale.js';

async function bootstrap() {
  setupLogRedaction();
  const { config, plainToken } = loadConfig();
  const fastify = Fastify({
    logger: false,
    bodyLimit: 100 * 1024 * 1024, // 100 MB
  });

  const modelManager = new ProcessModelManager(8888);

  // Setup plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(cookie);

  await fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB
    },
  });

  // Gracefully handle empty JSON body when content-type is application/json
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body: string, done) => {
    if (!body || !body.trim()) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Global browser defense & auth hooks
  fastify.addHook('onRequest', hostCheckHook);
  fastify.addHook('preHandler', originCheckHook);
  fastify.addHook('preHandler', authHook);
  fastify.addHook('onSend', securityHeadersHook);

  // Register API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(modelsRoutes(modelManager), { prefix: '/api/models' });
  await fastify.register(chatsRoutes(modelManager), { prefix: '/api/chats' });
  await fastify.register(adminRoutes(modelManager), { prefix: '/api/admin' });
  await fastify.register(uploadsRoutes, { prefix: '/api/uploads' });
  await fastify.register(workRoutes, { prefix: '/api/work' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });
  await fastify.register(usageRoutes(modelManager), { prefix: '/api/usage' });
  await fastify.register(skillsRoutes, { prefix: '/api/skills' });
  await fastify.register(setupRoutes, { prefix: '/api/setup' });

  // Serve /admin only to local connections, or serve client HTML with remote notice
  fastify.get('/admin', async (req, reply) => {
    const accessClass = classifyRequest(req);
    const clientDist = path.join(PROJECT_ROOT, 'client', 'dist');
    const isHtml = Boolean(req.headers.accept?.includes('text/html'));

    if (accessClass !== 'local') {
      if (isHtml && fs.existsSync(clientDist)) {
        return reply.sendFile('index.html');
      }
      return reply.status(403).type('application/json').send({
        error: 'admin_local_only',
        message: 'Доступ к настройкам возможен только с того компьютера, на котором запущен сервер.',
      });
    }
    if (fs.existsSync(clientDist)) {
      return reply.sendFile('index.html');
    }
    return reply.type('text/html').send('<!DOCTYPE html><html><body><h1>Admin Settings</h1></body></html>');
  });

  // Serve static client assets if built
  const clientDist = path.join(PROJECT_ROOT, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    await fastify.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: false,
    });

    fastify.setNotFoundHandler((req, reply) => {
      const url = req.raw.url || '';
      if (url.startsWith('/api/')) {
        reply.status(404).send({ error: 'Endpoint not found' });
      } else if (url === '/admin' || url.startsWith('/admin/') || url.startsWith('/admin?')) {
        const accessClass = classifyRequest(req);
        const isHtml = Boolean(req.headers.accept?.includes('text/html'));
        if (accessClass !== 'local') {
          if (isHtml) {
            reply.sendFile('index.html');
            return;
          }
          reply.status(403).type('application/json').send({
            error: 'admin_local_only',
            message: 'Доступ к настройкам возможен только с того компьютера, на котором запущен сервер.',
          });
          return;
        }
        reply.sendFile('index.html');
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Graceful shutdown
  const cleanup = async (sig: string) => {
    console.log(`\n[Server] Shutting down due to ${sig}...`);
    await modelManager.dispose();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));

  try {
    await fastify.listen({ port: config.port, host: config.listenHost });

    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    const preferredIp = ips.find((ip) => ip.startsWith('192.168.')) || ips[0] || '127.0.0.1';
    const connectUrl = plainToken
      ? `http://${preferredIp}:${config.port}/#token=${plainToken}`
      : `http://${preferredIp}:${config.port}/`;
    const adminUrl = `http://localhost:${config.port}/admin`;
    const pcUrl = plainToken
      ? `http://localhost:${config.port}/#token=${plainToken}`
      : `http://localhost:${config.port}`;

    console.log('\n======================================================');
    console.log(' rrchat Server');
    console.log('======================================================');

    if (!isConfigured()) {
      console.log(' Status:            [!] Initial setup required');
      console.log(` Setup Wizard:      http://localhost:${config.port}/setup`);
      console.log('------------------------------------------------------');
      console.log(' Opening browser for first-time configuration...');
      try {
        exec(`start http://localhost:${config.port}/setup`);
      } catch {}
      console.log('======================================================\n');
    } else {
      console.log(` Web UI on PC:      ${pcUrl}`);
      console.log(` Admin settings:    ${adminUrl}`);
      console.log(` Mobile (Wi-Fi):    ${connectUrl}`);
      if (plainToken) {
        console.log(` Access Token:      ${plainToken}`);
      }
      console.log('------------------------------------------------------');

      try {
        const qrTerminal = await QRCode.toString(connectUrl, { type: 'terminal', small: true });
        console.log(' Scan to open on mobile phone (Wi-Fi):\n');
        console.log(qrTerminal);
      } catch {
        // ignore terminal QR display errors
      }
      console.log('======================================================\n');
    }

    try {
      const funnel = await checkTailscaleFunnel();
      if (funnel.active) {
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.log(' [!] Server is exposed to the PUBLIC INTERNET via Tailscale Funnel');
        console.log(' [!] Work mode is DISABLED over tunnel by default');
        console.log(' [!] Make sure your access token is strong');
        if (funnel.funnelUrl && plainToken) {
          const funnelConnect = `${funnel.funnelUrl}/#token=${plainToken}`;
          console.log(` [!] Public Funnel URL: ${funnelConnect}`);
          try {
            const qrFunnel = await QRCode.toString(funnelConnect, { type: 'terminal', small: true });
            console.log('\n Scan to connect via Tailscale Funnel:\n');
            console.log(qrFunnel);
          } catch {
            // ignore
          }
        }
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
      }
    } catch {
      // ignore funnel detection errors
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
