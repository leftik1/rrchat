import fs from 'node:fs';
import path from 'node:path';

export interface ScannedModel {
  id: string;
  name: string;
  filePath: string;
  totalSize: number;
  hasVision: boolean;
  projectorPath?: string;
  shardsCount: number;
  isAuxCandidate: boolean;
  isMoE?: boolean;
  layersCount?: number;
  contextLength?: number;
  parametersCount?: number;
  quantization?: string;
}

export interface ScannedProjector {
  name: string;
  fullPath: string;
  size: number;
}

export interface GgufMetadata {
  architecture?: string;
  layersCount?: number;
  contextLength?: number;
  parametersCount?: number;
  fileType?: number;
  quantization?: string;
}

interface CachedMeta {
  mtimeMs: number;
  size: number;
  meta: GgufMetadata;
}
const metaCache = new Map<string, CachedMeta>();

let cachedScan: { modelsDir: string; timestamp: number; result: ScannedModel[] } | null = null;

export function invalidateModelsCache(): void {
  cachedScan = null;
}

export function readGgufMetadata(filePath: string): GgufMetadata {
  try {
    const st = fs.statSync(filePath);
    const cached = metaCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
      return cached.meta;
    }

    const fd = fs.openSync(filePath, 'r');
    let fileOffset = 0;
    function readBytes(n: number): Buffer {
      const b = Buffer.alloc(n);
      fs.readSync(fd, b, 0, n, fileOffset);
      fileOffset += n;
      return b;
    }

    const magic = readBytes(4).toString();
    if (magic !== 'GGUF') {
      fs.closeSync(fd);
      return {};
    }

    const version = readBytes(4).readUInt32LE(0);
    const tensorCount = readBytes(8).readBigUInt64LE(0);
    const kvCount = Number(readBytes(8).readBigUInt64LE(0));
    const meta: Record<string, any> = {};

    for (let i = 0; i < kvCount; i++) {
      const keyLen = Number(readBytes(8).readBigUInt64LE(0));
      const key = readBytes(keyLen).toString('utf8');
      const vType = readBytes(4).readUInt32LE(0);

      function readVal(type: number): any {
        if (type === 0) return readBytes(1).readUInt8(0);
        if (type === 1) return readBytes(1).readInt8(0);
        if (type === 2) return readBytes(2).readUInt16LE(0);
        if (type === 3) return readBytes(2).readInt16LE(0);
        if (type === 4) return readBytes(4).readUInt32LE(0);
        if (type === 5) return readBytes(4).readInt32LE(0);
        if (type === 6) return readBytes(4).readFloatLE(0);
        if (type === 7) return readBytes(1).readUInt8(0) !== 0;
        if (type === 8) {
          const l = Number(readBytes(8).readBigUInt64LE(0));
          return readBytes(l).toString('utf8');
        }
        if (type === 9) {
          const itemType = readBytes(4).readUInt32LE(0);
          const arrLen = Number(readBytes(8).readBigUInt64LE(0));
          if (key.startsWith('tokenizer.ggml.')) {
            for (let j = 0; j < arrLen; j++) readVal(itemType);
            return null;
          }
          const arr: any[] = [];
          for (let j = 0; j < arrLen; j++) {
            arr.push(readVal(itemType));
          }
          return arr;
        }
        if (type === 10) return Number(readBytes(8).readBigUInt64LE(0));
        if (type === 11) return Number(readBytes(8).readBigInt64LE(0));
        if (type === 12) return readBytes(8).readDoubleLE(0);
        return null;
      }

      const val = readVal(vType);
      if (!key.startsWith('tokenizer.ggml.')) {
        meta[key] = val;
      }
    }
    fs.closeSync(fd);

    const arch = meta['general.architecture'] as string | undefined;
    const layersCount = arch ? (meta[`${arch}.block_count`] as number | undefined) : undefined;
    const contextLength = arch ? (meta[`${arch}.context_length`] as number | undefined) : undefined;
    const parametersCount = meta['general.parameter_count'] as number | undefined;
    const fileType = meta['general.file_type'] as number | undefined;

    // Detect quantization from filename or fileType
    const base = path.basename(filePath);
    const quantMatch = base.match(/(Q[0-9]_[A-Z0-9_]+|F16|F32|BF16|IQ[0-9]_[A-Z0-9_]+)/i);
    const quantization = quantMatch ? quantMatch[1].toUpperCase() : undefined;

    const result: GgufMetadata = {
      architecture: arch,
      layersCount,
      contextLength,
      parametersCount,
      fileType,
      quantization,
    };
    metaCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, meta: result });
    return result;
  } catch {
    return {};
  }
}

const SHARD_REGEX = /^(.*?)-(\d{5})-of-(\d{5})\.gguf$/i;
const MMPROJ_REGEX = /^mmproj.*\.gguf$/i;
const IGNORED_DIRS = new Set(['sisi', 'templates', 'test', 'tests', '.git', 'node_modules', 'dist']);

function isIgnoredFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (!lower.endsWith('.gguf')) return true;
  // Ignore tokenizer vocabularies and test files from llama.cpp repo
  if (lower.startsWith('ggml-vocab') || lower.startsWith('vocab-') || lower.includes('-vocab-')) {
    return true;
  }
  return false;
}

export function scanModelsDirectory(modelsDir: string): ScannedModel[] {
  if (!fs.existsSync(modelsDir)) {
    return [];
  }

  if (cachedScan && cachedScan.modelsDir === modelsDir && Date.now() - cachedScan.timestamp < 10000) {
    return cachedScan.result;
  }

  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  const ggufFiles: { relativePath: string; fullPath: string; size: number }[] = [];

  function walk(dir: string, base: string) {
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (IGNORED_DIRS.has(item.name.toLowerCase())) continue;
      const full = path.join(dir, item.name);
      const rel = path.join(base, item.name);
      if (item.isDirectory()) {
        walk(full, rel);
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.gguf')) {
        try {
          const st = fs.statSync(full);
          if (!isIgnoredFile(item.name)) {
            ggufFiles.push({ relativePath: rel, fullPath: full, size: st.size });
          }
        } catch {
          // ignore stat errors
        }
      }
    }
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
    const full = path.join(modelsDir, entry.name);
    if (entry.isDirectory()) {
      walk(full, entry.name);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
      try {
        const st = fs.statSync(full);
        if (!isIgnoredFile(entry.name)) {
          ggufFiles.push({ relativePath: entry.name, fullPath: full, size: st.size });
        }
      } catch {
        // ignore
      }
    }
  }

  // Separate mmproj files and regular models
  const projectors: { name: string; fullPath: string; dir: string }[] = [];
  const modelFiles: typeof ggufFiles = [];

  for (const f of ggufFiles) {
    const basename = path.basename(f.fullPath);
    if (MMPROJ_REGEX.test(basename)) {
      projectors.push({ name: basename, fullPath: f.fullPath, dir: path.dirname(f.fullPath) });
    } else {
      modelFiles.push(f);
    }
  }

  // Group shards
  const grouped = new Map<string, { files: typeof modelFiles; totalSize: number; mainFile: string }>();

  for (const f of modelFiles) {
    const basename = path.basename(f.fullPath);
    const shardMatch = basename.match(SHARD_REGEX);

    if (shardMatch) {
      const modelBase = shardMatch[1];
      const shardIndex = parseInt(shardMatch[2], 10);
      const shardTotal = parseInt(shardMatch[3], 10);
      const dirName = path.dirname(f.fullPath);
      const key = path.join(dirName, modelBase);

      let group = grouped.get(key);
      if (!group) {
        group = { files: [], totalSize: 0, mainFile: f.fullPath };
        grouped.set(key, group);
      }
      group.files.push(f);
      group.totalSize += f.size;
      if (shardIndex === 1) {
        group.mainFile = f.fullPath;
      }
    } else {
      const key = f.fullPath;
      grouped.set(key, {
        files: [f],
        totalSize: f.size,
        mainFile: f.fullPath,
      });
    }
  }

  const result: ScannedModel[] = [];

  for (const [key, group] of grouped.entries()) {
    const mainFile = group.mainFile;
    const baseName = path.basename(mainFile, '.gguf').replace(/-\d{5}-of-\d{5}$/i, '');
    const modelDir = path.dirname(mainFile);

    // Find projector: either in a dedicated subdirectory or matching prefix
    let matchedProjector: typeof projectors[0] | undefined;
    if (path.resolve(modelDir) !== path.resolve(modelsDir)) {
      // It's in a dedicated subdirectory
      matchedProjector = projectors.find((p) => path.resolve(p.dir) === path.resolve(modelDir));
    }
    if (!matchedProjector) {
      matchedProjector = projectors.find((p) => {
        const pLower = p.name.toLowerCase();
        const mLower = baseName.toLowerCase();
        const pTag = pLower.replace(/^mmproj[-_]?/i, '').replace(/\.gguf$/i, '');
        return pLower.includes(mLower) || (pTag.length >= 3 && mLower.includes(pTag));
      });
    }

    const lowerName = baseName.toLowerCase();
    const meta = readGgufMetadata(mainFile);
    const archLower = (meta.architecture || '').toLowerCase();
    const isMoE =
      archLower.includes('moe') ||
      lowerName.includes('moe') ||
      lowerName.includes('a3b') ||
      lowerName.includes('a2b') ||
      lowerName.includes('mixtral');

    // If still no projector matched, check if there's a standalone mmproj (like mmproj-F16.gguf)
    // and this model is a vision-capable architecture (e.g. Qwen 3.6 / MoE / VL)
    if (!matchedProjector) {
      const isVisionCandidate =
        archLower.includes('clip') ||
        lowerName.includes('qwen') ||
        lowerName.includes('vision') ||
        lowerName.includes('vl') ||
        lowerName.includes('minicpm') ||
        lowerName.includes('llava');
      if (isVisionCandidate) {
        matchedProjector = projectors.find((p) => {
          const pLower = p.name.toLowerCase();
          return !pLower.includes('ocr');
        });
      }
    }

    const isAuxCandidate =
      !!matchedProjector ||
      lowerName.includes('ocr') ||
      lowerName.includes('vision') ||
      lowerName.includes('minicpm-v');

    // Param count heuristic if not in meta: check filename for 7b, 24b, etc.
    let paramCount = meta.parametersCount;
    if (!paramCount) {
      const pMatch = baseName.match(/(\d+(?:\.\d+)?)[bB]/);
      if (pMatch) {
        paramCount = Math.round(parseFloat(pMatch[1]) * 1e9);
      }
    }

    result.push({
      id: baseName,
      name: baseName,
      filePath: mainFile,
      totalSize: group.totalSize,
      hasVision: !!matchedProjector || lowerName.includes('ocr'),
      projectorPath: matchedProjector?.fullPath,
      shardsCount: group.files.length,
      isAuxCandidate,
      isMoE,
      layersCount: meta.layersCount,
      contextLength: meta.contextLength,
      parametersCount: paramCount,
      quantization: meta.quantization,
    });
  }

  const sorted = result.sort((a, b) => a.name.localeCompare(b.name));
  cachedScan = {
    modelsDir,
    timestamp: Date.now(),
    result: sorted,
  };
  return sorted;
}

export function scanProjectors(modelsDir: string): ScannedProjector[] {
  if (!fs.existsSync(modelsDir)) return [];
  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  const result: ScannedProjector[] = [];
  for (const entry of entries) {
    if (entry.isFile() && MMPROJ_REGEX.test(entry.name)) {
      try {
        const full = path.join(modelsDir, entry.name);
        const st = fs.statSync(full);
        result.push({ name: entry.name, fullPath: full, size: st.size });
      } catch {
        // ignore
      }
    }
  }
  return result;
}


