import { execFile } from 'node:child_process';

export interface FunnelStatus {
  active: boolean;
  funnelUrl?: string;
  output?: string;
}

/**
 * Checks whether Tailscale Funnel is currently active with a 2-second timeout.
 * Gracefully resolves { active: false } if tailscale is not installed or inactive.
 */
export function checkTailscaleFunnel(): Promise<FunnelStatus> {
  return new Promise((resolve) => {
    execFile('tailscale', ['funnel', 'status'], { timeout: 2000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ active: false });
      }

      const out = (stdout || '') + (stderr || '');
      const lower = out.toLowerCase();

      const isActive =
        (lower.includes('funnel') || lower.includes('https://')) &&
        !lower.includes('funnel is off') &&
        !lower.includes('funnel is not') &&
        !lower.includes('disabled');

      let funnelUrl: string | undefined;
      const urlMatch = out.match(/https:\/\/[a-zA-Z0-9\.\-]+\.ts\.net/i);
      if (urlMatch) {
        funnelUrl = urlMatch[0];
      }

      resolve({
        active: isActive,
        funnelUrl,
        output: out,
      });
    });
  });
}
