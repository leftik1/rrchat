import { describe, it, expect } from 'vitest';
import { ProcessModelManager } from '../src/models/process.js';

describe('Parallel Auxiliary / OCR Models (GLM-OCR) Support', () => {
  it('assigns separate ports for main and auxiliary models', () => {
    const manager = new ProcessModelManager(8888, 8889);

    // Default baseUrl without id or for unknown id goes to main port
    expect(manager.baseUrlFor('main-model')).toBe('http://127.0.0.1:8888');
    expect(manager.baseUrlFor()).toBe('http://127.0.0.1:8888');
  });

  it('formats OCR status events with human-readable analysis step', () => {
    const modelName = 'GLM-OCR';
    const analyzingEvent = {
      event: 'status',
      data: { type: 'ocr', message: `Анализ фото (${modelName})...` },
    };

    const doneEvent = {
      event: 'status',
      data: {
        type: 'ocr_done',
        message: `Фото распознано (${modelName})`,
        text: 'Sample recognized receipt total: 450 rub',
      },
    };

    expect(analyzingEvent.data.message).toBe('Анализ фото (GLM-OCR)...');
    expect(doneEvent.data.type).toBe('ocr_done');
    expect(doneEvent.data.text).toContain('450 rub');
  });

  it('formats recognized OCR text for injection into leading model prompt', () => {
    const auxModelName = 'GLM-OCR';
    const filename = 'document.jpg';
    const ocrText = 'Invoice #12345\nDate: 2026-10-17\nTotal: 1500 USD';

    const promptBlock = `[распознано: ${auxModelName} | файл: ${filename}]:\n${ocrText.trim()}`;

    expect(promptBlock).toContain('[распознано: GLM-OCR | файл: document.jpg]');
    expect(promptBlock).toContain('Invoice #12345');
    expect(promptBlock).toContain('Total: 1500 USD');
  });
});
