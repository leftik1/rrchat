import fs from 'node:fs';
import path from 'node:path';
import { resolveInsideWorkDir, checkQuota, SandboxError } from './sandbox.js';
import { runTerminalCommand } from './terminal.js';
import { logAudit } from '../db.js';
import { searchWeb } from '../search/web.js';

export const MAX_TOOL_OUTPUT_LENGTH = 20000;
export const MAX_READ_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export const WORK_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories inside workspace. Path is relative to workspace root (use "." or omit for root, do NOT use "/workspace").',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path of directory inside workspace (defaults to "." if omitted)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the text content of a file in the workspace. Path is relative to workspace root (e.g. "main.py"). Do NOT use "/workspace/".',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file inside workspace',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace. Path is relative to workspace root (e.g. "main.py"). Do NOT use "/workspace/".',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file inside workspace',
          },
          content: {
            type: 'string',
            description: 'Full text content to write into the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a single, unique occurrence of old_string with new_string in a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file inside workspace',
          },
          old_string: {
            type: 'string',
            description: 'The exact unique text substring to find and replace',
          },
          new_string: {
            type: 'string',
            description: 'The replacement string',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'make_dir',
      description: 'Create a new directory inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path of the directory to create',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_path',
      description: 'Delete a file or directory inside the workspace. Requires human approval.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file or directory to delete',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a terminal command in the workspace directory (Windows CLI). Use "python" and "pip". Standard commands and POSIX aliases (ls, pwd, which, cat, head, tail, grep) are supported.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command string to execute in workspace root',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for up-to-date information, documentation, news, or answers using DuckDuckGo.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
  },
];

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
}

/**
 * Truncates output string if exceeding character limit.
 */
export function truncateOutput(output: string, maxLength = MAX_TOOL_OUTPUT_LENGTH): string {
  if (output.length <= maxLength) {
    return output;
  }
  return output.slice(0, maxLength) + '\n\n[... Truncated by server: output exceeded 20,000 characters ...]';
}

/**
 * Executes a tool in the context of a chat and workspace.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  workDir: string,
  quotaGB: number,
  chatId: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<ToolExecutionResult> {
  let ok = false;
  let rawOutput = '';

  try {
    switch (toolName) {
      case 'list_dir': {
        const targetRel = typeof args.path === 'string' ? args.path : '.';
        const { resolvedPath, relativePath } = resolveInsideWorkDir(workDir, targetRel);

        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Directory '${relativePath}' does not exist.`);
        }

        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) {
          throw new Error(`'${relativePath}' is a file, not a directory.`);
        }

        const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
        if (entries.length === 0) {
          rawOutput = `Directory '${relativePath}' is empty.`;
        } else {
          const lines = entries.map((entry) => {
            const itemPath = path.join(resolvedPath, entry.name);
            try {
              if (entry.isDirectory()) {
                return `[DIR]  ${entry.name}/`;
              } else {
                const s = fs.statSync(itemPath);
                const sizeStr = s.size > 1024 ? `${(s.size / 1024).toFixed(1)} KB` : `${s.size} B`;
                return `[FILE] ${entry.name} (${sizeStr})`;
              }
            } catch {
              return `[?]    ${entry.name}`;
            }
          });
          rawOutput = `Contents of '${relativePath}':\n${lines.join('\n')}`;
        }
        ok = true;
        break;
      }

      case 'read_file': {
        if (!args.path || typeof args.path !== 'string') {
          throw new Error("Missing required parameter 'path'");
        }
        const { resolvedPath, relativePath } = resolveInsideWorkDir(workDir, args.path);

        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File '${relativePath}' does not exist.`);
        }

        const stat = fs.statSync(resolvedPath);
        if (stat.isDirectory()) {
          throw new Error(`'${relativePath}' is a directory, not a file.`);
        }

        if (stat.size > MAX_READ_FILE_BYTES) {
          throw new Error(
            `File '${relativePath}' is too large (${(stat.size / (1024 * 1024)).toFixed(1)} MB). Read limit is 2 MB.`
          );
        }

        // Check for binary file
        const fd = fs.openSync(resolvedPath, 'r');
        const sampleBuf = Buffer.alloc(Math.min(1024, stat.size));
        fs.readSync(fd, sampleBuf, 0, sampleBuf.length, 0);
        fs.closeSync(fd);

        if (sampleBuf.includes(0)) {
          throw new Error(`File '${relativePath}' appears to be binary and cannot be read as text.`);
        }

        rawOutput = fs.readFileSync(resolvedPath, 'utf-8');
        ok = true;
        break;
      }

      case 'write_file': {
        if (!args.path || typeof args.path !== 'string') {
          throw new Error("Missing required parameter 'path'");
        }
        if (typeof args.content !== 'string') {
          throw new Error("Missing required parameter 'content'");
        }

        const { resolvedPath, relativePath } = resolveInsideWorkDir(workDir, args.path);
        const contentBytes = Buffer.byteLength(args.content, 'utf-8');

        // Check quota
        let currentFileSize = 0;
        if (fs.existsSync(resolvedPath)) {
          try {
            currentFileSize = fs.statSync(resolvedPath).size;
          } catch {
            // ignore
          }
        }
        const additionalBytes = Math.max(0, contentBytes - currentFileSize);
        checkQuota(workDir, quotaGB, additionalBytes);

        // Ensure parent directory
        const parentDir = path.dirname(resolvedPath);
        fs.mkdirSync(parentDir, { recursive: true });

        fs.writeFileSync(resolvedPath, args.content, 'utf-8');
        rawOutput = `Successfully wrote ${contentBytes} bytes to '${relativePath}'.`;
        ok = true;
        break;
      }

      case 'edit_file': {
        if (!args.path || typeof args.path !== 'string') {
          throw new Error("Missing required parameter 'path'");
        }
        if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') {
          throw new Error("Missing required parameters 'old_string' and 'new_string'");
        }

        const { resolvedPath, relativePath } = resolveInsideWorkDir(workDir, args.path);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File '${relativePath}' does not exist.`);
        }

        const original = fs.readFileSync(resolvedPath, 'utf-8');
        const count = original.split(args.old_string).length - 1;

        if (count === 0) {
          throw new Error(`'old_string' not found in '${relativePath}'. Please check exact spacing and lines.`);
        }
        if (count > 1) {
          throw new Error(
            `'old_string' appears ${count} times in '${relativePath}'. It must be unique to edit safely.`
          );
        }

        const diffBytes = Buffer.byteLength(args.new_string, 'utf-8') - Buffer.byteLength(args.old_string, 'utf-8');
        if (diffBytes > 0) {
          checkQuota(workDir, quotaGB, diffBytes);
        }

        const updated = original.replace(args.old_string, args.new_string);
        fs.writeFileSync(resolvedPath, updated, 'utf-8');

        rawOutput = `Successfully edited '${relativePath}'.`;
        ok = true;
        break;
      }

      case 'make_dir': {
        if (!args.path || typeof args.path !== 'string') {
          throw new Error("Missing required parameter 'path'");
        }
        const { resolvedPath, relativePath } = resolveInsideWorkDir(workDir, args.path);
        fs.mkdirSync(resolvedPath, { recursive: true });
        rawOutput = `Successfully created directory '${relativePath}'.`;
        ok = true;
        break;
      }

      case 'delete_path': {
        if (!args.path || typeof args.path !== 'string') {
          throw new Error("Missing required parameter 'path'");
        }
        const { resolvedPath, relativePath } = resolveInsideWorkDir(workDir, args.path);

        const realWorkDir = fs.realpathSync(workDir);
        if (resolvedPath.toLowerCase() === realWorkDir.toLowerCase()) {
          throw new Error('Deleting the workspace root directory is strictly forbidden.');
        }

        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Path '${relativePath}' does not exist.`);
        }

        fs.rmSync(resolvedPath, { recursive: true, force: true });
        rawOutput = `Successfully deleted '${relativePath}'.`;
        ok = true;
        break;
      }

      case 'run_command': {
        if (!args.command || typeof args.command !== 'string') {
          throw new Error("Missing required parameter 'command'");
        }
        const cmdRes = await runTerminalCommand(args.command, workDir, {
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
        });
        ok = cmdRes.ok;
        rawOutput = cmdRes.output;
        break;
      }

      case 'web_search': {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) throw new Error("Missing required parameter 'query'");
        const results = await searchWeb(query, 5);
        if (results.length === 0) {
          rawOutput = 'No results found.';
        } else {
          rawOutput = results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join('\n\n');
        }
        ok = true;
        break;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (err: any) {
    ok = false;
    rawOutput = `Error: ${err.message || 'Tool execution failed'}`;
  }

  // Audit log to SQLite
  try {
    logAudit(chatId, toolName, JSON.stringify(args), ok);
  } catch (auditErr) {
    console.error('[AuditLog] Failed to record tool audit:', auditErr);
  }

  return {
    ok,
    output: truncateOutput(rawOutput),
  };
}
