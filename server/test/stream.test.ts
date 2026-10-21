import { describe, it, expect } from 'vitest';

describe('Stream reasoning and thinking tags parsing', () => {
  function parseThinkChunks(chunks: string[]): { content: string; reasoning: string } {
    let content = '';
    let reasoning = '';
    let insideThink = false;

    for (const chunk of chunks) {
      if (!insideThink && chunk.includes('<think>')) {
        const parts = chunk.split('<think>');
        if (parts[0]) content += parts[0];
        insideThink = true;
        const rest = parts.slice(1).join('<think>');
        if (rest.includes('</think>')) {
          const thinkParts = rest.split('</think>');
          reasoning += thinkParts[0];
          insideThink = false;
          if (thinkParts[1]) content += thinkParts[1];
        } else {
          reasoning += rest;
        }
      } else if (insideThink) {
        if (chunk.includes('</think>')) {
          const parts = chunk.split('</think>');
          reasoning += parts[0];
          insideThink = false;
          if (parts[1]) content += parts[1];
        } else {
          reasoning += chunk;
        }
      } else {
        content += chunk;
      }
    }

    return { content, reasoning };
  }

  it('separates <think> tags into reasoning and content', () => {
    const stream = [
      '<think>',
      'Let me ',
      'think carefully about ',
      'the math.',
      '</think>',
      'The answer ',
      'is 42.',
    ];

    const result = parseThinkChunks(stream);
    expect(result.reasoning).toBe('Let me think carefully about the math.');
    expect(result.content).toBe('The answer is 42.');
  });

  it('handles regular text with no thinking tags', () => {
    const stream = ['Hello ', 'world! ', 'How are you?'];
    const result = parseThinkChunks(stream);
    expect(result.reasoning).toBe('');
    expect(result.content).toBe('Hello world! How are you?');
  });
});
