import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import {
  loadConfig,
  saveConfig,
  isConfigured,
  PROJECT_ROOT,
  TOKEN_FILE_PATH,
  setPlainToken,
  generateToken,
  hashToken,
  type AppConfig,
} from '../config.js';
import { classifyRequest } from '../auth.js';

const execAsync = promisify(exec);

// Execute PowerShell with Base64 EncodedCommand to guarantee zero quote/escaping issues
function runPowershell(script: string): Promise<string> {
  return new Promise((resolve) => {
    const fullScript = `$ProgressPreference = 'SilentlyContinue'; ${script}`;
    const enc = Buffer.from(fullScript, 'utf16le').toString('base64');
    exec(`powershell.exe -NoProfile -STA -EncodedCommand ${enc}`, { timeout: 60000 }, (err, stdout) => {
      if (err) return resolve('');
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => Boolean(l) && !l.startsWith('<') && !l.startsWith('#<'));
      resolve(lines[lines.length - 1] || '');
    });
  });
}

function scanGgufFiles(dirPath: string): { count: number; models: string[] } {
  if (!dirPath || !fs.existsSync(dirPath)) return { count: 0, models: [] };
  const models: string[] = [];

  function scan(dir: string, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
          // Skip secondary parts of split models like model-00002-of-00004.gguf
          if (/-\d{5}-of-\d{5}\.gguf$/i.test(entry.name) && !entry.name.includes('-00001-of-')) {
            continue;
          }
          models.push(entry.name);
        }
      }
    } catch {
      // ignore
    }
  }

  scan(dirPath);
  return { count: models.length, models: models.slice(0, 10) };
}

async function detectNvidiaGpu(): Promise<{ hasNvidia: boolean; name: string | null }> {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name --format=csv,noheader',
      { timeout: 3000 }
    );
    const line = stdout.trim().split('\n')[0];
    if (line && line.trim()) {
      return { hasNvidia: true, name: line.trim() };
    }
    return { hasNvidia: false, name: null };
  } catch {
    return { hasNvidia: false, name: null };
  }
}

function findExistingLlamaServer(): string | null {
  const candidates = [
    path.join(PROJECT_ROOT, 'bin', 'llama-server.exe'),
    path.join(PROJECT_ROOT, '..', 'build', 'bin', 'llama-server.exe'),
    path.join(PROJECT_ROOT, '..', 'llama-server.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return path.resolve(c);
    }
  }
  return null;
}

export const setupRoutes: FastifyPluginAsync = async (fastify) => {
  // Check setup status & hardware detection
  fastify.get('/status', async (req) => {
    const access = classifyRequest(req);
    const configured = isConfigured();
    const gpu = await detectNvidiaGpu();
    const detectedLlama = findExistingLlamaServer();

    const defaultModelsPath = path.resolve(PROJECT_ROOT, '..', 'models');
    const defaultWorkPath = path.resolve(PROJECT_ROOT, '..', 'ai-work');

    const defaultModelsScan = scanGgufFiles(defaultModelsPath);

    return {
      isConfigured: configured,
      isLocal: access === 'local',
      detectedLlamaPath: detectedLlama,
      defaultModelsPath: fs.existsSync(defaultModelsPath) ? defaultModelsPath : path.join(PROJECT_ROOT, 'models'),
      defaultWorkPath: defaultWorkPath,
      defaultModelsCount: defaultModelsScan.count,
      gpu,
    };
  });

  // Native Windows File Dialog (select llama-server.exe)
  fastify.post('/browse-file', async (req, reply) => {
    const access = classifyRequest(req);
    if (access !== 'local') {
      return reply.status(403).send({ error: 'local_only' });
    }

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $dialog = New-Object System.Windows.Forms.OpenFileDialog
      $dialog.Filter = 'Executable (*.exe)|*.exe|All files (*.*)|*.*'
      $dialog.Title = 'Select llama-server.exe'
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::WriteLine($dialog.FileName)
      }
    `;

    const selectedPath = await runPowershell(script);
    return { selectedPath: selectedPath || null };
  });

  // Native Windows Folder Dialog (select models or work directory)
  fastify.post('/browse-folder', async (req, reply) => {
    const access = classifyRequest(req);
    if (access !== 'local') {
      return reply.status(403).send({ error: 'local_only' });
    }

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = 'Select Directory'
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::WriteLine($dialog.SelectedPath)
      }
    `;

    const selectedPath = await runPowershell(script);
    return { selectedPath: selectedPath || null };
  });

  // Scan models in target directory
  fastify.post('/scan-models', async (req) => {
    const { dirPath } = (req.body as any) || {};
    if (!dirPath || typeof dirPath !== 'string') {
      return { count: 0, models: [] };
    }
    const result = scanGgufFiles(path.resolve(dirPath));
    return result;
  });

  // Download llama-server binary from official GitHub releases
  fastify.get('/download', async (req, reply) => {
    const access = classifyRequest(req);
    if (access !== 'local') {
      return reply.status(403).send({ error: 'local_only' });
    }

    const { variant = 'vulkan' } = (req.query as any) || {};

    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    const sendSse = (data: any) => {
      try {
        if (!reply.raw.destroyed && reply.raw.writable) {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      } catch {}
    };

    sendSse({ status: 'fetching_release_info', message: 'Checking latest llama.cpp release on GitHub...' });

    try {
      // 1. Fetch release info from GitHub API
      const res = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10', {
        headers: { 'User-Agent': 'rrchat-setup-wizard' },
      });

      if (!res.ok) {
        throw new Error(`GitHub API returned HTTP ${res.status}: ${res.statusText}`);
      }

      const releases = (await res.json()) as any[];
      const validRelease = releases.find((r) => Array.isArray(r.assets) && r.assets.length > 5);

      if (!validRelease) {
        throw new Error('No valid llama.cpp release with binaries found on GitHub');
      }

      // 2. Select asset matching variant
      let targetAsset: any = null;
      const assets: any[] = validRelease.assets;

      if (variant === 'cuda') {
        targetAsset = assets.find((a) => /llama-.*-bin-win-cuda-12\.4-x64\.zip/i.test(a.name)) ||
          assets.find((a) => /llama-.*-bin-win-cuda.*-x64\.zip/i.test(a.name));
      } else if (variant === 'cpu') {
        targetAsset = assets.find((a) => /llama-.*-bin-win-cpu-x64\.zip/i.test(a.name));
      }

      // Fallback or explicit Vulkan (universal for all GPUs)
      if (!targetAsset) {
        targetAsset = assets.find((a) => /llama-.*-bin-win-vulkan-x64\.zip/i.test(a.name)) ||
          assets.find((a) => /llama-.*-bin-win-cpu-x64\.zip/i.test(a.name)) ||
          assets[0];
      }

      if (!targetAsset) {
        throw new Error(`Could not find a binary matching variant "${variant}"`);
      }

      sendSse({
        status: 'starting_download',
        release: validRelease.tag_name,
        filename: targetAsset.name,
        totalBytes: targetAsset.size,
        totalMB: (targetAsset.size / (1024 * 1024)).toFixed(1),
      });

      // 3. Prepare bin directory
      const binDir = path.join(PROJECT_ROOT, 'bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      const zipPath = path.join(binDir, 'llama_download.zip');
      const fileStream = fs.createWriteStream(zipPath);

      // 4. Download file with progress stream
      const downloadRes = await fetch(targetAsset.browser_download_url, {
        headers: { 'User-Agent': 'rrchat-setup-wizard' },
      });

      if (!downloadRes.ok || !downloadRes.body) {
        throw new Error(`Download failed: HTTP ${downloadRes.status}`);
      }

      const totalSize = parseInt(downloadRes.headers.get('content-length') || String(targetAsset.size), 10);
      let downloaded = 0;
      let lastReport = Date.now();

      const reader = downloadRes.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        downloaded += value.length;

        const now = Date.now();
        if (now - lastReport > 200 || downloaded === totalSize) {
          lastReport = now;
          const percent = totalSize > 0 ? Math.min(100, Math.round((downloaded / totalSize) * 100)) : 50;
          sendSse({
            status: 'downloading',
            percent,
            downloadedMB: (downloaded / (1024 * 1024)).toFixed(1),
            totalMB: (totalSize / (1024 * 1024)).toFixed(1),
          });
        }
      }

      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', () => resolve());
        fileStream.on('error', reject);
      });

      // 5. Extract archive using built-in tar or PowerShell
      sendSse({ status: 'extracting', message: 'Extracting files to ./bin/ ...' });

      try {
        await execAsync(`tar.exe -xf "${zipPath}" -C "${binDir}"`, { timeout: 30000 });
      } catch {
        // Fallback to PowerShell Expand-Archive
        await execAsync(
          `powershell.exe -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${binDir}' -Force"`,
          { timeout: 60000 }
        );
      }

      // Cleanup zip archive
      try {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      } catch {}

      // 6. Verify llama-server.exe
      let finalExe = path.join(binDir, 'llama-server.exe');
      if (!fs.existsSync(finalExe)) {
        // Check subdirectories inside bin
        const entries = fs.readdirSync(binDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const sub = path.join(binDir, entry.name, 'llama-server.exe');
            if (fs.existsSync(sub)) {
              finalExe = sub;
              break;
            }
          }
        }
      }

      if (!fs.existsSync(finalExe)) {
        throw new Error('Archive extracted, but llama-server.exe was not found.');
      }

      sendSse({
        status: 'done',
        message: 'llama-server installed successfully!',
        llamaServerPath: path.resolve(finalExe),
      });
    } catch (err: any) {
      sendSse({
        status: 'error',
        message: err.message || 'Failed to download llama-server',
      });
    } finally {
      try {
        reply.raw.end();
      } catch {}
    }
  });

  // Save configuration and finalize setup
  fastify.post('/save', async (req, reply) => {
    const access = classifyRequest(req);
    if (access !== 'local') {
      return reply.status(403).send({ error: 'local_only' });
    }

    const body = (req.body as any) || {};
    const {
      llamaServerPath,
      modelsDir,
      workModeEnabled,
      workDir,
      workQuotaGB,
      networkMode,
      allowAdminOverTunnel,
      allowWorkOverTunnel,
      language = 'en',
    } = body;

    if (!llamaServerPath || !fs.existsSync(llamaServerPath)) {
      return reply.status(400).send({
        error: 'invalid_llama_path',
        message: 'The specified llama-server.exe path does not exist.',
      });
    }

    const resolvedModelsDir = path.resolve(modelsDir || path.join(PROJECT_ROOT, '..', 'models'));
    if (!fs.existsSync(resolvedModelsDir)) {
      try {
        fs.mkdirSync(resolvedModelsDir, { recursive: true });
      } catch {}
    }

    const resolvedWorkDir = path.resolve(workDir || path.join(PROJECT_ROOT, '..', 'ai-work'));
    if (workModeEnabled && !fs.existsSync(resolvedWorkDir)) {
      try {
        fs.mkdirSync(resolvedWorkDir, { recursive: true });
      } catch {}
    }

    // Generate or retain admin token
    const token = generateToken();
    const tokenHash = hashToken(token);
    const tokenPrefix = token.slice(0, 6);

    try {
      fs.writeFileSync(TOKEN_FILE_PATH, token, 'utf-8');
    } catch {}

    setPlainToken(token);

    const newConfig: AppConfig = {
      llamaServerPath: path.resolve(llamaServerPath),
      modelsDir: resolvedModelsDir,
      workDir: resolvedWorkDir,
      workQuotaGB: typeof workQuotaGB === 'number' ? workQuotaGB : 5,
      workModeEnabled: !!workModeEnabled,
      listenHost: '0.0.0.0', // listen on all interfaces for Wi-Fi / Funnel
      port: 3000,
      accessTokenHash: tokenHash,
      tokenPrefix: tokenPrefix,
      trustProxy: true,
      allowedHosts: [],
      allowWorkOverTunnel: !!allowWorkOverTunnel,
      allowAdminRemote: false,
      allowAdminOverTunnel: networkMode === 'funnel' ? !!allowAdminOverTunnel : false,
      sessionMaxAgeDays: 30,
      commandTimeoutSec: 60,
      autoApproveCommands: true,
      userPrePrompt: '',
      disabledSkills: [],
      theme: 'red basic',
      agentWebSearch: true,
      language: language === 'ru' ? 'ru' : 'en',
      modelSettings: {},
    };

    saveConfig(newConfig);

    // Find local LAN IP for Wi-Fi connection
    const interfaces = os.networkInterfaces();
    let lanIp = 'localhost';
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          lanIp = iface.address;
          break;
        }
      }
      if (lanIp !== 'localhost') break;
    }

    const connectUrl = `http://${lanIp}:3000/#token=${token}`;
    const qrCodeDataUrl = await QRCode.toDataURL(connectUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#ffffff',
        light: '#18181b',
      },
    });

    return {
      ok: true,
      plainToken: token,
      connectUrl,
      lanIp,
      qrCodeDataUrl,
      config: newConfig,
    };
  });
};
