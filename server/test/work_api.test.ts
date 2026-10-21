import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig } from '../src/config.js';
import { workRoutes } from '../src/routes/work.js';
import { settingsRoutes } from '../src/routes/settings.js';
import { registerApproval } from '../src/agent/approvals.js';

describe('Work Mode REST API', () => {
  let app: FastifyInstance;
  let testWorkDir: string;
  let suiteInitialConfig: any;

  beforeAll(() => {
    const { config } = loadConfig();
    suiteInitialConfig = JSON.parse(JSON.stringify(config));
  });

  afterAll(() => {
    if (suiteInitialConfig) {
      saveConfig(suiteInitialConfig);
    }
  });

  beforeEach(async () => {
    testWorkDir = path.join(os.tmpdir(), `test_work_api_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(testWorkDir, { recursive: true });

    const { config } = loadConfig();
    config.workDir = testWorkDir;
    config.workModeEnabled = false;
    config.workQuotaGB = 5;
    saveConfig(config);

    app = Fastify();
    await app.register(cookie);
    await app.register(workRoutes, { prefix: '/api/work' });
    await app.register(settingsRoutes, { prefix: '/api/settings' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (fs.existsSync(testWorkDir)) {
      try {
        fs.rmSync(testWorkDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('GET /api/settings returns workModeEnabled and workDir', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.workModeEnabled).toBe(false);
    expect(json.workDir).toBe(testWorkDir);
  });

  it('GET /api/work/files returns 403 when workModeEnabled is false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/work/files',
    });
    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.payload);
    expect(json.error).toContain('Режим Work выключен');
  });

  it('GET /api/work/files lists files when workModeEnabled is true', async () => {
    const { config } = loadConfig();
    config.workModeEnabled = true;
    saveConfig(config);

    fs.writeFileSync(path.join(testWorkDir, 'sample.txt'), 'hello world');

    const res = await app.inject({
      method: 'GET',
      url: '/api/work/files',
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.items.some((i: any) => i.name === 'sample.txt')).toBe(true);
  });

  it('GET /api/work/files rejects path traversal with 403', async () => {
    const { config } = loadConfig();
    config.workModeEnabled = true;
    saveConfig(config);

    const res = await app.inject({
      method: 'GET',
      url: '/api/work/files?path=../etc',
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/work/download downloads a file safely', async () => {
    const { config } = loadConfig();
    config.workModeEnabled = true;
    saveConfig(config);

    fs.writeFileSync(path.join(testWorkDir, 'download.txt'), 'file content for download');

    const res = await app.inject({
      method: 'GET',
      url: '/api/work/download?path=download.txt',
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe('file content for download');
  });

  it('POST /api/work/approve handles tool approval', async () => {
    const { id, promise } = registerApproval('chat1', 'delete_path', { path: 'file.txt' }, 'Confirm delete');

    const approveRes = await app.inject({
      method: 'POST',
      url: '/api/work/approve',
      payload: { approvalId: id, approved: true },
    });

    expect(approveRes.statusCode).toBe(200);
    const result = await promise;
    expect(result).toBe(true);
  });

  it('GET /api/work/view streams file with sandboxed CSP and correct content-type', async () => {
    const { config } = loadConfig();
    config.workModeEnabled = true;
    saveConfig(config);

    fs.writeFileSync(path.join(testWorkDir, 'index.html'), '<h1>Hello Sneaker Shop</h1>');

    const res = await app.inject({
      method: 'GET',
      url: '/api/work/view?path=index.html',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.payload).toContain('<h1>Hello Sneaker Shop</h1>');
  });

  it('GET /api/work/content returns JSON with text and line metrics', async () => {
    const { config } = loadConfig();
    config.workModeEnabled = true;
    saveConfig(config);

    fs.writeFileSync(path.join(testWorkDir, 'app.js'), 'console.log("test");');

    const res = await app.inject({
      method: 'GET',
      url: '/api/work/content?path=app.js',
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.filename).toBe('app.js');
    expect(json.isBinary).toBe(false);
    expect(json.content).toBe('console.log("test");');
  });
});
