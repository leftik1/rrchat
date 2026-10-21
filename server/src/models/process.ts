import { spawn, exec, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { promisify } from 'node:util';
import type { ModelManager, ModelInfo, LoadOptions, LoadEvent } from './manager.js';
import { scanModelsDirectory, type ScannedModel, invalidateModelsCache } from './scanner.js';
import { loadConfig, saveConfig } from '../config.js';

const execAsync = promisify(exec);

export async function queryNvidiaVramUsedMB(): Promise<number | null> {
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits');
    const val = parseInt(stdout.trim().split('\n')[0], 10);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

export function calculateVramEstimate(
  sizeBytes: number,
  layersCount: number | undefined,
  gpuLayers: number,
  contextTokens: number,
  kvCacheType: string = 'f16',
  calibratedVramMB?: number
): { estimatedVramMB: number; placement: 'GPU' | 'GPU + RAM' | 'RAM'; kvCacheSizeMB: number } {
  const totalLayers = layersCount && layersCount > 0 ? layersCount : 32;
  const placement: 'GPU' | 'GPU + RAM' | 'RAM' =
    gpuLayers <= 0 ? 'RAM' : gpuLayers >= totalLayers ? 'GPU' : 'GPU + RAM';

  const fraction = Math.min(1, Math.max(0, gpuLayers / totalLayers));

  // KV cache multiplier
  let bytesPerElem = 2; // f16
  if (kvCacheType === 'q8_0') bytesPerElem = 1.06;
  if (kvCacheType === 'q4_0') bytesPerElem = 0.56;

  // Approximate KV cache: 2 * layers * context * 8 heads * 128 dim * bytesPerElem
  const kvCacheBytes = 2 * totalLayers * contextTokens * 8 * 128 * bytesPerElem;
  const kvCacheSizeMB = Math.round(kvCacheBytes / (1024 * 1024));

  if (placement === 'RAM') {
    return { estimatedVramMB: 0, placement, kvCacheSizeMB };
  }

  if (calibratedVramMB && placement === 'GPU') {
    return { estimatedVramMB: Math.round(calibratedVramMB), placement, kvCacheSizeMB };
  }

  const modelSizeMB = sizeBytes / (1024 * 1024);
  const weightsVramMB = modelSizeMB * fraction;
  const cudaOverheadMB = 768; // ~0.75 GB overhead

  const estimatedVramMB = Math.round(weightsVramMB + kvCacheSizeMB + cudaOverheadMB);
  return { estimatedVramMB, placement, kvCacheSizeMB };
}

export class ProcessModelManager implements ModelManager {
  private activeProcess: ChildProcess | null = null;
  private activeModelId: string | null = null;
  private activeModelStatus: 'unloaded' | 'loading' | 'loaded' | 'error' = 'unloaded';
  private activeErrorMessage?: string;
  private port: number = 8888;

  // Secondary/Auxiliary process (e.g. GLM-OCR or VLM on CPU/RAM)
  private auxPort: number = 8889;
  private auxProcess: ChildProcess | null = null;
  private auxModelId: string | null = null;
  private auxModelStatus: 'unloaded' | 'loading' | 'loaded' | 'error' = 'unloaded';
  private auxErrorMessage?: string;
  private auxIdleTimer: NodeJS.Timeout | null = null;
  private auxOperationLock: Promise<void> = Promise.resolve();

  private dirWatcher: fs.FSWatcher | null = null;
  private watchDebounceTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<(e: LoadEvent) => void>();
  private operationLock: Promise<void> = Promise.resolve();
  private cachedList: ModelInfo[] | null = null;
  private lastListTime = 0;

  constructor(port = 8888, auxPort = 8889) {
    this.port = port;
    this.auxPort = auxPort;
    this.initDirWatcher();
  }

  private initDirWatcher() {
    try {
      const { config } = loadConfig();
      if (fs.existsSync(config.modelsDir)) {
        this.dirWatcher = fs.watch(config.modelsDir, { recursive: false }, (eventType, filename) => {
          if (this.watchDebounceTimer) clearTimeout(this.watchDebounceTimer);
          this.watchDebounceTimer = setTimeout(() => {
            console.log(`[ModelManager] Models directory changed (${eventType} ${filename || ''}), notifying clients...`);
            invalidateModelsCache();
            this.cachedList = null;
            this.emit({ modelId: '', status: 'unloaded', message: 'models_updated' });
          }, 600);
        });
      }
    } catch (err) {
      console.warn('[ModelManager] Could not start modelsDir watcher:', err);
    }
  }

  updateModelsDir() {
    if (this.dirWatcher) {
      try {
        this.dirWatcher.close();
      } catch {
        // ignore
      }
      this.dirWatcher = null;
    }
    this.initDirWatcher();
    this.emit({ modelId: '', status: 'unloaded', message: 'models_updated' });
  }

  private emit(event: LoadEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ModelManager] Listener error:', err);
      }
    }
  }

  onProgress(cb: (e: LoadEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  baseUrlFor(id?: string): string {
    if (id && id === this.auxModelId) {
      return `http://127.0.0.1:${this.auxPort}`;
    }
    return `http://127.0.0.1:${this.port}`;
  }

  getActiveModel(): string | null {
    return this.activeModelStatus === 'loaded' ? this.activeModelId : null;
  }

  getActiveAuxModel(): string | null {
    return this.auxModelStatus === 'loaded' ? this.auxModelId : null;
  }

  private async syncWithLiveServers(scanned: ScannedModel[]): Promise<void> {
    if (this.activeModelStatus !== 'loading') {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/props`, {
          signal: AbortSignal.timeout(500),
        });
        if (res.ok) {
          const props = (await res.json()) as any;
          const loadedPath = props.model_path || props.model_alias;
          if (loadedPath) {
            const normLoaded = path.normalize(loadedPath).toLowerCase();
            const baseLoaded = path.basename(loadedPath, '.gguf').toLowerCase();
            const matched = scanned.find(
              (m) =>
                path.normalize(m.filePath).toLowerCase() === normLoaded ||
                m.id.toLowerCase() === baseLoaded ||
                m.name.toLowerCase() === baseLoaded
            );
            if (matched) {
              this.activeModelId = matched.id;
              this.activeModelStatus = 'loaded';
              this.activeErrorMessage = undefined;
            }
          }
        } else if (!this.activeProcess) {
          this.activeModelStatus = 'unloaded';
          this.activeModelId = null;
        }
      } catch {
        if (!this.activeProcess) {
          this.activeModelStatus = 'unloaded';
          this.activeModelId = null;
        }
      }
    }

    if (this.auxModelStatus !== 'loading') {
      try {
        const res = await fetch(`http://127.0.0.1:${this.auxPort}/props`, {
          signal: AbortSignal.timeout(500),
        });
        if (res.ok) {
          const props = (await res.json()) as any;
          const loadedPath = props.model_path || props.model_alias;
          if (loadedPath) {
            const normLoaded = path.normalize(loadedPath).toLowerCase();
            const baseLoaded = path.basename(loadedPath, '.gguf').toLowerCase();
            const matched = scanned.find(
              (m) =>
                path.normalize(m.filePath).toLowerCase() === normLoaded ||
                m.id.toLowerCase() === baseLoaded ||
                m.name.toLowerCase() === baseLoaded
            );
            if (matched) {
              this.auxModelId = matched.id;
              this.auxModelStatus = 'loaded';
              this.auxErrorMessage = undefined;
            }
          }
        } else if (!this.auxProcess) {
          this.auxModelStatus = 'unloaded';
          this.auxModelId = null;
        }
      } catch {
        if (!this.auxProcess) {
          this.auxModelStatus = 'unloaded';
          this.auxModelId = null;
        }
      }
    }
  }

  async list(): Promise<ModelInfo[]> {
    const now = Date.now();
    if (this.cachedList && now - this.lastListTime < 4000) {
      return this.cachedList;
    }
    const { config } = loadConfig();
    const scanned = scanModelsDirectory(config.modelsDir);
    await this.syncWithLiveServers(scanned);
    const scannedIds = new Set(scanned.map((m) => m.id));

    // Clean up stale settings
    let changed = false;
    for (const id of Object.keys(config.modelSettings)) {
      if (!scannedIds.has(id)) {
        delete config.modelSettings[id];
        changed = true;
      }
    }
    // Auto-init model settings if not yet stored
    for (const m of scanned) {
      if (!config.modelSettings[m.id]) {
        config.modelSettings[m.id] = {
          role: m.isAuxCandidate ? 'aux' : 'main',
          gpuLayers: m.isAuxCandidate ? 0 : 99,
          contextTokens: m.isAuxCandidate ? 4096 : 8192,
        };
        changed = true;
      }
    }

    if (config.activeAuxModelId && !scannedIds.has(config.activeAuxModelId)) {
      config.activeAuxModelId = undefined;
      changed = true;
    }

    if (!config.activeAuxModelId) {
      const defaultAux = scanned.find((m) => {
        const s = config.modelSettings[m.id];
        return (s?.userRole || s?.role || (m.isAuxCandidate ? 'aux' : 'main')) === 'aux';
      });
      if (defaultAux) {
        config.activeAuxModelId = defaultAux.id;
        changed = true;
      }
    }

    if (changed) {
      saveConfig(config);
    }

    if (this.activeModelId && !scannedIds.has(this.activeModelId)) {
      this.activeModelId = null;
      this.activeModelStatus = 'unloaded';
    }
    if (this.auxModelId && !scannedIds.has(this.auxModelId)) {
      this.auxModelId = null;
      this.auxModelStatus = 'unloaded';
    }

    const models: ModelInfo[] = scanned.map((m) => {
      const isMainCurrent = m.id === this.activeModelId;
      const isAuxCurrent = m.id === this.auxModelId;
      const settings = config.modelSettings[m.id] || {};
      const userRole = settings.userRole;
      const autoRole = m.isAuxCandidate ? 'aux' : 'main';
      // User's choice ALWAYS has higher priority than auto-detection
      const role = userRole || settings.role || autoRole;

      const isLoaded = (isMainCurrent && this.activeModelStatus === 'loaded') || (isAuxCurrent && this.auxModelStatus === 'loaded');
      let status: 'unloaded' | 'loading' | 'loaded' | 'error' = 'unloaded';
      let errorMessage: string | undefined;

      if (isMainCurrent) {
        status = this.activeModelStatus;
        errorMessage = this.activeErrorMessage;
      } else if (isAuxCurrent) {
        status = this.auxModelStatus;
        errorMessage = this.auxErrorMessage;
      }

      const isMoE = m.isMoE || m.name.toLowerCase().includes('moe') || m.name.toLowerCase().includes('a3b') || m.name.toLowerCase().includes('a2b');
      const defaultCpuMoe = isMoE ? 28 : 0;
      const cpuMoe = settings.cpuMoe !== undefined ? settings.cpuMoe : defaultCpuMoe;
      const projectorPath = settings.projectorPath !== undefined
        ? (settings.projectorPath === 'none' ? undefined : settings.projectorPath)
        : m.projectorPath;
      const hasVision = !!projectorPath || m.hasVision;

      const ctx = settings.contextTokens ?? (role === 'aux' ? 4096 : 8192);
      const ngl = settings.gpuLayers ?? (role === 'aux' ? 0 : 99);
      const kvType = settings.kvCacheType ?? 'f16';
      const est = calculateVramEstimate(
        m.totalSize,
        m.layersCount,
        ngl,
        ctx,
        kvType,
        settings.calibratedVramMB
      );

      return {
        id: m.id,
        name: m.name,
        filePath: m.filePath,
        sizeBytes: m.totalSize,
        hasVision,
        projectorPath,
        shardsCount: m.shardsCount,
        isLoaded,
        isAuxLoaded: isAuxCurrent && this.auxModelStatus === 'loaded',
        status,
        errorMessage,
        role,
        userRole,
        isUserOverridden: !!userRole,
        contextTokens: ctx,
        gpuLayers: ngl,
        cpuMoe,
        isMoE,
        layersCount: m.layersCount,
        contextLength: m.contextLength,
        parametersCount: m.parametersCount,
        quantization: m.quantization,
        placement: est.placement,
        estimatedVramMB: est.estimatedVramMB,
        calibratedVramMB: settings.calibratedVramMB,
        kvCacheType: kvType,
        supportsReasoningToggle: (() => {
          if (settings.supportsReasoningToggle !== undefined && settings.supportsReasoningToggle !== null) {
            return settings.supportsReasoningToggle;
          }
          const lower = m.name.toLowerCase();
          if (lower.includes('ocr') || lower.includes('embed') || lower.includes('bert')) {
            return false;
          }
          if (lower.includes('r1') || lower.includes('qwq') || lower.includes('think') || lower.includes('reason') || lower.includes('lfm2.5')) {
            return true;
          }
          return null;
        })(),
      };
    });

    this.cachedList = models;
    this.lastListTime = Date.now();
    return models;
  }

  async ensureMain(id: string, opts?: LoadOptions): Promise<void> {
    const prevLock = this.operationLock;
    let releaseLock: () => void;
    this.operationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await prevLock;
      if (this.activeModelId === id && this.activeModelStatus === 'loaded') {
        return;
      }
      if (this.activeProcess) {
        await this.unloadInternal();
      }
      await this.loadInternal(id, opts);
    } finally {
      releaseLock!();
    }
  }

  async load(id: string, opts?: LoadOptions): Promise<void> {
    await this.ensureMain(id, opts);
  }

  async unload(id: string): Promise<void> {
    const prevLock = this.operationLock;
    let releaseLock: () => void;
    this.operationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await prevLock;
      if (this.activeModelId === id) {
        await this.unloadInternal();
      }
    } finally {
      releaseLock!();
    }
  }

  private async unloadInternal(): Promise<void> {
    const modelId = this.activeModelId;
    if (!this.activeProcess && !modelId) {
      return;
    }

    this.emit({ modelId: modelId || '', status: 'unloaded', message: 'Unloading model and freeing VRAM...' });
    const pid = this.activeProcess?.pid;

    if (pid) {
      try {
        if (process.platform === 'win32') {
          await execAsync(`taskkill /PID ${pid} /T /F`);
        } else {
          process.kill(-pid, 'SIGKILL');
        }
      } catch (err) {
        console.warn(`[ModelManager] taskkill warning for PID ${pid}:`, err);
      }
    } else {
      // Find PID on port and terminate
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execAsync(`netstat -ano | findstr :${this.port}`);
          for (const line of stdout.trim().split('\n')) {
            if (line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              const foundPid = parts[parts.length - 1];
              if (foundPid && foundPid !== '0') {
                await execAsync(`taskkill /PID ${foundPid} /T /F`);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[ModelManager] Port taskkill warning:`, err);
      }
    }

    this.activeProcess = null;
    this.activeModelId = null;
    this.activeModelStatus = 'unloaded';
    this.activeErrorMessage = undefined;

    // Wait for NVIDIA driver to completely release VRAM and CUDA context
    await new Promise((r) => setTimeout(r, 1500));
    this.emit({ modelId: modelId || '', status: 'unloaded', message: 'Model unloaded, VRAM freed' });
  }

  private async loadInternal(id: string, opts?: LoadOptions): Promise<void> {
    const { config } = loadConfig();
    const models = scanModelsDirectory(config.modelsDir);
    const model = models.find((m) => m.id === id);

    if (!model) {
      throw new Error(`Model not found: ${id}`);
    }

    const settings = config.modelSettings[id] || {};
    const context = opts?.contextTokens ?? settings.contextTokens ?? 8192;
    const gpuLayers = opts?.gpuLayers ?? settings.gpuLayers ?? 99;
    const isMoE = model.isMoE || model.name.toLowerCase().includes('moe') || model.name.toLowerCase().includes('a3b') || model.name.toLowerCase().includes('a2b');
    const defaultCpuMoe = isMoE ? 28 : 0;
    const cpuMoe = opts?.cpuMoe ?? settings.cpuMoe ?? defaultCpuMoe;
    const flashAttn = opts?.flashAttn ?? settings.flashAttn ?? true;
    const kvCache = opts?.kvCacheType ?? settings.kvCacheType ?? 'f16';
    const projectorPath = settings.projectorPath !== undefined
      ? (settings.projectorPath === 'none' ? undefined : settings.projectorPath)
      : model.projectorPath;

    const llamaServerBin = config.llamaServerPath;
    if (!fs.existsSync(llamaServerBin)) {
      throw new Error(`llama-server executable not found at ${llamaServerBin}`);
    }

    this.activeModelId = id;
    this.activeModelStatus = 'loading';
    this.activeErrorMessage = undefined;
    this.emit({ modelId: id, status: 'loading', message: `Starting ${model.name}...` });

    const args: string[] = [
      '-m', model.filePath,
      '-c', context.toString(),
      '-ngl', gpuLayers.toString(),
      '--port', this.port.toString(),
      '--host', '127.0.0.1',
      '--jinja',
      '--fit', 'off',
      '-np', '1',
      '-t', '8',
    ];

    if (cpuMoe > 0) {
      args.push('--n-cpu-moe', cpuMoe.toString());
      // Prevent Windows disk paging for CPU MoE weights to reach max throughput
      args.push('--load-mode', 'none');
    }

    if (flashAttn) {
      args.push('-fa', 'on');
    }

    // Default to q8_0 for MoE or models > 15GB to eliminate PCIe memory spilling
    const effectiveKvCache = kvCache && kvCache !== 'f16' ? kvCache : (isMoE || model.totalSize > 15 * 1024 * 1024 * 1024 ? 'q8_0' : 'f16');
    if (effectiveKvCache !== 'f16') {
      args.push('--cache-type-k', effectiveKvCache, '--cache-type-v', effectiveKvCache);
    }

    if (projectorPath && fs.existsSync(projectorPath)) {
      args.push('--mmproj', projectorPath);
    }

    const preVramMB = await queryNvidiaVramUsedMB();

    console.log(`[ModelManager] Launching llama-server with args:`, args.join(' '));

    const child = spawn(llamaServerBin, args, {
      cwd: path.dirname(llamaServerBin),
      env: {
        ...process.env,
        GGML_CUDA_PDL: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    this.activeProcess = child;

    child.stdout?.on('data', (d) => {
      // stdout
    });

    let stderrBuffer = '';
    child.stderr?.on('data', (d) => {
      const text = d.toString();
      stderrBuffer = (stderrBuffer + text).slice(-4000);
      process.stderr.write(`[llama-server] ${text}`);
      if (text.includes('load_all_data') || text.includes('loading model')) {
        this.emit({ modelId: id, status: 'loading', message: 'Loading model tensors into memory...' });
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`[ModelManager] llama-server exited with code ${code}, signal ${signal}`);
      if (this.activeModelId === id && this.activeModelStatus === 'loading') {
        this.activeModelStatus = 'error';
        this.activeErrorMessage = `Process exited prematurely with code ${code}. ${stderrBuffer.slice(-500)}`;
        this.emit({
          modelId: id,
          status: 'error',
          message: this.activeErrorMessage,
        });
      } else if (this.activeModelId === id) {
        this.activeModelStatus = 'unloaded';
        this.activeModelId = null;
        this.emit({ modelId: id, status: 'unloaded', message: 'Process terminated' });
      }
      this.activeProcess = null;
    });

    // Poll health endpoint
    const ready = await this.waitForReady(90_000);
    if (!ready) {
      await this.unloadInternal();
      throw new Error(`Model loading timed out or failed. ${this.activeErrorMessage || ''}`);
    }

    const postVramMB = await queryNvidiaVramUsedMB();
    if (preVramMB !== null && postVramMB !== null && postVramMB > preVramMB) {
      const delta = postVramMB - preVramMB;
      if (delta >= 400) {
        config.modelSettings[id] = {
          ...config.modelSettings[id],
          calibratedVramMB: delta,
        };
        saveConfig(config);
      }
    }

    this.activeModelStatus = 'loaded';
    this.emit({ modelId: id, status: 'loaded', message: `Model ${model.name} loaded successfully` });
  }

  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!this.activeProcess || this.activeModelStatus === 'error') {
        return false;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`, { method: 'GET' });
        if (res.ok) {
          const body = (await res.json()) as any;
          if (body.status === 'ok' || body.status === 'ready' || body.status === 'loading model') {
            if (body.status === 'loading model') {
              this.emit({
                modelId: this.activeModelId!,
                status: 'loading',
                message: 'Tensors loading into GPU/RAM...',
              });
            } else {
              return true;
            }
          }
        }
      } catch {
        // server not ready yet
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  }

  async ensureAux(id: string, opts?: LoadOptions): Promise<void> {
    const prevLock = this.auxOperationLock;
    let releaseLock: () => void;
    this.auxOperationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await prevLock;
      this.resetAuxIdleTimer();
      if (this.auxModelId === id && this.auxModelStatus === 'loaded') {
        return;
      }
      if (this.auxProcess) {
        await this.unloadAuxInternal();
      }
      await this.loadAuxInternal(id, opts);
      this.resetAuxIdleTimer();
    } finally {
      releaseLock!();
    }
  }

  async unloadAux(): Promise<void> {
    const prevLock = this.auxOperationLock;
    let releaseLock: () => void;
    this.auxOperationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await prevLock;
      await this.unloadAuxInternal();
    } finally {
      releaseLock!();
    }
  }

  private resetAuxIdleTimer() {
    if (this.auxIdleTimer) {
      clearTimeout(this.auxIdleTimer);
    }
    // Auto-unload auxiliary model after 120s of inactivity to free RAM/CPU
    this.auxIdleTimer = setTimeout(() => {
      console.log(`[ModelManager] Aux model ${this.auxModelId} idle for 120s, unloading...`);
      this.unloadAux().catch((err) => console.warn('[ModelManager] Aux idle unload error:', err));
    }, 120_000);
  }

  private async unloadAuxInternal(): Promise<void> {
    if (this.auxIdleTimer) {
      clearTimeout(this.auxIdleTimer);
      this.auxIdleTimer = null;
    }
    const modelId = this.auxModelId;
    if (!this.auxProcess && !modelId) {
      return;
    }

    this.emit({ modelId: modelId || '', status: 'unloaded', message: 'Unloading aux model and freeing RAM/CPU...', isAux: true });
    const pid = this.auxProcess?.pid;

    if (pid) {
      try {
        if (process.platform === 'win32') {
          await execAsync(`taskkill /PID ${pid} /T /F`);
        } else {
          process.kill(-pid, 'SIGKILL');
        }
      } catch (err) {
        console.warn(`[ModelManager] taskkill warning for aux PID ${pid}:`, err);
      }
    } else {
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execAsync(`netstat -ano | findstr :${this.auxPort}`);
          for (const line of stdout.trim().split('\n')) {
            if (line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              const foundPid = parts[parts.length - 1];
              if (foundPid && foundPid !== '0') {
                await execAsync(`taskkill /PID ${foundPid} /T /F`);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[ModelManager] Aux port taskkill warning:`, err);
      }
    }

    this.auxProcess = null;
    this.auxModelId = null;
    this.auxModelStatus = 'unloaded';
    this.auxErrorMessage = undefined;

    await new Promise((r) => setTimeout(r, 400));
    this.emit({ modelId: modelId || '', status: 'unloaded', message: 'Aux model unloaded', isAux: true });
  }

  private async loadAuxInternal(id: string, opts?: LoadOptions): Promise<void> {
    const { config } = loadConfig();
    const models = scanModelsDirectory(config.modelsDir);
    const model = models.find((m) => m.id === id);

    if (!model) {
      throw new Error(`Aux model not found: ${id}`);
    }

    const settings = config.modelSettings[id] || {};
    // Aux models default to CPU/RAM (gpuLayers: 0) to avoid competing with main model in 12GB VRAM
    const gpuLayers = opts?.gpuLayers ?? settings.gpuLayers ?? 0;
    const defaultCtx = model.name.toLowerCase().includes('ocr') ? 16384 : 8192;
    const context = Math.max(opts?.contextTokens ?? settings.contextTokens ?? defaultCtx, 16384);
    const cpuMoe = opts?.cpuMoe ?? settings.cpuMoe ?? 0;
    const flashAttn = gpuLayers > 0 ? (opts?.flashAttn ?? settings.flashAttn ?? true) : false;

    const llamaServerBin = config.llamaServerPath;
    if (!fs.existsSync(llamaServerBin)) {
      throw new Error(`llama-server executable not found at ${llamaServerBin}`);
    }

    this.auxModelId = id;
    this.auxModelStatus = 'loading';
    this.auxErrorMessage = undefined;
    this.emit({ modelId: id, status: 'loading', message: `Starting auxiliary model ${model.name} (CPU/RAM)...`, isAux: true });

    const args: string[] = [
      '-m', model.filePath,
      '-c', context.toString(),
      '-ngl', gpuLayers.toString(),
      '--port', this.auxPort.toString(),
      '--host', '127.0.0.1',
      '-np', '1',
      '-t', '8',
      '-b', '2048',
      '-ub', '2048',
      '--jinja',
      '--fit', 'off',
    ];

    if (cpuMoe > 0) {
      args.push('--n-cpu-moe', cpuMoe.toString());
    }

    if (flashAttn) {
      args.push('-fa', 'on');
    }

    if (model.projectorPath && fs.existsSync(model.projectorPath)) {
      args.push('--mmproj', model.projectorPath);
    }

    console.log(`[ModelManager] Launching aux llama-server on port ${this.auxPort} with args:`, args.join(' '));

    const child = spawn(llamaServerBin, args, {
      cwd: path.dirname(llamaServerBin),
      env: {
        ...process.env,
        GGML_CUDA_PDL: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    this.auxProcess = child;

    let stderrBuffer = '';
    child.stderr?.on('data', (d) => {
      const text = d.toString();
      stderrBuffer = (stderrBuffer + text).slice(-4000);
      process.stderr.write(`[llama-aux] ${text}`);
    });

    child.on('exit', (code, signal) => {
      console.log(`[ModelManager] Aux llama-server exited with code ${code}, signal ${signal}`);
      if (this.auxModelId === id && this.auxModelStatus === 'loading') {
        this.auxModelStatus = 'error';
        this.auxErrorMessage = `Aux process exited prematurely with code ${code}. ${stderrBuffer.slice(-500)}`;
        this.emit({
          modelId: id,
          status: 'error',
          message: this.auxErrorMessage,
          isAux: true,
        });
      } else if (this.auxModelId === id) {
        this.auxModelStatus = 'unloaded';
        this.auxModelId = null;
        this.emit({ modelId: id, status: 'unloaded', message: 'Aux process terminated', isAux: true });
      }
      this.auxProcess = null;
    });

    const ready = await this.waitForAuxReady(90_000);
    if (!ready) {
      await this.unloadAuxInternal();
      throw new Error(`Aux model loading timed out or failed. ${this.auxErrorMessage || ''}`);
    }

    this.auxModelStatus = 'loaded';
    this.emit({ modelId: id, status: 'loaded', message: `Aux model ${model.name} loaded successfully`, isAux: true });
  }

  private async waitForAuxReady(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!this.auxProcess || this.auxModelStatus === 'error') {
        return false;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${this.auxPort}/health`, { method: 'GET' });
        if (res.ok) {
          const body = (await res.json()) as any;
          if (body.status === 'ok' || body.status === 'ready' || body.status === 'loading model') {
            if (body.status !== 'loading model') {
              return true;
            }
          }
        }
      } catch {
        // waiting
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  }

  async dispose(): Promise<void> {
    if (this.dirWatcher) {
      try {
        this.dirWatcher.close();
      } catch {
        // ignore
      }
      this.dirWatcher = null;
    }
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
    }
    await Promise.all([this.unloadInternal(), this.unloadAuxInternal()]);
  }
}
