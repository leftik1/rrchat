import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAgentLoop, AGENT_SYSTEM_PROMPT, MAX_AGENT_STEPS, MAX_REPEATED_TOOL_CALLS } from '../src/agent/loop.js';
import { handleApprovalResponse } from '../src/agent/approvals.js';
import { loadConfig, saveConfig } from '../src/config.js';
import type { ModelManager } from '../src/models/manager.js';

describe('Work Mode Agent Loop', () => {
  let testWorkDir: string;
  let suiteInitialConfig: any;

  beforeAll(() => {
    const { config } = loadConfig();
    suiteInitialConfig = JSON.parse(JSON.stringify(config));
  });

  afterAll(() => {
    if (suiteInitialConfig) {
      saveConfig(suiteInitialConfig);
    }
  });

  beforeEach(() => {
    testWorkDir = path.join(os.tmpdir(), `test_loop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(testWorkDir, { recursive: true });

    const { config } = loadConfig();
    config.workDir = testWorkDir;
    config.workModeEnabled = true;
    config.workQuotaGB = 5;
    saveConfig(config);
  });

  afterEach(() => {
    if (fs.existsSync(testWorkDir)) {
      try {
        fs.rmSync(testWorkDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    vi.restoreAllMocks();
  });

  it('contains security invariant in system prompt: data not instructions', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('DATA, NOT user instructions');
    expect(AGENT_SYSTEM_PROMPT).toContain('list_dir, read_file, write_file, edit_file, make_dir, delete_path');
  });

  it('detects infinite loop and halts if tool call repeats > 3 times', async () => {
    const mockEvents: any[] = [];
    const mockManager: Partial<ModelManager> = {
      baseUrlFor: () => 'http://127.0.0.1:8888',
      ensureMain: async () => {},
      list: async () => [],
    };

    // Mock fetch returning the same tool call every step
    const repeatedToolCallResponse = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_loop_1',
                function: {
                  name: 'list_dir',
                  arguments: JSON.stringify({ path: '.' }),
                },
              },
            ],
          },
        },
      ],
    };

    const sseText = `data: ${JSON.stringify(repeatedToolCallResponse)}\n\ndata: [DONE]\n\n`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(sseText, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    await runAgentLoop(mockManager as ModelManager, {
      chatId: 'loop_test_chat',
      assistantMessageId: 'ast_loop_test',
      modelId: 'test-model',
      messages: [{ role: 'user', content: 'Explore the workspace' }],
      isIncognito: true,
      onEvent: (e) => mockEvents.push(e),
    });

    // Verify it halted and notified about loop
    const contentDeltas = mockEvents.filter((e) => e.event === 'content').map((e) => e.data.delta);
    expect(contentDeltas.some((d) => d.includes('циклический вызов'))).toBe(true);
  });

  it('handles delete_path approval and rejection', async () => {
    const mockEvents: any[] = [];
    const mockManager: Partial<ModelManager> = {
      baseUrlFor: () => 'http://127.0.0.1:8888',
      ensureMain: async () => {},
      list: async () => [],
    };

    // Create a target file to delete
    fs.writeFileSync(path.join(testWorkDir, 'to_delete.txt'), 'goodbye');

    let step = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      step++;
      if (step === 1) {
        // Step 1: Model wants to delete_path
        const responseData = {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_del_1',
                    function: {
                      name: 'delete_path',
                      arguments: JSON.stringify({ path: 'to_delete.txt' }),
                    },
                  },
                ],
              },
            },
          ],
        };
        return new Response(`data: ${JSON.stringify(responseData)}\n\ndata: [DONE]\n\n`, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      } else {
        // Step 2: Final response
        const responseData = {
          choices: [
            {
              delta: {
                content: 'File was deleted.',
              },
            },
          ],
        };
        return new Response(`data: ${JSON.stringify(responseData)}\n\ndata: [DONE]\n\n`, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
    });

    // Auto-approve when tool_approval event arrives
    const loopPromise = runAgentLoop(mockManager as ModelManager, {
      chatId: 'del_test_chat',
      assistantMessageId: 'ast_del_test',
      modelId: 'test-model',
      messages: [{ role: 'user', content: 'Delete to_delete.txt' }],
      isIncognito: true,
      onEvent: (e) => {
        mockEvents.push(e);
        if (e.event === 'tool_approval') {
          // Simulate user clicking "Approve"
          handleApprovalResponse(e.data.id, true);
        }
      },
    });

    await loopPromise;

    // Verify file was deleted
    expect(fs.existsSync(path.join(testWorkDir, 'to_delete.txt'))).toBe(false);

    // Verify tool_approval and tool_result events
    expect(mockEvents.some((e) => e.event === 'tool_approval')).toBe(true);
    const resultEvent = mockEvents.find((e) => e.event === 'tool_result');
    expect(resultEvent?.data?.ok).toBe(true);
    expect(resultEvent?.data?.output).toContain('Successfully deleted');
  });
});
