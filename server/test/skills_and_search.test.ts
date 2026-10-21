import { describe, it, expect } from 'vitest';
import { listSkills, saveSkillMd, toggleSkill, deleteSkill, getActiveSkillsPrompt } from '../src/skills/manager.js';
import { searchWeb, formatSearchResults, cleanSearchQuery } from '../src/search/web.js';
import { parseSearchDecision, isTrivialNonSearchQuery } from '../src/search/smart.js';

describe('Skills Manager', () => {
  it('should list starter skills', () => {
    const skills = listSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should save, toggle, and delete a custom skill', () => {
    const testId = 'test-skill-unit';
    const testContent = `---
name: Test Unit Skill
description: A test skill for vitest
---
Instructions for unit test.`;

    const saved = saveSkillMd(testId, testContent);
    expect(saved.id).toBe(testId);
    expect(saved.name).toBe('Test Unit Skill');

    toggleSkill(testId, false);
    let list = listSkills();
    const found = list.find((s) => s.id === testId);
    expect(found?.enabled).toBe(false);

    toggleSkill(testId, true);
    list = listSkills();
    const foundEnabled = list.find((s) => s.id === testId);
    expect(foundEnabled?.enabled).toBe(true);

    const prompt = getActiveSkillsPrompt();
    expect(prompt).toContain('Test Unit Skill');

    deleteSkill(testId);
    const afterDelete = listSkills();
    expect(afterDelete.find((s) => s.id === testId)).toBeUndefined();
  });
});

describe('Web Search', () => {
  it('should format search results cleanly', () => {
    const formatted = formatSearchResults('test query', [
      { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
      { title: 'Result 2', url: 'https://example.com/2', snippet: 'Snippet 2' },
    ]);

    expect(formatted).toContain('[Web Search Results for "test query"]');
    expect(formatted).toContain('Result 1');
    expect(formatted).toContain('https://example.com/1');
  });

  it('should return empty array for empty query', async () => {
    const results = await searchWeb('');
    expect(results).toEqual([]);
  });

  it('should clean search query from conversational fluff and punctuation', () => {
    expect(cleanSearchQuery('найди мне последние новости про космос?')).toBe('последние новости про космос');
    expect(cleanSearchQuery('SEARCH: "курс доллара рубль"')).toBe('курс доллара рубль');
    expect(cleanSearchQuery('глянь погоду в Москве!')).toBe('погоду в Москве');
  });

  it('should detect trivial non-search queries instantly', () => {
    expect(isTrivialNonSearchQuery('привет')).toBe(true);
    expect(isTrivialNonSearchQuery('Привет!')).toBe(true);
    expect(isTrivialNonSearchQuery('спасибо')).toBe(true);
    expect(isTrivialNonSearchQuery('какие новости за неделю?')).toBe(false);
    expect(isTrivialNonSearchQuery('напиши функцию')).toBe(false);
  });

  it('should parse smart search decisions accurately', () => {
    expect(parseSearchDecision('NO_SEARCH')).toEqual({ needed: false });
    expect(parseSearchDecision('NO SEARCH')).toEqual({ needed: false });
    expect(parseSearchDecision('NOT_NEEDED')).toEqual({ needed: false });
    expect(parseSearchDecision('<think>User is asking for code</think>\nNO_SEARCH')).toEqual({ needed: false });

    const dec1 = parseSearchDecision('SEARCH: последние новости октябрь 2026');
    expect(dec1.needed).toBe(true);
    expect(dec1.query).toBe('последние новости октябрь 2026');

    const dec2 = parseSearchDecision('**SEARCH:** "курс биткоина сегодня"');
    expect(dec2.needed).toBe(true);
    expect(dec2.query).toBe('курс биткоина сегодня');

    const dec3 = parseSearchDecision('<think>Need latest data</think>\nSEARCH: Джеймс Уэбб открытия 2026');
    expect(dec3.needed).toBe(true);
    expect(dec3.query).toBe('Джеймс Уэбб открытия 2026');
  });
});
