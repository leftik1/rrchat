import { describe, it, expect } from 'vitest';
import { isLocalhost, checkRateLimit, resetRateLimit, createSession, validateSession, revokeSession, revokeAllSessions } from '../src/auth.js';
import { hashToken } from '../src/config.js';

describe('Auth & Security', () => {
  it('correctly identifies localhost addresses', () => {
    expect(isLocalhost('127.0.0.1')).toBe(true);
    expect(isLocalhost('::1')).toBe(true);
    expect(isLocalhost('::ffff:127.0.0.1')).toBe(true);
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('192.168.1.141')).toBe(false);
    expect(isLocalhost('10.0.0.1')).toBe(false);
  });

  it('hashes token deterministically with sha256', () => {
    const hash1 = hashToken('test-token-123');
    const hash2 = hashToken('test-token-123');
    const hashDiff = hashToken('other-token');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiff);
    expect(hash1.length).toBe(64); // sha256 hex
  });

  it('rate limits login attempts per IP', () => {
    const testIp = '10.20.30.40';
    resetRateLimit(testIp);

    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(testIp);
      expect(res.allowed).toBe(true);
    }

    const blocked = checkRateLimit(testIp);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);

    resetRateLimit(testIp);
    expect(checkRateLimit(testIp).allowed).toBe(true);
  });

  it('persists and validates auth sessions', () => {
    const sid = createSession();
    expect(typeof sid).toBe('string');
    expect(validateSession(sid)).toBe(true);

    revokeSession(sid);
    expect(validateSession(sid)).toBe(false);
  });

  it('revokes all sessions on demand', () => {
    const sid1 = createSession();
    const sid2 = createSession();
    expect(validateSession(sid1)).toBe(true);
    expect(validateSession(sid2)).toBe(true);

    revokeAllSessions();
    expect(validateSession(sid1)).toBe(false);
    expect(validateSession(sid2)).toBe(false);
  });
});

