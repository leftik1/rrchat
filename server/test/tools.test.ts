import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeTool, truncateOutput, MAX_TOOL_OUTPUT_LENGTH } from '../src/agent/tools.js';
import { db } from '../src/db.js';

describe('Work Mode Agent Tools', () => {
  let testWorkDir: string;
  const testChatId = 'test_chat_tools';

  beforeEach(() => {
    testWorkDir = path.join(os.tmpdir(), `test_tools_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
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

  it('writes and reads a text file', async () => {
    const writeRes = await executeTool(
      'write_file',
      { path: 'src/main.ts', content: 'console.log("hello world");' },
      testWorkDir,
      5,
      testChatId
    );
    expect(writeRes.ok).toBe(true);
    expect(writeRes.output).toContain('Successfully wrote');

    const readRes = await executeTool(
      'read_file',
      { path: 'src/main.ts' },
      testWorkDir,
      5,
      testChatId
    );
    expect(readRes.ok).toBe(true);
    expect(readRes.output).toBe('console.log("hello world");');
  });

  it('lists directory contents', async () => {
    fs.mkdirSync(path.join(testWorkDir, 'docs'));
    fs.writeFileSync(path.join(testWorkDir, 'docs', 'readme.txt'), 'info');

    const res = await executeTool('list_dir', { path: 'docs' }, testWorkDir, 5, testChatId);
    expect(res.ok).toBe(true);
    expect(res.output).toContain('[FILE] readme.txt');
  });

  it('creates directories with make_dir', async () => {
    const res = await executeTool('make_dir', { path: 'nested/deep/folder' }, testWorkDir, 5, testChatId);
    expect(res.ok).toBe(true);
    expect(fs.existsSync(path.join(testWorkDir, 'nested', 'deep', 'folder'))).toBe(true);
  });

  it('edits a file with unique substring replacement', async () => {
    const filePath = 'config.txt';
    await executeTool(
      'write_file',
      { path: filePath, content: 'port = 8080\nhost = localhost\n' },
      testWorkDir,
      5,
      testChatId
    );

    const editRes = await executeTool(
      'edit_file',
      { path: filePath, old_string: 'port = 8080', new_string: 'port = 3000' },
      testWorkDir,
      5,
      testChatId
    );
    expect(editRes.ok).toBe(true);

    const readRes = await executeTool('read_file', { path: filePath }, testWorkDir, 5, testChatId);
    expect(readRes.output).toBe('port = 3000\nhost = localhost\n');
  });

  it('fails edit_file when substring is not unique or not found', async () => {
    const filePath = 'multi.txt';
    await executeTool(
      'write_file',
      { path: filePath, content: 'repeat repeat repeat' },
      testWorkDir,
      5,
      testChatId
    );

    // Multiple occurrences
    const failMulti = await executeTool(
      'edit_file',
      { path: filePath, old_string: 'repeat', new_string: 'single' },
      testWorkDir,
      5,
      testChatId
    );
    expect(failMulti.ok).toBe(false);
    expect(failMulti.output).toContain('must be unique to edit safely');

    // Not found
    const failNotFound = await executeTool(
      'edit_file',
      { path: filePath, old_string: 'missing', new_string: 'found' },
      testWorkDir,
      5,
      testChatId
    );
    expect(failNotFound.ok).toBe(false);
    expect(failNotFound.output).toContain('not found');
  });

  it('deletes files and directories, but refuses root deletion', async () => {
    await executeTool('write_file', { path: 'temp.txt', content: 'delete me' }, testWorkDir, 5, testChatId);
    expect(fs.existsSync(path.join(testWorkDir, 'temp.txt'))).toBe(true);

    const delRes = await executeTool('delete_path', { path: 'temp.txt' }, testWorkDir, 5, testChatId);
    expect(delRes.ok).toBe(true);
    expect(fs.existsSync(path.join(testWorkDir, 'temp.txt'))).toBe(false);

    // Root deletion attempt
    const rootDel = await executeTool('delete_path', { path: '.' }, testWorkDir, 5, testChatId);
    expect(rootDel.ok).toBe(false);
    expect(rootDel.output).toContain('Deleting the workspace root directory is strictly forbidden');
  });

  it('rejects reading binary files', async () => {
    const binPath = path.join(testWorkDir, 'binary.bin');
    const binBuf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    fs.writeFileSync(binPath, binBuf);

    const res = await executeTool('read_file', { path: 'binary.bin' }, testWorkDir, 5, testChatId);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('appears to be binary');
  });

  it('truncates tool output exceeding 20,000 characters', () => {
    const longStr = 'a'.repeat(25000);
    const truncated = truncateOutput(longStr);
    expect(truncated.length).toBeLessThan(longStr.length);
    expect(truncated).toContain('[... Truncated by server: output exceeded 20,000 characters ...]');
  });

  it('records audit log in SQLite', async () => {
    await executeTool('write_file', { path: 'audit.txt', content: 'test' }, testWorkDir, 5, 'audit_test_chat');
    const logs = db.prepare('SELECT * FROM audit_log WHERE chat_id = ?').all('audit_test_chat') as any[];
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[logs.length - 1].tool).toBe('write_file');
    expect(logs[logs.length - 1].ok).toBe(1);
  });
});
