import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from '../src/routes/auth.js';
import { chatsRoutes } from '../src/routes/chats.js';
import { adminRoutes } from '../src/routes/admin.js';
import { workRoutes } from '../src/routes/work.js';
import { hostCheckHook, originCheckHook, securityHeadersHook } from '../src/security.js';
import { authHook, createSession, classifyRequest, resetRateLimit } from '../src/auth.js';
import { loadConfig, saveConfig, hashToken } from '../src/config.js';

describe('Security Hardening Test Suite (11 Checks)', () => {
  let app: FastifyInstance;
  const TEST_TOKEN = 'test_secret_token_1234567890abcdefghijklmnopqrstuvwxyz';
  let initialConfig: any;

  beforeAll(async () => {
    const { config } = loadConfig();
    initialConfig = JSON.parse(JSON.stringify(config));
    config.accessTokenHash = hashToken(TEST_TOKEN);
    config.allowWorkOverTunnel = false;
    config.workModeEnabled = true;
    config.port = 3000;
    saveConfig(config);

    app = Fastify();
    await app.register(cookie);

    app.addHook('onRequest', hostCheckHook);
    app.addHook('preHandler', originCheckHook);
    app.addHook('preHandler', authHook);
    app.addHook('onSend', securityHeadersHook);

    const dummyManager: any = {
      getActiveModel: () => 'model1',
      list: async () => [{ id: 'model1', name: 'Model 1', role: 'main' }],
      ensureMain: async () => {},
      baseUrlFor: () => 'http://127.0.0.1:8888',
    };

    await app.register(authRoutes, { prefix: '/api/auth' });
    await app.register(chatsRoutes(dummyManager), { prefix: '/api/chats' });
    await app.register(adminRoutes(dummyManager), { prefix: '/api/admin' });
    await app.register(workRoutes, { prefix: '/api/work' });

    await app.ready();
  });

  afterAll(async () => {
    if (initialConfig) {
      saveConfig(initialConfig);
    }
    await app.close();
  });

  // 1. Login with valid token -> 200, cookie set
  it('1. Login with valid token -> 200, sets rr_session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      payload: { token: TEST_TOKEN },
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('rr_session=');
    expect(String(setCookie)).toContain('HttpOnly');
    expect(String(setCookie)).toContain('SameSite=Strict');
  });

  // 2. Login with invalid token -> 401
  it('2. Login with invalid token -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      payload: { token: 'wrong-token-abc' },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.payload);
    expect(json.error).toBe('Invalid token');
  });

  // 3. Brute-force login -> 429 after 5 failed attempts, Retry-After
  it('3. Brute-force login -> 429 after 5 attempts with Retry-After', async () => {
    const bruteIp = '10.99.88.77';
    resetRateLimit(bruteIp);

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: bruteIp,
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
        payload: { token: 'bad-password' },
      });
    }

    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: bruteIp,
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      payload: { token: 'bad-password' },
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThan(0);
  });

  // 4. Request to /api/chats without session cookie -> 401
  it('4. Request to /api/chats without cookie -> 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/chats',
      headers: { host: 'localhost:3000' },
    });

    expect(res.statusCode).toBe(401);
  });

  // 5. Request to /api/chats with valid session -> 200
  it('5. Request to /api/chats with valid session cookie -> 200', async () => {
    const sid = createSession('TestAgent', 'local');
    const res = await app.inject({
      method: 'GET',
      url: '/api/chats',
      headers: {
        host: 'localhost:3000',
        cookie: `rr_session=${sid}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload))).toBe(true);
  });

  // 6. Request classification
  it('6. Request classification: local, lan, and proxied', () => {
    const reqLocal: any = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost:3000' },
    };
    expect(classifyRequest(reqLocal)).toBe('local');

    const reqLan: any = {
      socket: { remoteAddress: '192.168.1.105' },
      headers: { host: '192.168.1.105:3000' },
    };
    expect(classifyRequest(reqLan)).toBe('lan');

    const reqProxied: any = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        host: 'my-funnel.ts.net',
        'x-forwarded-for': '203.0.113.195',
      },
    };
    expect(classifyRequest(reqProxied)).toBe('proxied');
  });

  // 7. Admin endpoint from lan/proxied -> 403 admin_local_only
  it('7. Admin endpoint from lan or proxied -> 403 admin_local_only', async () => {
    const sid = createSession('TestAgent', 'lan');
    const resLan = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      remoteAddress: '192.168.1.55',
      headers: {
        host: '192.168.1.55:3000',
        cookie: `rr_session=${sid}`,
      },
    });

    expect(resLan.statusCode).toBe(403);
    const jsonLan = JSON.parse(resLan.payload);
    expect(jsonLan.error).toBe('admin_local_only');

    const resProxied = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      remoteAddress: '127.0.0.1',
      headers: {
        host: 'tunnel.ts.net',
        'x-forwarded-for': '198.51.100.1',
        cookie: `rr_session=${sid}`,
      },
    });

    expect(resProxied.statusCode).toBe(403);
    const jsonProxied = JSON.parse(resProxied.payload);
    expect(jsonProxied.error).toBe('admin_local_only');
  });

  // 8. Admin endpoint from localhost -> 200
  it('8. Admin endpoint from localhost -> 200', async () => {
    const sid = createSession('LocalAgent', 'local');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      remoteAddress: '127.0.0.1',
      headers: {
        host: 'localhost:3000',
        cookie: `rr_session=${sid}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.os).toBeDefined();
    expect(json.cpu).toBeDefined();
  });

  it('8b. Admin endpoint with allowAdminOverTunnel: true -> 200', async () => {
    const { config } = loadConfig();
    config.allowAdminOverTunnel = true;
    saveConfig(config);

    const sid = createSession('TunnelAdmin', 'proxied', 'admin');
    const resProxied = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      remoteAddress: '127.0.0.1',
      headers: {
        host: 'my-funnel.ts.net',
        'x-forwarded-proto': 'https',
        cookie: `rr_session=${sid}`,
      },
    });

    expect(resProxied.statusCode).toBe(200);

    config.allowAdminOverTunnel = false;
    saveConfig(config);
  });

  // 9. DNS rebinding: Host evil.com -> 403
  it('9. DNS rebinding protection: Host evil.com -> 403', async () => {
    const sid = createSession('LocalAgent', 'local');
    const res = await app.inject({
      method: 'GET',
      url: '/api/chats',
      remoteAddress: '127.0.0.1',
      headers: {
        host: 'evil.com',
        cookie: `rr_session=${sid}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.payload);
    expect(json.error).toBe('invalid_host_header');
  });

  // 10. CSRF: POST /api/chats with Origin https://evil.com -> 403
  it('10. CSRF protection: POST /api/chats with untrusted Origin -> 403', async () => {
    const sid = createSession('LocalAgent', 'local');
    const res = await app.inject({
      method: 'POST',
      url: '/api/chats',
      remoteAddress: '127.0.0.1',
      headers: {
        host: 'localhost:3000',
        origin: 'https://evil.com',
        cookie: `rr_session=${sid}`,
      },
      payload: { title: 'CSRF Chat' },
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.payload);
    expect(json.error).toBe('origin_mismatch');
  });

  // 11. Work mode over tunnel -> 403 when tunnel work is disabled
  it('11. Work mode over tunnel -> 403 when allowWorkOverTunnel is false', async () => {
    const sid = createSession('TunnelUser', 'proxied');
    const res = await app.inject({
      method: 'POST',
      url: '/api/chats',
      remoteAddress: '127.0.0.1',
      headers: {
        host: 'my-tunnel.ts.net',
        origin: 'https://my-tunnel.ts.net',
        'x-forwarded-for': '203.0.113.88',
        cookie: `rr_session=${sid}`,
      },
      payload: { title: 'Tunnel Work Chat', mode: 'work' },
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.payload);
    expect(json.error).toBe('work_mode_unavailable_over_tunnel');
  });
});
