import crypto from 'node:crypto';
import { loadConfig } from '../config.js';

export interface PendingApproval {
  id: string;
  chatId: string;
  tool: string;
  args: Record<string, any>;
  message: string;
  command?: string;
  isDangerous?: boolean;
  approvalToken: string;
  nonce: string;
  expectedHash: string;
  sessionId: string;
  accessClass: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

const pendingApprovals = new Map<string, PendingApproval>();
const autoApprovedCommandChats = new Set<string>();

export function isChatAutoApprovedForCommands(chatId: string, accessClass = 'local'): boolean {
  if (accessClass === 'proxied') return false;

  try {
    const { config } = loadConfig();
    if (config.autoApproveCommands) return true;
  } catch {
    // ignore
  }
  return autoApprovedCommandChats.has(chatId);
}

export function setAutoApproveCommandsForChat(chatId: string, enabled: boolean): void {
  if (enabled) {
    autoApprovedCommandChats.add(chatId);
  } else {
    autoApprovedCommandChats.delete(chatId);
  }
}

export function registerApproval(
  chatId: string,
  tool: string,
  args: Record<string, any>,
  message: string,
  options: {
    command?: string;
    isDangerous?: boolean;
    sessionId?: string;
    accessClass?: string;
    timeoutMs?: number;
  } = {}
): { id: string; token: string; promise: Promise<boolean> } {
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const approvalToken = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const cmd = options.command || '';
  const sessionId = options.sessionId || '';
  const expectedHash = crypto.createHash('sha256').update(cmd + chatId + sessionId + nonce).digest('hex');

  const timeoutMs = options.timeoutMs ?? 300000; // 5 minutes TTL
  const now = Date.now();
  let resolvePromise: (val: boolean) => void;

  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });

  const timer = setTimeout(() => {
    pendingApprovals.delete(id);
    resolvePromise(false);
  }, timeoutMs);

  pendingApprovals.set(id, {
    id,
    chatId,
    tool,
    args,
    message,
    command: options.command,
    isDangerous: options.isDangerous,
    approvalToken,
    nonce,
    expectedHash,
    sessionId,
    accessClass: options.accessClass || 'local',
    createdAt: now,
    expiresAt: now + timeoutMs,
    used: false,
    resolve: (approved: boolean) => {
      clearTimeout(timer);
      pendingApprovals.delete(id);
      resolvePromise(approved);
    },
    timer,
  });

  return { id, token: approvalToken, promise };
}

export interface ApprovalResponseResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export function handleApprovalResponse(
  idOrOptions:
    | string
    | {
        approvalId: string;
        approvalToken?: string;
        approved: boolean;
        rememberForChat?: boolean;
        accessClass?: string;
      },
  approvedArg?: boolean,
  rememberForChatArg?: boolean
): ApprovalResponseResult | boolean {
  let id: string;
  let token: string | undefined;
  let approved: boolean;
  let rememberForChat = false;
  let accessClass = 'local';
  let isLegacyCall = false;

  if (typeof idOrOptions === 'string') {
    isLegacyCall = true;
    id = idOrOptions;
    approved = !!approvedArg;
    rememberForChat = !!rememberForChatArg;
  } else {
    id = idOrOptions.approvalId;
    token = idOrOptions.approvalToken;
    approved = idOrOptions.approved;
    rememberForChat = !!idOrOptions.rememberForChat;
    accessClass = idOrOptions.accessClass || 'local';
  }

  const entry = pendingApprovals.get(id);
  if (!entry) {
    if (isLegacyCall) return false;
    return { ok: false, error: 'approval_not_found', message: 'Approval request not found or already closed' };
  }

  if (entry.used) {
    if (isLegacyCall) return false;
    return { ok: false, error: 'approval_already_used', message: 'Approval token has already been used' };
  }

  if (Date.now() > entry.expiresAt) {
    entry.resolve(false);
    if (isLegacyCall) return false;
    return { ok: false, error: 'approval_expired', message: 'Approval request has expired' };
  }

  // Token validation if token was provided or if accessed over tunnel
  if (token) {
    const bufA = Buffer.from(token, 'utf-8');
    const bufB = Buffer.from(entry.approvalToken, 'utf-8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      if (isLegacyCall) return false;
      return { ok: false, error: 'invalid_approval_token', message: 'Cryptographic approval token is invalid' };
    }
  } else if (accessClass === 'proxied' || entry.accessClass === 'proxied') {
    if (isLegacyCall) return false;
    return { ok: false, error: 'missing_approval_token', message: 'Approval token required over tunnel' };
  }

  entry.used = true;

  // Never allow rememberForChat over tunnel or for dangerous commands
  const isProxied = accessClass === 'proxied' || entry.accessClass === 'proxied';
  if (approved && rememberForChat && entry.chatId && !entry.isDangerous && !isProxied) {
    setAutoApproveCommandsForChat(entry.chatId, true);
  }

  entry.resolve(approved);
  if (isLegacyCall) return true;
  return { ok: true };
}

export function getPendingApprovals(): Array<{
  id: string;
  chatId: string;
  tool: string;
  args: any;
  message: string;
  command?: string;
  isDangerous?: boolean;
}> {
  return Array.from(pendingApprovals.values())
    .filter((p) => !p.used && Date.now() <= p.expiresAt)
    .map((p) => ({
      id: p.id,
      chatId: p.chatId,
      tool: p.tool,
      args: p.args,
      message: p.message,
      command: p.command,
      isDangerous: p.isDangerous,
    }));
}
