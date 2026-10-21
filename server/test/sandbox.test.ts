import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveInsideWorkDir, checkQuota, SandboxError } from '../src/agent/sandbox.js';

describe('Sandbox Path Security', () => {
  let testWorkDir: string;

  beforeEach(() => {
    testWorkDir = path.join(os.tmpdir(), `test_work_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(testWorkDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testWorkDir)) {
      try {
        fs.rmSync(testWorkDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('allows valid relative paths within workDir', () => {
    const res = resolveInsideWorkDir(testWorkDir, 'src/index.ts');
    expect(res.resolvedPath).toBe(path.resolve(testWorkDir, 'src', 'index.ts'));
    expect(res.relativePath).toBe('src/index.ts');

    const rootRes = resolveInsideWorkDir(testWorkDir, '.');
    expect(rootRes.resolvedPath).toBe(fs.realpathSync(testWorkDir));
    expect(rootRes.relativePath).toBe('.');

    // LLM container-like prefixes (/workspace) should be normalized safely
    const wsRes = resolveInsideWorkDir(testWorkDir, '/workspace/create_pdf.py');
    expect(wsRes.resolvedPath).toBe(path.resolve(testWorkDir, 'create_pdf.py'));
    expect(wsRes.relativePath).toBe('create_pdf.py');

    const wsRoot = resolveInsideWorkDir(testWorkDir, '/workspace');
    expect(wsRoot.resolvedPath).toBe(fs.realpathSync(testWorkDir));
    expect(wsRoot.relativePath).toBe('.');
  });

  it('rejects path traversal attempts (..)', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, '../secret.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, '..\\secret.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'a/../../secret.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, '..')).toThrow(SandboxError);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, '/etc/passwd')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, '\\Windows\\System32')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'C:\\Windows')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'D:/llamacpp')).toThrow(SandboxError);
  });

  it('rejects UNC and long path prefixes', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, '\\\\server\\share\\file.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, '//server/share/file.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, '\\\\?\\C:\\file.txt')).toThrow(SandboxError);
  });

  it('rejects null bytes', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, 'safe_file\0.txt')).toThrow(SandboxError);
  });

  it('rejects alternate data streams (ADS)', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, 'file.txt:hidden')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'file.txt:$DATA')).toThrow(SandboxError);
  });

  it('rejects Windows device names', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, 'con')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'nul.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'aux.json')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'com1')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'lpt9.dat')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'sub/con/test.txt')).toThrow(SandboxError);
  });

  it('rejects trailing dots and spaces in path components', () => {
    expect(() => resolveInsideWorkDir(testWorkDir, 'file. ')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'dir./test.txt')).toThrow(SandboxError);
    expect(() => resolveInsideWorkDir(testWorkDir, 'test.')).toThrow(SandboxError);
  });

  it('enforces case-insensitivity on Windows', () => {
    const realWork = fs.realpathSync(testWorkDir);
    const sub = path.join(realWork, 'MyFolder');
    fs.mkdirSync(sub);

    const res = resolveInsideWorkDir(testWorkDir, 'myfolder/file.txt');
    expect(res.resolvedPath.toLowerCase()).toBe(path.join(realWork, 'myfolder', 'file.txt').toLowerCase());
  });

  it('enforces quota limits', () => {
    // 0.000001 GB is ~1073 bytes
    const smallQuotaGB = 0.000001;
    const testFile = path.join(testWorkDir, 'test.dat');
    fs.writeFileSync(testFile, Buffer.alloc(800));

    // Additional 100 bytes is within 1073 bytes limit
    expect(() => checkQuota(testWorkDir, smallQuotaGB, 100)).not.toThrow();

    // Additional 500 bytes exceeds 1073 bytes limit
    expect(() => checkQuota(testWorkDir, smallQuotaGB, 500)).toThrow(SandboxError);
  });
});
