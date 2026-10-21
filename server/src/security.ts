import type { FastifyRequest, FastifyReply } from 'fastify';
import { loadConfig } from './config.js';
import { getCleanHost, isLoopbackIp, isPrivateIp, isIpAddress, normalizeIp } from './network.js';

export const CSP_HEADER_VALUE =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com data:; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self';";

/**
 * Validates whether the incoming Host header is allowed (DNS Rebinding protection).
 */
export function isHostAllowed(hostHeader: string, allowedHosts: string[] = []): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase().trim();

  // 1. Loopback addresses
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
    return true;
  }

  // 2. Private LAN IPs (10/8, 172.16/12, 192.168/16, 100.64/10 CGNAT, fe80::, fc00::)
  if (isPrivateIp(host)) {
    return true;
  }

  // 3. Tailscale domain (*.ts.net)
  if (host.endsWith('.ts.net') || host === 'ts.net') {
    return true;
  }

  // 4. Custom allowed hosts
  const normalizedAllowed = allowedHosts.map((h) => h.toLowerCase().trim());
  if (normalizedAllowed.includes(host)) {
    return true;
  }

  return false;
}

/**
 * Checks Origin / Referer header on state-changing requests and SSE to prevent CSRF.
 */
export function isOriginAllowed(
  originOrReferer: string | undefined,
  currentHost: string,
  allowedHosts: string[] = []
): boolean {
  if (!originOrReferer) return false;

  try {
    const url = new URL(originOrReferer);
    const originHost = url.hostname.toLowerCase();
    const cleanCurrent = currentHost.split(':')[0].toLowerCase();

    // Direct match with request Host
    if (originHost === cleanCurrent) {
      return true;
    }

    // Loopback variations match each other
    if (isLoopbackIp(originHost) && isLoopbackIp(cleanCurrent)) {
      return true;
    }

    // Tailscale .ts.net match
    if (originHost.endsWith('.ts.net') && cleanCurrent.endsWith('.ts.net')) {
      return true;
    }

    // Explicitly allowed hosts
    const normalizedAllowed = allowedHosts.map((h) => h.toLowerCase().trim());
    if (normalizedAllowed.includes(originHost)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Fastify preHandler hook for Host header check (DNS Rebinding protection)
 */
export async function hostCheckHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { config } = loadConfig();
  const host = getCleanHost(req);

  if (!isHostAllowed(host, config.allowedHosts)) {
    return reply.status(403).send({
      error: 'invalid_host_header',
      message: 'Host header not allowed',
    });
  }
}

/**
 * Fastify preHandler hook for Origin validation on mutations and SSE
 */
export async function originCheckHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const method = req.method.toUpperCase();
  const url = req.raw.url || '';
  const isSse = url.includes('/stream') || url.includes('/events');
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  if (!isMutation && !isSse) {
    return;
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'same-origin' || secFetchSite === 'none') {
    return;
  }

  const { config } = loadConfig();
  const host = getCleanHost(req);
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  const targetHeader = origin || referer;

  if (!targetHeader) {
    if (!isMutation) {
      return;
    }
    reply.status(403).send({
      error: 'origin_required',
      message: 'Origin or Referer header required for state-changing or SSE requests',
    });
    return;
  }

  if (!isOriginAllowed(targetHeader, host, config.allowedHosts)) {
    reply.status(403).send({
      error: 'origin_mismatch',
      message: 'Cross-origin request forbidden',
    });
  }
}

/**
 * Fastify onSend hook to inject security headers
 */
export async function securityHeadersHook(
  req: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  reply.header('Content-Security-Policy', CSP_HEADER_VALUE);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Cross-Origin-Opener-Policy', 'same-origin');

  const url = req.raw.url || '';
  if (url.startsWith('/api/')) {
    // If not already set to SSE no-transform
    const existingCache = reply.getHeader('Cache-Control');
    if (!existingCache || typeof existingCache !== 'string' || !existingCache.includes('no-transform')) {
      reply.header('Cache-Control', 'no-store');
    }
  }

  return payload;
}
