import { describe, it, expect } from 'vitest';

describe('Phase 2 Features (Attachments, Context, Reasoning)', () => {
  it('determines supportsReasoningToggle correctly from settings or model name', () => {
    function getSupportsReasoning(name: string, settingsVal?: boolean | null): boolean | null {
      if (settingsVal !== undefined && settingsVal !== null) {
        return settingsVal;
      }
      const lower = name.toLowerCase();
      if (lower.includes('ocr') || lower.includes('embed') || lower.includes('bert')) {
        return false;
      }
      if (lower.includes('r1') || lower.includes('qwq') || lower.includes('think') || lower.includes('reason') || lower.includes('lfm2.5')) {
        return true;
      }
      return null;
    }

    expect(getSupportsReasoning('DeepSeek-R1-Distill-Qwen-32B')).toBe(true);
    expect(getSupportsReasoning('LFM2.5-24B-A2B-Q4_K_M')).toBe(true);
    expect(getSupportsReasoning('GLM-OCR-Q8_0')).toBe(false);
    expect(getSupportsReasoning('custom-model')).toBeNull();
    // User manual override has highest priority
    expect(getSupportsReasoning('DeepSeek-R1', false)).toBe(false);
    expect(getSupportsReasoning('GLM-OCR', true)).toBe(true);
  });

  it('correctly calculates context fill percentage and handles overflow clamp', () => {
    function calcContextPercent(usedTokens: number, maxTokens: number): number {
      return Math.min(Math.round((usedTokens / Math.max(maxTokens, 1)) * 100), 100);
    }

    expect(calcContextPercent(0, 8192)).toBe(0);
    expect(calcContextPercent(2048, 8192)).toBe(25);
    expect(calcContextPercent(4096, 8192)).toBe(50);
    expect(calcContextPercent(8192, 8192)).toBe(100);
    expect(calcContextPercent(9000, 8192)).toBe(100); // clamped at 100
  });

  it('respects userRole precedence over auto-detection', () => {
    function resolveModelRole(isAuxCandidate: boolean, userRole?: 'main' | 'aux', settingRole?: 'main' | 'aux'): 'main' | 'aux' {
      const autoRole = isAuxCandidate ? 'aux' : 'main';
      return userRole || settingRole || autoRole;
    }

    // Default auto-detection
    expect(resolveModelRole(true)).toBe('aux');
    expect(resolveModelRole(false)).toBe('main');

    // User explicitly overrides
    expect(resolveModelRole(true, 'main')).toBe('main');
    expect(resolveModelRole(false, 'aux')).toBe('aux');
  });
});
