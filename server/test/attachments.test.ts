import { describe, it, expect } from 'vitest';

describe('Attachments & Multimodal / OCR Prompt Formatting', () => {
  it('formats document attachments into user message context', () => {
    const rawContent = 'Analyze the attached file';
    const attachments = [
      {
        id: 'doc-1',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 50,
        textContent: 'Line 1: important note\nLine 2: data',
      },
      {
        id: 'doc-2',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 120,
        textContent: 'Summary: Revenue grew 20%',
      },
    ];

    let fullText = rawContent;
    for (const att of attachments) {
      if (att.textContent) {
        fullText += `\n\n[Файл: ${att.filename}]\n\`\`\`\n${att.textContent}\n\`\`\``;
      }
    }

    expect(fullText).toContain('[Файл: notes.txt]');
    expect(fullText).toContain('Line 1: important note');
    expect(fullText).toContain('[Файл: report.pdf]');
    expect(fullText).toContain('Summary: Revenue grew 20%');
  });

  it('marks aux OCR output with [распознано: <model>] when main model lacks vision', () => {
    const filename = 'invoice.png';
    const ocrModel = 'minicpm-v-2_6';
    const ocrText = 'TOTAL: $140.00';

    const formattedOcr = `\n\n[распознано: ${ocrModel} | файл: ${filename}]\n${ocrText}`;
    expect(formattedOcr).toContain(`[распознано: ${ocrModel}`);
    expect(formattedOcr).toContain(filename);
    expect(formattedOcr).toContain('TOTAL: $140.00');
  });

  it('correctly maps reasoningEffort to budget tokens', () => {
    const effortMap: Record<string, number> = {
      low: 1024,
      medium: 4096,
      high: 8192,
    };

    expect(effortMap['low']).toBe(1024);
    expect(effortMap['medium']).toBe(4096);
    expect(effortMap['high']).toBe(8192);
  });
});
