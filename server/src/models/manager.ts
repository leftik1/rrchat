export interface ModelInfo {
  id: string;
  name: string;
  filePath: string;
  sizeBytes: number;
  isLoaded: boolean;
  hasVision: boolean;
  projectorPath?: string;
  shardsCount?: number;
  status: 'unloaded' | 'loading' | 'loaded' | 'error';
  errorMessage?: string;
  contextTokens?: number;
  gpuLayers?: number;
  cpuMoe?: number;
  isMoE?: boolean;
  role?: 'main' | 'aux';
  userRole?: 'main' | 'aux';
  isUserOverridden?: boolean;
  isAuxLoaded?: boolean;
  supportsReasoningToggle?: boolean | null;
  layersCount?: number;
  contextLength?: number;
  parametersCount?: number;
  quantization?: string;
  placement?: 'GPU' | 'GPU + RAM' | 'RAM';
  estimatedVramMB?: number;
  calibratedVramMB?: number;
  kvCacheType?: string;
}

export interface LoadOptions {
  gpuLayers?: number;
  contextTokens?: number;
  cpuMoe?: number;
  flashAttn?: boolean;
  kvCacheType?: string;
}

export interface LoadEvent {
  modelId: string;
  status: 'loading' | 'loaded' | 'unloaded' | 'error';
  progress?: number;
  message?: string;
  isAux?: boolean;
}

export interface ModelManager {
  list(): Promise<ModelInfo[]>;
  load(id: string, opts?: LoadOptions): Promise<void>;
  unload(id: string): Promise<void>;
  ensureMain(id: string, opts?: LoadOptions): Promise<void>;
  ensureAux(id: string, opts?: LoadOptions): Promise<void>;
  unloadAux(): Promise<void>;
  baseUrlFor(id?: string): string;
  getActiveModel(): string | null;
  getActiveAuxModel(): string | null;
  onProgress(cb: (e: LoadEvent) => void): () => void;
  dispose(): Promise<void>;
}
