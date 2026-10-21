import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root of local-ai-chat is two levels up from src/ or dist/
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export interface ModelSetting {
  role?: 'main' | 'aux';
  userRole?: 'main' | 'aux';
  contextTokens?: number;
  gpuLayers?: number;
  cpuMoe?: number;
  projectorPath?: string;
  hasVision?: boolean;
  flashAttn?: boolean;
  kvCacheType?: string;
  supportsReasoningToggle?: boolean | null;
  calibratedVramMB?: number;
}

export interface AppConfig {
  llamaServerPath: string;
  modelsDir: string;
  workDir: string;
  workQuotaGB: number;
  workModeEnabled: boolean;
  listenHost: string;
  port: number;
  accessTokenHash: string;
  tokenPrefix?: string;
  guestAccessTokenHash?: string;
  guestTokenPrefix?: string;
  trustProxy?: boolean;
  allowedHosts?: string[];
  allowWorkOverTunnel?: boolean;
  allowAdminRemote?: boolean;
  allowAdminOverTunnel?: boolean;
  sessionMaxAgeDays?: number;
  activeAuxModelId?: string;
  maxAgentSteps?: number;
  commandTimeoutSec?: number;
  autoApproveCommands?: boolean;
  userPrePrompt?: string;
  disabledSkills?: string[];
  theme?: string;
  agentWebSearch?: boolean;
  language?: string;
  modelSettings: Record<string, ModelSetting>;
}

export const CONFIG_PATH = process.env.VITEST
  ? path.join(os.tmpdir(), `vitest_config_${process.pid}.json`)
  : path.join(PROJECT_ROOT, 'config.json');
export const TOKEN_FILE_PATH = process.env.VITEST
  ? path.join(os.tmpdir(), `vitest_token_${process.pid}`)
  : path.join(PROJECT_ROOT, '.token');
export const GUEST_TOKEN_FILE_PATH = process.env.VITEST
  ? path.join(os.tmpdir(), `vitest_guest_token_${process.pid}`)
  : path.join(PROJECT_ROOT, '.guest_token');

let cachedConfig: AppConfig | null = null;
let currentPlainToken: string | null = null;
let currentPlainGuestToken: string | null = null;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function isConfigured(): boolean {
  if (process.env.VITEST) return true;
  if (!fs.existsSync(CONFIG_PATH)) return false;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.llamaServerPath || typeof parsed.llamaServerPath !== 'string') return false;
    if (!fs.existsSync(parsed.llamaServerPath)) return false;
    if (!parsed.accessTokenHash) return false;
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(): { config: AppConfig; plainToken: string | null } {
  if (cachedConfig) {
    return { config: cachedConfig, plainToken: currentPlainToken };
  }

  // If not running in test mode and config.json does not exist on disk,
  // we are in the initial first-run (unconfigured) state.
  // DO NOT write config.json or .token to disk!
  if (!process.env.VITEST && !fs.existsSync(CONFIG_PATH)) {
    const defaultModels = path.resolve(PROJECT_ROOT, '..', 'models');
    const defaultWork = path.resolve(PROJECT_ROOT, '..', 'ai-work');
    const unconfiguredConfig: AppConfig = {
      llamaServerPath: '',
      modelsDir: defaultModels,
      workDir: defaultWork,
      workQuotaGB: 5,
      workModeEnabled: false,
      listenHost: '0.0.0.0',
      port: 3000,
      accessTokenHash: '',
      tokenPrefix: '',
      trustProxy: true,
      allowedHosts: [],
      allowWorkOverTunnel: false,
      allowAdminRemote: false,
      allowAdminOverTunnel: false,
      sessionMaxAgeDays: 30,
      commandTimeoutSec: 60,
      autoApproveCommands: false,
      userPrePrompt: '',
      disabledSkills: [],
      theme: 'red basic',
      agentWebSearch: true,
      language: 'en',
      modelSettings: {},
    };
    return { config: unconfiguredConfig, plainToken: null };
  }

  let config: Partial<AppConfig> = {};
  let plainToken: string | null = null;

  if (fs.existsSync(TOKEN_FILE_PATH)) {
    try {
      const savedToken = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8').trim();
      if (savedToken) {
        plainToken = savedToken;
      }
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      config = JSON.parse(data);
    } catch (err) {
      console.error('[Config] Failed to read config.json, resetting defaults:', err);
    }
  }

  // Ensure plain token and hash are present and synchronized
  if (plainToken) {
    config.accessTokenHash = hashToken(plainToken);
    config.tokenPrefix = plainToken.slice(0, 6);
  } else if (config.accessTokenHash) {
    config.tokenPrefix = config.tokenPrefix || '';
  } else {
    plainToken = generateToken();
    config.accessTokenHash = hashToken(plainToken);
    config.tokenPrefix = plainToken.slice(0, 6);
    try {
      fs.writeFileSync(TOKEN_FILE_PATH, plainToken, 'utf-8');
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(GUEST_TOKEN_FILE_PATH)) {
    try {
      const savedGuestToken = fs.readFileSync(GUEST_TOKEN_FILE_PATH, 'utf-8').trim();
      if (savedGuestToken) {
        currentPlainGuestToken = savedGuestToken;
        config.guestAccessTokenHash = hashToken(savedGuestToken);
        config.guestTokenPrefix = savedGuestToken.slice(0, 8);
      }
    } catch {
      // ignore
    }
  }

  currentPlainToken = plainToken;

  const defaultLlama = path.resolve(PROJECT_ROOT, '..', 'build', 'bin', 'llama-server.exe');
  const defaultModels = path.resolve(PROJECT_ROOT, '..', 'models');
  const defaultWork = path.resolve(PROJECT_ROOT, '..', 'ai-work');

  const resolvedConfig: AppConfig = {
    llamaServerPath: config.llamaServerPath || defaultLlama,
    modelsDir: config.modelsDir || defaultModels,
    workDir: config.workDir || defaultWork,
    workQuotaGB: typeof config.workQuotaGB === 'number' ? config.workQuotaGB : 5,
    workModeEnabled: !!config.workModeEnabled,
    listenHost: config.listenHost || '0.0.0.0',
    port: config.port || 3000,
    accessTokenHash: config.accessTokenHash || '',
    tokenPrefix: config.tokenPrefix || '',
    guestAccessTokenHash: config.guestAccessTokenHash,
    guestTokenPrefix: config.guestTokenPrefix,
    trustProxy: typeof config.trustProxy === 'boolean' ? config.trustProxy : true,
    allowedHosts: Array.isArray(config.allowedHosts) ? config.allowedHosts : [],
    allowWorkOverTunnel: !!config.allowWorkOverTunnel,
    allowAdminRemote: !!config.allowAdminRemote,
    allowAdminOverTunnel: !!config.allowAdminOverTunnel,
    sessionMaxAgeDays: typeof config.sessionMaxAgeDays === 'number' ? config.sessionMaxAgeDays : 30,
    activeAuxModelId: config.activeAuxModelId,
    maxAgentSteps: typeof config.maxAgentSteps === 'number' ? config.maxAgentSteps : 15,
    commandTimeoutSec: typeof config.commandTimeoutSec === 'number' ? config.commandTimeoutSec : 60,
    autoApproveCommands: !!config.autoApproveCommands,
    userPrePrompt: typeof config.userPrePrompt === 'string' ? config.userPrePrompt : '',
    disabledSkills: Array.isArray(config.disabledSkills) ? config.disabledSkills : [],
    theme: config.theme || 'red basic',
    agentWebSearch: typeof config.agentWebSearch === 'boolean' ? config.agentWebSearch : true,
    language: config.language || 'en',
    modelSettings: config.modelSettings || {},
  };

  cachedConfig = resolvedConfig;

  if (process.env.VITEST && !fs.existsSync(CONFIG_PATH)) {
    saveConfig(resolvedConfig);
  }

  return { config: resolvedConfig, plainToken: currentPlainToken };
}

export function saveConfig(cfg: AppConfig): void {
  cachedConfig = cfg;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function getPlainToken(): string | null {
  return currentPlainToken;
}

export function setPlainToken(token: string): void {
  currentPlainToken = token;
}

export function regeneratePlainToken(): string {
  const newToken = generateToken();
  currentPlainToken = newToken;
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, newToken, 'utf-8');
  } catch {
    // ignore
  }
  const { config } = loadConfig();
  config.accessTokenHash = hashToken(newToken);
  config.tokenPrefix = newToken.slice(0, 6);
  saveConfig(config);
  return newToken;
}

export function generateGuestToken(): string {
  return 'gst_' + crypto.randomBytes(24).toString('base64url');
}

export function getPlainGuestToken(): string | null {
  return currentPlainGuestToken;
}

export function setPlainGuestToken(token: string | null): void {
  currentPlainGuestToken = token;
}

export function regenerateGuestToken(): string {
  const newGuestToken = generateGuestToken();
  currentPlainGuestToken = newGuestToken;
  try {
    fs.writeFileSync(GUEST_TOKEN_FILE_PATH, newGuestToken, 'utf-8');
  } catch {
    // ignore
  }
  const { config } = loadConfig();
  config.guestAccessTokenHash = hashToken(newGuestToken);
  config.guestTokenPrefix = newGuestToken.slice(0, 8);
  saveConfig(config);
  return newGuestToken;
}

export function revokeGuestToken(): void {
  currentPlainGuestToken = null;
  if (fs.existsSync(GUEST_TOKEN_FILE_PATH)) {
    try {
      fs.unlinkSync(GUEST_TOKEN_FILE_PATH);
    } catch {
      // ignore
    }
  }
  const { config } = loadConfig();
  delete config.guestAccessTokenHash;
  delete config.guestTokenPrefix;
  saveConfig(config);
}
