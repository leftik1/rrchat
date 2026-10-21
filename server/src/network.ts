import type { FastifyRequest } from 'fastify';
import { loadConfig } from './config.js';

export type RequestAccessClass = 'local' | 'lan' | 'proxied';

/**
 * Normalizes IPv4-mapped IPv6 addresses to standard IPv4.
 */
export function normalizeIp(ip: string): string {
  let cleaned = ip.trim();
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }
  return cleaned;
}

/**
 * Checks if an IP is loopback (127.0.0.1, ::1, localhost).
 */
export function isLoopbackIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip === '0:0:0:0:0:0:0:1'
  );
}

/**
 * Checks if an IPv4 address is in private subnets (10/8, 172.16/12, 192.168/16, 100.64/10 CGNAT).
 */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  // 10.0.0.0 - 10.255.255.255 (10/8)
  if (parts[0] === 10) return true;

  // 172.16.0.0 - 172.31.255.255 (172.16/12)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0 - 192.168.255.255 (192.168/16)
  if (parts[0] === 192 && parts[1] === 168) return true;

  // 100.64.0.0 - 100.127.255.255 (100.64/10 Tailscale/Carrier-grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

  // 169.254.0.0 - 169.254.255.255 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;

  return false;
}

/**
 * Checks if an IPv6 address is private / link-local (fe80::/10, fc00::/7).
 */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // fe80::/10: fe8, fe9, fea, feb
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  // fc00::/7: fc, fd
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  return false;
}

/**
 * Checks if an IP is in private LAN ranges (IPv4 or IPv6).
 */
export function isPrivateIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  if (isLoopbackIp(ip)) return false;
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

/**
 * Checks if a string looks like an IP address (IPv4 or IPv6).
 */
export function isIpAddress(host: string): boolean {
  const cleaned = normalizeIp(host.replace(/^\[|\]$/g, ''));
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleaned)) return true;
  if (cleaned.includes(':')) return true;
  return false;
}

/**
 * Extracts and cleans the Host header without port.
 */
export function getCleanHost(req: FastifyRequest): string {
  const rawHost = (req.headers.host || '').trim();
  if (rawHost.startsWith('[')) {
    // IPv6 literal with port: [::1]:3000
    const endBracket = rawHost.indexOf(']');
    if (endBracket !== -1) {
      return rawHost.substring(0, endBracket + 1).toLowerCase();
    }
  }
  return rawHost.split(':')[0].toLowerCase();
}

/**
 * Classifies the incoming HTTP request:
 * - 'local': connection from loopback, Host is localhost/127.0.0.1/[::1], no proxy headers
 * - 'lan': connection from private subnet or Host is private LAN address, no proxy headers
 * - 'proxied': connection through Tailscale Funnel or reverse proxy
 */
export function classifyRequest(req: FastifyRequest): RequestAccessClass {
  const { config } = loadConfig();
  const rawSocketIp = req.socket?.remoteAddress || (req.raw?.socket as any)?.remoteAddress || req.ip || '';
  const socketIp = normalizeIp(rawSocketIp);
  const host = getCleanHost(req);

  const trustProxy = typeof config.trustProxy === 'boolean' ? config.trustProxy : true;

  // 1. Connection is NOT from loopback
  if (!isLoopbackIp(socketIp)) {
    // Foreign or direct LAN connection: ignore any X-Forwarded-For or Tailscale headers
    if (isPrivateIp(socketIp)) {
      return 'lan';
    }
    // Public non-loopback connection without trusted loopback proxy
    return 'proxied';
  }

  // 2. Connection is from loopback (127.0.0.1 / ::1)
  // Check for proxy indications
  const hasTailscaleHeader = !!req.headers['tailscale-user-login'];
  const hasForwardedProto = !!req.headers['x-forwarded-proto'];
  const isTsNet = host.endsWith('.ts.net') || host === 'ts.net';
  const isAllowedDomain = (config.allowedHosts || []).some(
    (h) => h.toLowerCase() === host && !isIpAddress(h)
  );

  let forwardedClientIp: string | null = null;
  const xff = req.headers['x-forwarded-for'];
  if (trustProxy && xff) {
    const rawVal = Array.isArray(xff) ? xff[xff.length - 1] : xff;
    const parts = rawVal.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Rightmost IP before proxy
      forwardedClientIp = normalizeIp(parts[parts.length - 1]);
    }
  }

  const xRealIp = req.headers['x-real-ip'];
  if (trustProxy && !forwardedClientIp && xRealIp && typeof xRealIp === 'string') {
    forwardedClientIp = normalizeIp(xRealIp);
  }

  const hasRemoteForwardedIp =
    forwardedClientIp !== null && !isLoopbackIp(forwardedClientIp);

  // If proxy headers or tunnel indicators exist
  if (
    hasTailscaleHeader ||
    isTsNet ||
    isAllowedDomain ||
    hasRemoteForwardedIp ||
    hasForwardedProto
  ) {
    if (forwardedClientIp && isPrivateIp(forwardedClientIp) && !isTsNet && !hasTailscaleHeader) {
      return 'lan';
    }
    return 'proxied';
  }

  // No proxy indicators on loopback connection
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
    return 'local';
  }

  if (isPrivateIp(host)) {
    return 'lan';
  }

  const isAllowedHostIp = (config.allowedHosts || []).some(
    (h) => h.toLowerCase() === host && isIpAddress(h)
  );
  if (isAllowedHostIp) {
    return 'lan';
  }

  return 'proxied';
}
