#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const TOKEN_FILE = path.join(PROJECT_ROOT, '.token');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');

// Terminal colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let config = { port: 3000 };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {}
}

const port = process.env.PORT || config.port || 3000;
const baseUrl = `http://127.0.0.1:${port}`;
let token = process.env.TOKEN || '';

if (!token && fs.existsSync(TOKEN_FILE)) {
  try {
    token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
  } catch {}
}

let serverProcess = null;
let spawnedServer = false;

async function checkServerRunning() {
  try {
    const res = await fetch(`${baseUrl}/api/auth/verify`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

async function startServerIfNeeded() {
  const isRunning = await checkServerRunning();
  if (isRunning) {
    console.log(`${CYAN}[INFO] Target server is already active on ${baseUrl}${RESET}`);
    return;
  }

  console.log(`${YELLOW}[INFO] Server is not running. Starting temporary test server on port ${port}...${RESET}`);
  spawnedServer = true;

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npm.cmd' : 'npm';
  serverProcess = spawn(cmd, ['run', 'dev', '--prefix', 'server'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
    shell: isWin,
  });

  // Wait for server to become responsive
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 600));
    if (await checkServerRunning()) {
      console.log(`${GREEN}[INFO] Server started successfully.${RESET}`);
      // Re-read token file if it was created
      if (!token && fs.existsSync(TOKEN_FILE)) {
        token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
      }
      return;
    }
  }

  throw new Error(`Server failed to start on port ${port} within 15 seconds.`);
}

function cleanup() {
  if (spawnedServer && serverProcess && serverProcess.pid) {
    console.log(`\n${CYAN}[INFO] Terminating temporary test server (PID ${serverProcess.pid})...${RESET}`);
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(serverProcess.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(serverProcess.pid, 'SIGTERM');
      }
    } catch {}
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(1);
});

let passedCount = 0;
let failedCount = 0;

function report(name, ok, details = '') {
  if (ok) {
    passedCount++;
    console.log(`  ${GREEN}PASS${RESET}  ${name} ${details ? CYAN + '(' + details + ')' + RESET : ''}`);
  } else {
    failedCount++;
    console.log(`  ${RED}FAIL${RESET}  ${name} ${details ? RED + details + RESET : ''}`);
  }
}

async function runSecuritySuite() {
  console.log(`\n${BOLD}======================================================${RESET}`);
  console.log(`${BOLD} rrchat Security Black-Box Verification Suite ${RESET}`);
  console.log(`${BOLD} Target: ${baseUrl}${RESET}`);
  console.log(`${BOLD}======================================================\n${RESET}`);

  await startServerIfNeeded();

  let sessionCookie = '';

  // 1. Unauthenticated request rejection
  try {
    const res = await fetch(`${baseUrl}/api/chats`, {
      headers: { host: `127.0.0.1:${port}` },
    });
    report('1. Unauthorized access blocked (GET /api/chats without session)', res.status === 401, `Status: ${res.status}`);
  } catch (err) {
    report('1. Unauthorized access blocked', false, err.message);
  }

  // 2. Login rejection with bad token
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: `127.0.0.1:${port}`,
        origin: `http://127.0.0.1:${port}`,
      },
      body: JSON.stringify({ token: 'definitely_invalid_token_9999' }),
    });
    report('2. Invalid token rejected (POST /api/auth/login)', res.status === 401, `Status: ${res.status}`);
  } catch (err) {
    report('2. Invalid token rejected', false, err.message);
  }

  // 3. Login success with valid token & cookie attributes
  if (token) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: `127.0.0.1:${port}`,
          origin: `http://127.0.0.1:${port}`,
        },
        body: JSON.stringify({ token }),
      });
      const cookieHeader = res.headers.get('set-cookie') || '';
      const isHttpOnly = cookieHeader.toLowerCase().includes('httponly');
      const isSameSite = cookieHeader.toLowerCase().includes('samesite=strict');
      const match = cookieHeader.match(/rr_session=([^;]+)/);
      if (match) {
        sessionCookie = `rr_session=${match[1]}`;
      }

      const ok = res.status === 200 && !!sessionCookie && isHttpOnly && isSameSite;
      report('3. Valid token login & HttpOnly SameSite=Strict cookie', ok, `Status: ${res.status}`);
    } catch (err) {
      report('3. Valid token login', false, err.message);
    }
  } else {
    report('3. Valid token login (skipped: no .token file or TOKEN env)', false, 'No token available');
  }

  // 4. Authenticated request with session cookie
  if (sessionCookie) {
    try {
      const res = await fetch(`${baseUrl}/api/chats`, {
        headers: {
          host: `127.0.0.1:${port}`,
          cookie: sessionCookie,
        },
      });
      report('4. Authenticated request succeeded with session cookie', res.status === 200, `Status: ${res.status}`);
    } catch (err) {
      report('4. Authenticated request succeeded', false, err.message);
    }
  }

  // 5. DNS Rebinding protection (unauthorized Host header)
  try {
    const statusCode = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/chats',
          method: 'GET',
          headers: {
            host: 'evil.attacker.com',
            cookie: sessionCookie || '',
          },
        },
        (res) => {
          resolve(res.statusCode);
        }
      );
      req.on('error', reject);
      req.end();
    });
    report('5. DNS Rebinding protection (Host: evil.attacker.com)', statusCode === 403, `Status: ${statusCode}`);
  } catch (err) {
    report('5. DNS Rebinding protection', false, err.message);
  }

  // 6. Cross-Site Request Forgery (CSRF) Origin protection
  try {
    const res = await fetch(`${baseUrl}/api/chats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: `127.0.0.1:${port}`,
        origin: 'https://malicious-site.org',
        cookie: sessionCookie,
      },
      body: JSON.stringify({ title: 'CSRF Attack' }),
    });
    report('6. CSRF attack blocked (Origin: https://malicious-site.org)', res.status === 403, `Status: ${res.status}`);
  } catch (err) {
    report('6. CSRF attack blocked', false, err.message);
  }

  // 7. Admin lockdown: local connection allows access
  if (sessionCookie) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/system`, {
        headers: {
          host: `localhost:${port}`,
          cookie: sessionCookie,
        },
      });
      report('7. Admin endpoint accessible on localhost', res.status === 200, `Status: ${res.status}`);
    } catch (err) {
      report('7. Admin endpoint accessible on localhost', false, err.message);
    }
  }

  // 8. Admin lockdown: remote/spoofed proxy policy check
  if (sessionCookie) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/system`, {
        headers: {
          host: 'funnel-node.ts.net',
          'x-forwarded-for': '198.51.100.22',
          cookie: sessionCookie,
        },
      });
      const expectedStatus = config.allowAdminOverTunnel ? 200 : 403;
      report(
        `8. Admin tunnel access policy (${config.allowAdminOverTunnel ? 'allowed by allowAdminOverTunnel: true' : '403 admin_local_only'})`,
        res.status === expectedStatus,
        `Status: ${res.status}`
      );
    } catch (err) {
      report('8. Admin endpoint tunnel check', false, err.message);
    }
  }

  // 9. Work mode tunnel block when allowWorkOverTunnel is false
  if (sessionCookie) {
    try {
      const res = await fetch(`${baseUrl}/api/chats`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'funnel-node.ts.net',
          origin: 'https://funnel-node.ts.net',
          'x-forwarded-for': '198.51.100.22',
          cookie: sessionCookie,
        },
        body: JSON.stringify({ title: 'Tunnel Work Chat', mode: 'work' }),
      });
      report('9. Work mode blocked over tunnel (403 work_mode_unavailable_over_tunnel)', res.status === 403, `Status: ${res.status}`);
    } catch (err) {
      report('9. Work mode blocked over tunnel', false, err.message);
    }
  }

  // 10. Security response headers (CSP, nosniff, COOP, Referrer-Policy)
  try {
    const res = await fetch(`${baseUrl}/api/auth/verify`, {
      headers: { host: `127.0.0.1:${port}` },
    });
    const csp = res.headers.get('content-security-policy') || '';
    const nosniff = res.headers.get('x-content-type-options') || '';
    const coop = res.headers.get('cross-origin-opener-policy') || '';
    const ok = csp.includes("default-src 'self'") && nosniff === 'nosniff' && coop === 'same-origin';
    report('10. Global security headers (CSP, nosniff, COOP)', ok, nosniff ? 'headers verified' : 'missing headers');
  } catch (err) {
    report('10. Global security headers', false, err.message);
  }

  // Print Summary
  console.log(`\n${BOLD}======================================================${RESET}`);
  console.log(`${BOLD} Summary: ${GREEN}${passedCount} passed${RESET}, ${failedCount > 0 ? RED : GREEN}${failedCount} failed${RESET}`);
  console.log(`${BOLD}======================================================\n${RESET}`);

  cleanup();

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecuritySuite().catch((err) => {
  console.error(`\n${RED}[ERROR] Test runner crashed:${RESET}`, err);
  cleanup();
  process.exit(1);
});
