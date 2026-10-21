import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import {
  verifyToken,
  createSession,
  revokeSession,
  validateSession,
  getSessionRecord,
  requireAdminHook,
  checkRateLimit,
  resetRateLimit,
  getSessionCookieOptions,
  hashSessionId,
  classifyRequest,
  recordAuditLog,
} from '../auth.js';
import { getActiveSessionsDb, revokeSessionDb } from '../db.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (req, reply) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const rate = checkRateLimit(ip);
    if (!rate.allowed) {
      reply.header('Retry-After', rate.retryAfter);
      return reply.status(429).send({
        error: 'Too many attempts. Try again in ' + (rate.retryAfter || 60) + ' s',
        retryAfter: rate.retryAfter,
      });
    }

    const body = (req.body as any) || {};
    const token = body.token;

    if (!token || typeof token !== 'string') {
      recordAuditLog('auth_fail', ip, userAgent, { reason: 'missing_token' });
      return reply.status(400).send({ error: 'Token is required' });
    }

    const auth = verifyToken(token);
    if (!auth.valid) {
      recordAuditLog('auth_fail', ip, userAgent, { reason: 'invalid_token' });
      return reply.status(401).send({ error: 'Invalid token' });
    }

    resetRateLimit(ip);
    const accessClass = classifyRequest(req);
    const sid = createSession(userAgent, accessClass, auth.role);
    const cookieOpts = getSessionCookieOptions(req);

    recordAuditLog('auth_success', ip, userAgent, { accessClass, role: auth.role });
    reply.setCookie('rr_session', sid, cookieOpts);
    return { ok: true, role: auth.role };
  });

  fastify.get('/verify', async (req, reply) => {
    const sid = req.cookies.rr_session;
    if (validateSession(sid)) {
      const rec = getSessionRecord(sid);
      return { authenticated: true, role: rec?.role || 'admin' };
    }
    return reply.status(401).send({ authenticated: false });
  });

  fastify.post('/logout', async (req, reply) => {
    const sid = req.cookies.rr_session;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    if (sid) {
      revokeSession(sid);
      recordAuditLog('auth_logout', ip, userAgent);
    }
    reply.clearCookie('rr_session', { path: '/' });
    return { ok: true };
  });

  fastify.get('/sessions', { preHandler: requireAdminHook }, async (req, reply) => {
    const currentSid = req.cookies.rr_session;
    const currentHash = currentSid ? hashSessionId(currentSid) : null;
    const active = getActiveSessionsDb();

    const sessions = active.map((s) => ({
      id: s.id_hash.substring(0, 8),
      id_hash: s.id_hash,
      created_at: s.created_at,
      last_seen: s.last_seen,
      user_agent: s.user_agent,
      access_class: s.access_class,
      role: s.role || 'admin',
      is_current: s.id_hash === currentHash,
    }));

    return { sessions };
  });

  fastify.delete('/sessions/:id', { preHandler: requireAdminHook }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id || typeof id !== 'string') {
      return reply.status(400).send({ error: 'Session ID is required' });
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    revokeSessionDb(id);
    recordAuditLog('session_revoked', ip, userAgent, { sessionId: id });
    return { ok: true };
  });
};

