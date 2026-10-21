import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanModelsDirectory } from '../src/models/scanner.js';

describe('Model Scanner', () => {
  const tmpDir = path.join(os.tmpdir(), `test-models-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    // Single model
    fs.writeFileSync(path.join(tmpDir, 'model-single.gguf'), 'dummy');
    // Multi-shard model
    fs.writeFileSync(path.join(tmpDir, 'sharded-model-00001-of-00002.gguf'), 'shard1');
    fs.writeFileSync(path.join(tmpDir, 'sharded-model-00002-of-00002.gguf'), 'shard2');
    // Model with vision mmproj
    fs.writeFileSync(path.join(tmpDir, 'vision-model.gguf'), 'vision');
    fs.writeFileSync(path.join(tmpDir, 'mmproj-vision-model-f16.gguf'), 'projector');
    // Non-gguf file
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'text');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans directory and groups shards properly', () => {
    const list = scanModelsDirectory(tmpDir);
    expect(list.length).toBe(3);

    const single = list.find((m) => m.id === 'model-single');
    expect(single).toBeDefined();
    expect(single?.shardsCount).toBe(1);
    expect(single?.hasVision).toBe(false);

    const sharded = list.find((m) => m.id === 'sharded-model');
    expect(sharded).toBeDefined();
    expect(sharded?.shardsCount).toBe(2);

    const vision = list.find((m) => m.id === 'vision-model');
    expect(vision).toBeDefined();
    expect(vision?.hasVision).toBe(true);
    expect(vision?.projectorPath).toContain('mmproj');
  });
});
