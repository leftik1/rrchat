export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  textContent?: string;
  dataUrl?: string;
}

export interface ToolCallItem {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: { ok: boolean; output: string };
  approvalPending?: boolean;
  approvalId?: string;
  approvalToken?: string;
  canRemember?: boolean;
  command?: string;
  isDangerous?: boolean;
}

export interface MessageStats {
  tokensPerSecond?: number;
  promptTokens?: number;
  completionTokens?: number;
  contextUsedPercent?: number;
  toolCalls?: ToolCallItem[];
  reasoningDurationSec?: number;
  webSearchResults?: Array<{ title: string; url: string; snippet: string }>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string | null;
  reasoningDurationSec?: number;
  attachments?: Attachment[];
  stats?: MessageStats;
  toolCalls?: ToolCallItem[];
  ocrStatus?: { state: 'analyzing' | 'done' | 'error'; message: string; text?: string };
  searchStatus?: {
    state: 'searching' | 'done';
    query?: string;
    results?: Array<{ title: string; url: string; snippet: string }>;
  };
  token_count?: number;
  excluded?: number;
  kind?: 'message' | 'marker' | 'summary';
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  mode: string;
  model_id: string;
  created_at: number;
  updated_at: number;
}

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
  sizeFormatted?: string;
  quantization?: string;
  layersCount?: number;
  contextLength?: number;
  parametersCount?: number;
  placement?: 'GPU' | 'GPU + RAM' | 'RAM';
  estimatedVramMB?: number;
  calibratedVramMB?: number;
  kvCacheType?: string;
}

export interface ModelProgressEvent {
  modelId: string;
  status: 'loading' | 'loaded' | 'unloaded' | 'error';
  progress?: number;
  message?: string;
  isAux?: boolean;
}

export interface WorkFileItem {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

export interface AppSettings {
  workModeEnabled: boolean;
  workQuotaGB: number;
  workDir: string;
}

export interface HardwareStats {
  gpu: {
    name: string;
    utilization: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    temperatureC: number;
  };
  cpu: {
    model: string;
    usagePercent: number;
    cores: number;
    threads: number;
  };
  ram: {
    usedMB: number;
    totalMB: number;
    percent: number;
  };
}

export interface ModelCardData {
  id: string;
  name: string;
  status: 'loaded' | 'unloaded' | 'loading' | 'error';
  role: 'main' | 'aux';
  parameters?: string;
  quantization: string;
  context: number;
  placement: 'GPU' | 'GPU + RAM' | 'RAM';
  layers: { offloaded: number; total: number };
  estimatedVramMB: number;
  physicalVramMB: number;
  kvCache: { type: string; sizeMB: number };
}

export interface ContextSegment {
  tokens: number;
  percent: number;
}

export interface ContextBreakdown {
  total: number;
  used: number;
  usedPercent: number;
  breakdown: {
    prePrompt: ContextSegment;
    skills: ContextSegment;
    tools: ContextSegment;
    history: ContextSegment;
    reasoning: ContextSegment;
    attachments: ContextSegment;
    other: ContextSegment;
    free: ContextSegment;
  };
}

export interface SessionStatsData {
  userMessages: number;
  assistantMessages: number;
  totalMessages: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  averageSpeed: number;
  lastSpeed: number;
  reasoningTimeSec: number;
  mode: string;
}

export interface UsageSnapshot {
  timestamp: number;
  hardware: HardwareStats;
  model: {
    main: ModelCardData | null;
    aux: ModelCardData | null;
  };
  context: ContextBreakdown | null;
  session: SessionStatsData | null;
}
