import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { loadConfig, hashToken } from './config.js';
import {
  insertSession,
  getSession,
  touchSession,
  revokeSessionDb,
  revokeAllSessionsDb,
  getActiveSessionsDb,
  type SessionRecord,
} from './db.js';
import { classifyRequest, isLoopbackIp, type RequestAccessClass } from './network.js';

export { classifyRequest, type RequestAccessClass };
export { isLoopbackIp, isPrivateIp, isPrivateIpv4, isPrivateIpv6, getCleanHost, normalizeIp } from './network.js';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
let globalAttempts = 0;
let globalResetAt = Date.now() + 60_000;

export function isLocalhost(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost'
  );
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  if (now > globalResetAt) {
    globalAttempts = 0;
    globalResetAt = now + 60_000;
  }
  if (globalAttempts >= 20) {
    return { allowed: false, retryAfter: Math.ceil((globalResetAt - now) / 1000) };
  }

  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    globalAttempts++;
    return { allowed: true };
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  globalAttempts++;
  return { allowed: true };
}

export function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

export function hashSessionId(sid: string): string {
  return crypto.createHash('sha256').update(sid.trim()).digest('hex');
}

export function createSession(userAgent = '', accessClass = 'local', role: 'admin' | 'guest' = 'admin', maxAgeDays = 30): string {
  const sid = crypto.randomBytes(32).toString('base64url');
  const idHash = hashSessionId(sid);
  const now = Date.now();

  insertSession({
    id_hash: idHash,
    created_at: now,
    last_seen: now,
    user_agent: userAgent,
    access_class: accessClass,
    role,
    revoked: 0,
  });

  return sid;
}

export function validateSession(sid?: string): boolean {
  if (!sid || typeof sid !== 'string') return false;
  const idHash = hashSessionId(sid);
  const record = getSession(idHash);

  if (!record || record.revoked) {
    return false;
  }

  const { config } = loadConfig();
  const maxAgeMs = (config.sessionMaxAgeDays || 30) * 86400 * 1000;
  if (Date.now() - record.last_seen > maxAgeMs) {
    revokeSessionDb(idHash);
    return false;
  }

  touchSession(idHash);
  return true;
}

export function getSessionRecord(sid?: string): SessionRecord | undefined {
  if (!sid || typeof sid !== 'string') return undefined;
  const idHash = hashSessionId(sid);
  return getSession(idHash);
}

export function revokeSession(sid?: string): void {
  if (sid && typeof sid === 'string') {
    const idHash = hashSessionId(sid);
    revokeSessionDb(idHash);
  }
}

export function revokeAllSessions(): void {
  revokeAllSessionsDb();
}

export function verifyAccessToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const { config } = loadConfig();
  if (!config.accessTokenHash) return false;
  const incomingHash = hashToken(token);
  const bufA = Buffer.from(incomingHash, 'utf-8');
  const bufB = Buffer.from(config.accessTokenHash, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyGuestToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const { config } = loadConfig();
  if (!config.guestAccessTokenHash) return false;
  const incomingHash = hashToken(token);
  const bufA = Buffer.from(incomingHash, 'utf-8');
  const bufB = Buffer.from(config.guestAccessTokenHash, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyToken(token: string): { valid: boolean; role: 'admin' | 'guest' } {
  if (!token || typeof token !== 'string') return { valid: false, role: 'guest' };
  if (verifyAccessToken(token)) {
    return { valid: true, role: 'admin' };
  }
  if (verifyGuestToken(token)) {
    return { valid: true, role: 'guest' };
  }
  return { valid: false, role: 'guest' };
}

export function getSessionCookieOptions(req: FastifyRequest, maxAgeDays = 30) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isHttps = req.protocol === 'https' || forwardedProto === 'https';
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isHttps,
    maxAge: maxAgeDays * 86400,
  };
}

import {
  recordAuditLog,
  type AuditEvent,
} from './db.js';

export { recordAuditLog, type AuditEvent };

const sessionRateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkSessionRateLimit(sessionHash: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = sessionRateLimits.get(sessionHash);
  if (!entry || now > entry.resetAt) {
    sessionRateLimits.set(sessionHash, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }
  if (entry.count >= 120) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

export function resetSessionRateLimits(): void {
  sessionRateLimits.clear();
}

export async function authHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const url = req.raw.url || '';

  // Only POST /api/auth/login, /api/setup (local only), and non-API static files are public without a session
  if (
    url.startsWith('/api/auth/login') ||
    (url.startsWith('/api/setup') && classifyRequest(req) === 'local') ||
    !url.startsWith('/api/')
  ) {
    return;
  }

  const sid = req.cookies.rr_session;
  if (sid && validateSession(sid)) {
    const sessionHash = hashSessionId(sid);
    const sessionRecord = getSessionRecord(sid);
    (req as any).sessionHash = sessionHash;
    (req as any).userRole = sessionRecord?.role || 'admin';
    const rate = checkSessionRateLimit(sessionHash);
    if (!rate.allowed) {
      reply.header('Retry-After', rate.retryAfter).status(429).send({
        error: 'too_many_requests',
        message: 'Rate limit exceeded: 120 requests per minute per session',
        retryAfter: rate.retryAfter,
      });
      return;
    }
    return;
  }

  reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required' });
}

export async function requireAdminHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if ((req as any).userRole !== 'admin') {
    reply.status(403).send({
      error: 'forbidden_guest',
      message: 'Доступно только в полном режиме',
    });
    return;
  }
}

export async function localhostAdminHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if ((req as any).userRole && (req as any).userRole !== 'admin') {
    reply.status(403).send({
      error: 'forbidden_guest',
      message: 'Доступно только в полном режиме',
    });
    return;
  }

  const { config } = loadConfig();
  const accessClass = classifyRequest(req);

  const isAllowed =
    accessClass === 'local' ||
    (accessClass === 'proxied' && !!config.allowAdminOverTunnel) ||
    (accessClass === 'lan' && !!config.allowAdminRemote);

  if (!isAllowed) {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    recordAuditLog('admin_access_denied', clientIp, userAgent);

    reply.status(403).send({
      error: 'admin_local_only',
      message: 'Доступ к настройкам возможен только с того компьютера, на котором запущен сервер.',
    });
    return;
  }

  // CSRF protection for modifying requests: check Sec-Fetch-Site, X-Requested-With, or matching Origin
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const fetchSite = req.headers['sec-fetch-site'];
    const xRequestedWith = req.headers['x-requested-with'];
    const origin = req.headers['origin'];
    const host = req.headers['host'];

    let isMatchingOrigin = false;
    if (origin && host) {
      try {
        const u = new URL(origin);
        isMatchingOrigin = u.host.toLowerCase() === host.toLowerCase() || isLoopbackIp(u.hostname);
      } catch {
        isMatchingOrigin = false;
      }
    }

    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
      reply.status(403).send({
        error: 'admin_csrf_protection',
        message: 'Direct cross-site modification to admin is forbidden',
      });
      return;
    }

    if (!fetchSite && !xRequestedWith && !isMatchingOrigin) {
      reply.status(403).send({
        error: 'admin_csrf_protection',
        message: 'Direct cross-site modification to admin is forbidden',
      });
      return;
    }
  }
}

