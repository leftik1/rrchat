/**
 * Redacts tokens, cookies, authorization headers, and password/token hashes from logs.
 */
export function redactLogMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return msg;

  return msg
    // Redact Authorization headers
    .replace(/(authorization:\s*bearer\s+)([^\s"';,]+)/gi, '$1[REDACTED]')
    // Redact Cookies
    .replace(/(cookie:\s*.*?(?:rr_session|session_id)=)([^;\s"']+)/gi, '$1[REDACTED]')
    // Redact request query or body tokens
    .replace(/(["']?token["']?\s*[:=]\s*["'])([^"'\s&]{8,})(["'])/gi, '$1[REDACTED]$3')
    .replace(/([?&#]token=)([^&\s"']+)/gi, '$1[REDACTED]')
    // Redact hashes in json
    .replace(/(["']accessTokenHash["']\s*:\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3');
}

/**
 * Installs stdout/stderr interception to ensure sensitive data is never logged.
 */
export function setupLogRedaction(): void {
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  process.stdout.write = function (chunk: any, ...args: any[]): boolean {
    if (typeof chunk === 'string') {
      return origStdout(redactLogMessage(chunk), ...args as [any, any]);
    } else if (Buffer.isBuffer(chunk)) {
      const str = chunk.toString('utf-8');
      return origStdout(Buffer.from(redactLogMessage(str)), ...args as [any, any]);
    }
    return origStdout(chunk, ...args as [any, any]);
  } as any;

  process.stderr.write = function (chunk: any, ...args: any[]): boolean {
    if (typeof chunk === 'string') {
      return origStderr(redactLogMessage(chunk), ...args as [any, any]);
    } else if (Buffer.isBuffer(chunk)) {
      const str = chunk.toString('utf-8');
      return origStderr(Buffer.from(redactLogMessage(str)), ...args as [any, any]);
    }
    return origStderr(chunk, ...args as [any, any]);
  } as any;
}
