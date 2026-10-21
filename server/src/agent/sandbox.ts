import fs from 'node:fs';
import path from 'node:path';

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

// Windows reserved device names
const WINDOWS_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export interface ResolvedPathResult {
  resolvedPath: string;
  relativePath: string;
}

/**
 * Validates and safely resolves a user-provided path inside workDir.
 * Strict rules:
 * 1. Reject null bytes, colons (drive letters, alternate data streams), UNC paths, and absolute paths.
 * 2. Check each path segment for Windows device names, trailing dots, trailing spaces, and '..'.
 * 3. Normalize and resolve against realpath(workDir).
 * 4. Verify that realpath of existing path and all ancestors stays inside realpath(workDir).
 * 5. Case-insensitive comparison on Windows.
 */
export function resolveInsideWorkDir(workDir: string, userPath: string): ResolvedPathResult {
  if (typeof userPath !== 'string' || userPath.trim() === '') {
    userPath = '.';
  }

  // 1. Check for null bytes
  if (userPath.includes('\0')) {
    throw new SandboxError('Null bytes are forbidden in paths');
  }

  // 2. Check for alternate data streams and drive letters (any colon)
  if (userPath.includes(':')) {
    throw new SandboxError('Colons (drive letters and alternate data streams) are forbidden in paths');
  }

  // 3. Check for UNC and long path prefixes (//, \\, \\?\)
  if (userPath.startsWith('//') || userPath.startsWith('\\\\')) {
    throw new SandboxError('UNC and long path prefixes (\\\\) are forbidden');
  }

  // Normalize /workspace or workspace prefix commonly emitted by container-trained LLMs
  let cleanUserPath = userPath.trim().replace(/\\/g, '/');
  if (cleanUserPath === '/workspace' || cleanUserPath === 'workspace' || cleanUserPath === '/workspace/') {
    cleanUserPath = '.';
  } else if (cleanUserPath.startsWith('/workspace/')) {
    cleanUserPath = cleanUserPath.slice('/workspace/'.length);
  } else if (cleanUserPath.startsWith('workspace/')) {
    cleanUserPath = cleanUserPath.slice('workspace/'.length);
  }

  // 4. Reject absolute paths (starting with / or \)
  if (cleanUserPath.startsWith('/') || cleanUserPath.startsWith('\\') || path.isAbsolute(cleanUserPath)) {
    throw new SandboxError('Absolute paths are forbidden');
  }

  // 5. Inspect individual segments
  const segments = cleanUserPath.split('/').filter(Boolean);

  for (const seg of segments) {
    // Path traversal check
    if (seg === '..') {
      throw new SandboxError("Path traversal ('..') is forbidden");
    }

    // Trailing dot or space check
    if (seg.endsWith(' ') || (seg.endsWith('.') && seg !== '.')) {
      throw new SandboxError('Trailing spaces and trailing dots are forbidden in path components');
    }

    // Windows device name check (e.g. 'con', 'nul.txt', 'aux.json')
    const baseName = seg.split('.')[0].toLowerCase();
    if (WINDOWS_DEVICE_NAMES.has(baseName)) {
      throw new SandboxError(`Windows device name '${seg}' is forbidden`);
    }
  }

  // Ensure workDir exists on disk
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  const realWorkDir = fs.realpathSync(workDir);
  const realWorkDirLower = realWorkDir.toLowerCase();

  // Combine and normalize candidate path
  const targetCandidate = path.resolve(realWorkDir, segments.join(path.sep));
  const targetLower = targetCandidate.toLowerCase();

  const isInside =
    targetLower === realWorkDirLower ||
    targetLower.startsWith(realWorkDirLower.endsWith(path.sep) ? realWorkDirLower : realWorkDirLower + path.sep);

  if (!isInside) {
    throw new SandboxError('Path resolves outside of workspace directory');
  }

  // Check existing path or longest existing ancestor for symlinks / junctions pointing outside workDir
  let checkPath = targetCandidate;
  while (checkPath.length >= realWorkDir.length) {
    if (fs.existsSync(checkPath)) {
      try {
        const realCheck = fs.realpathSync(checkPath).toLowerCase();
        const ancestorInside =
          realCheck === realWorkDirLower ||
          realCheck.startsWith(realWorkDirLower.endsWith(path.sep) ? realWorkDirLower : realWorkDirLower + path.sep);
        if (!ancestorInside) {
          throw new SandboxError('Symlink or junction points outside of workspace directory');
        }
      } catch (err: any) {
        throw new SandboxError(`Failed to verify path security: ${err.message}`);
      }
      break;
    }
    const parent = path.dirname(checkPath);
    if (parent === checkPath) break;
    checkPath = parent;
  }

  const rel = path.relative(realWorkDir, targetCandidate);
  return {
    resolvedPath: targetCandidate,
    relativePath: rel === '' ? '.' : rel.replace(/\\/g, '/'),
  };
}

export interface QuotaResult {
  currentBytes: number;
  quotaBytes: number;
  fileCount: number;
}

/**
 * Calculates total size in bytes and number of files in a directory.
 */
export function calculateDirSize(dirPath: string): { totalBytes: number; fileCount: number } {
  let totalBytes = 0;
  let fileCount = 0;

  function walk(current: string) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          totalBytes += stat.size;
          fileCount++;
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  walk(dirPath);
  return { totalBytes, fileCount };
}

/**
 * Enforces workspace quota and max file count.
 */
export function checkQuota(
  workDir: string,
  quotaGB: number,
  additionalBytes = 0,
  maxFiles = 10000
): QuotaResult {
  const quotaBytes = quotaGB * 1024 * 1024 * 1024;
  const { totalBytes, fileCount } = calculateDirSize(workDir);

  if (fileCount >= maxFiles) {
    throw new SandboxError(`Workspace file limit reached (${maxFiles} files). Please delete unused files.`);
  }

  if (totalBytes + additionalBytes > quotaBytes) {
    const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);
    const limitMB = (quotaBytes / (1024 * 1024)).toFixed(1);
    throw new SandboxError(
      `Workspace quota exceeded: ${usedMB} MB used of ${limitMB} MB limit (${quotaGB} GB). Action rejected.`
    );
  }

  return { currentBytes: totalBytes, quotaBytes, fileCount };
}
