import { spawn, exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_TOOL_OUTPUT_LENGTH, truncateOutput } from './tools.js';
import { loadConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root of server is two levels up from src/agent or dist/agent
export const SERVER_ROOT = path.resolve(__dirname, '..', '..');
export const SHIMS_DIR = path.resolve(SERVER_ROOT, 'shims');

export const DEFAULT_COMMAND_TIMEOUT_MS = 60000; // 60 seconds


// Safe environment keys for spawned shell
const SAFE_ENV_KEYS = new Set([
  'systemroot',
  'systemdrive',
  'windir',
  'path',
  'pathext',
  'temp',
  'tmp',
  'userprofile',
  'homedrive',
  'homepath',
  'appdata',
  'localappdata',
  'programdata',
  'programfiles',
  'programfiles(x86)',
  'commonprogramfiles',
  'commonprogramfiles(x86)',
  'comspec',
  'psmodulepath',
  'username',
  'userdomain',
  'computername',
  'os',
  'processor_architecture',
  'processor_identifier',
  'allusersprofile',
  'public',
]);

export function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '').replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '');
}

/**
 * Builds a sanitized environment without sensitive tokens or application keys.
 */
export function buildSanitizedEnv(): Record<string, string> {
  const cleanEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && SAFE_ENV_KEYS.has(key.toLowerCase())) {
      cleanEnv[key] = value;
    }
  }

  // Prepend shims directory so python3, pip3, which, ls, etc. take precedence over broken MS Store stubs
  if (fs.existsSync(SHIMS_DIR)) {
    const currentPath = cleanEnv.PATH || cleanEnv.Path || process.env.PATH || '';
    cleanEnv.PATH = `${SHIMS_DIR}${path.delimiter}${currentPath}`;
    cleanEnv.Path = cleanEnv.PATH;
  }

  // Force UTF-8 encoding for Python IO on Windows to prevent charmap UnicodeEncodeErrors
  cleanEnv.PYTHONIOENCODING = 'utf-8';
  cleanEnv.PYTHONUTF8 = '1';
  cleanEnv.NODE_ENV = process.env.NODE_ENV || 'development';
  cleanEnv.FORCE_COLOR = '0';

  return cleanEnv;
}

/**
 * Checks if a PowerShell command matches known dangerous patterns.
 * Dangerous commands always require explicit manual confirmation,
 * even if "remember for this chat" is turned on.
 */
export function isDangerousCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase().trim();

  const dangerousPatterns: RegExp[] = [
    /\bformat\b/i,
    /\bdiskpart\b/i,
    /\breg(\.exe)?\s+(add|delete|copy|restore|load|import)\b/i,
    /\bnet(\.exe)?\s+(user|localgroup|group|accounts)\b/i,
    /\b(shutdown|restart-computer|stop-computer)\b/i,
    /\bbcdedit\b/i,
    /\bsetx\b/i,
    /(\bdownloadstring\b|\birm\b|\biwr\b|\binvoke-webrequest\b).*(\biex\b|\binvoke-expression\b)/i,
    /(\biex\b|\binvoke-expression\b).*(\bdownloadstring\b|\birm\b|\biwr\b)/i,
    /\b(rmdir|rd)\s+.*\/s/i,
    /\bdel\s+.*\/s/i,
    /\bremove-item\b.*-recurse.*(-path\s+)?([a-z]:[\\\/]|\\[\\\/]|\/[a-z]|\$env:|\.\.\/|\.\.\\)/i,
    /\b(vssadmin|cipher|wbadmin)\b/i,
    /\btaskkill\b.*(\/im\s+llama|\/pid\s+)/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(lower));
}

/**
 * Kills a process and all its child processes on Windows via taskkill.
 */
export function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`taskkill /PID ${pid} /T /F`, () => {
        resolve();
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // ignore
        }
      }
      resolve();
    }
  });
}

export interface CommandExecutionResult {
  ok: boolean;
  output: string;
  exitCode: number | null;
  timedOut?: boolean;
}

/**
 * Executes a terminal command inside the specified work directory.
 */
export function runTerminalCommand(
  command: string,
  workDir: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<CommandExecutionResult> {
  const { config } = loadConfig();
  const defaultTimeout = (config.commandTimeoutSec || 60) * 1000;
  const timeoutMs = options.timeoutMs ?? defaultTimeout;


  return new Promise((resolve) => {
    let outputBuffer = '';
    let isFinished = false;
    let timedOut = false;

    let cmdToRun = command.trim();
    // Normalize Unix /dev/null redirection to Windows NUL
    cmdToRun = cmdToRun.replace(/\/dev\/null/gi, 'NUL');

    const isWin = process.platform === 'win32';
    if (isWin && fs.existsSync(SHIMS_DIR)) {
      cmdToRun = cmdToRun
        .replace(/(^|[;&|]\s*)mkdir\s+-p\s+/gi, `$1node "${path.join(SHIMS_DIR, 'mkdir.cjs')}" `)
        .replace(/(^|[;&|]\s*)rm\s+(-rf|-r|-f)\s+/gi, `$1node "${path.join(SHIMS_DIR, 'rm.cjs')}" $2 `)
        .replace(/(^|[;&|]\s*)touch\s+/gi, `$1node "${path.join(SHIMS_DIR, 'touch.cjs')}" `)
        .replace(/(^|[;&|]\s*)sleep\s+/gi, `$1node "${path.join(SHIMS_DIR, 'sleep.cjs')}" `);
    }

    // Check if command is a PowerShell cmdlet (e.g. Write-Output, Start-Sleep, Get-ChildItem, $var)
    const isPowerShellCmdlet = /^\s*([a-zA-Z]+-[a-zA-Z]+|\$[a-zA-Z_])/i.test(cmdToRun);

    const child = isWin
      ? (isPowerShellCmdlet
          ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${cmdToRun}`], {
              cwd: path.resolve(workDir),
              env: buildSanitizedEnv(),
              windowsHide: true,
            })
          : spawn('cmd.exe', ['/d', '/s', '/c', `chcp 65001 > nul && ${cmdToRun}`], {
              cwd: path.resolve(workDir),
              env: buildSanitizedEnv(),
              windowsHide: true,
            }))
      : spawn('/bin/sh', ['-c', cmdToRun], {
          cwd: path.resolve(workDir),
          env: buildSanitizedEnv(),
        });

    const appendOutput = (data: Buffer | string) => {
      outputBuffer += data.toString();
      if (outputBuffer.length > MAX_TOOL_OUTPUT_LENGTH * 2) {
        // Prevent unbounded memory growth if process produces massive output
        outputBuffer = outputBuffer.slice(0, MAX_TOOL_OUTPUT_LENGTH * 2);
      }
    };

    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);

    // Timeout killer
    const timer = setTimeout(async () => {
      if (isFinished) return;
      timedOut = true;
      if (child.pid) {
        await killProcessTree(child.pid);
      }
    }, timeoutMs);

    // External abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', async () => {
        if (isFinished) return;
        if (child.pid) {
          console.log('client disconnected, command aborted');
          await killProcessTree(child.pid);
        }
      });
    }

    const cleanup = () => {
      clearTimeout(timer);
      isFinished = true;
    };

    child.on('error', (err) => {
      cleanup();
      resolve({
        ok: false,
        output: truncateOutput(`Failed to launch process: ${err.message}`),
        exitCode: 1,
      });
    });

    child.on('close', (code) => {
      cleanup();

      const clean = stripAnsi(outputBuffer);

      if (timedOut) {
        resolve({
          ok: false,
          output: truncateOutput(
            `${clean}\n\n[Таймаут команды: выполнение превысило ${timeoutMs / 1000} с и процесс был завершён]`
          ),
          exitCode: code,
          timedOut: true,
        });
        return;
      }

      if (options.signal?.aborted) {
        resolve({
          ok: false,
          output: truncateOutput(`${clean}\n\n[Выполнение команды прервано пользователем]`),
          exitCode: code,
        });
        return;
      }

      const ok = code === 0;
      const formatted = clean.trim() ? clean.trim() : code === 0 ? '(Команда выполнена успешно, без вывода)' : `(Команда завершилась с кодом ${code})`;

      resolve({
        ok,
        output: truncateOutput(formatted),
        exitCode: code,
      });
    });
  });
}
