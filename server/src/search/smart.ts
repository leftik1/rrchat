import { cleanSearchQuery } from './web.js';

export interface SmartSearchOptions {
  endpoint: string;
  modelId: string;
  messages: Array<{ role: string; content?: string; attachments?: any }>;
  dateInfo: string;
  signal?: AbortSignal;
}

export interface SmartSearchResult {
  needed: boolean;
  query?: string;
  rawResponse?: string;
}

const TRIVIAL_NON_SEARCH = /^(привет|хай|здравствуй|здравствуйте|добрый день|добрый вечер|доброе утро|hello|hi|hey|thanks|спасибо|благодарю|ок|хорошо|понял|ясно|да|нет|ладно|yes|no|ok|okay)[\s!.,?]*$/i;

const HEURISTIC_SEARCH_KEYWORDS = /\b(новости|новость|события|произошло|сегодня|сейчас|вчера|погода|курс|валют|релиз|релизы|свежие|последние|последний|вышел|вышла|анонс|расписание|счет|матч|цена|стоит|актуальн|найди в интернете|поищи в сети)\b/i;

export function isTrivialNonSearchQuery(text: string): boolean {
  return TRIVIAL_NON_SEARCH.test(text.trim());
}

export function parseSearchDecision(rawText: string): { needed: boolean; query?: string } {
  if (!rawText || typeof rawText !== 'string') {
    return { needed: false };
  }

  // Strip <think>...</think> reasoning blocks if model output them
  let clean = rawText.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

  // Strip markdown formatting characters
  clean = clean.replace(/[*_`]/g, '').trim();

  // Split into lines and inspect first non-empty line
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { needed: false };
  }

  const firstLine = lines[0];

  // Negative decisions
  if (/^(NO_SEARCH|NO SEARCH|NOT_NEEDED|NO NEEDED|НЕТ|НЕ НУЖНО)\b/i.test(firstLine)) {
    return { needed: false };
  }

  // Explicit positive search prefix: SEARCH: <query> or ПОИСК: <query>
  const match = firstLine.match(/^(?:SEARCH|ПОИСК|ИСКАТЬ)\s*:\s*(.+)$/i);
  if (match && match[1]) {
    const q = cleanSearchQuery(match[1]);
    if (q && q.length >= 2) {
      return { needed: true, query: q };
    }
    return { needed: false };
  }

  // If the line starts with search-like intent and does not contain refusal
  if (!/^(нет|не надо|не требуется|not needed)\b/i.test(firstLine) && firstLine.length <= 80) {
    const q = cleanSearchQuery(firstLine);
    if (q && q.length >= 3 && !q.toLowerCase().startsWith('no')) {
      return { needed: true, query: q };
    }
  }

  return { needed: false };
}

export async function evaluateWebSearchNeed(options: SmartSearchOptions): Promise<SmartSearchResult> {
  const { endpoint, modelId, messages, dateInfo, signal } = options;

  let lastUserQuery = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === 'user' && msg.content) {
      lastUserQuery = msg.content.trim();
      break;
    }
  }

  if (!lastUserQuery) {
    return { needed: false };
  }

  // 1. Instant heuristic check for greetings/acknowledgements
  if (isTrivialNonSearchQuery(lastUserQuery)) {
    return { needed: false };
  }

  // Extract current year from dateInfo or system time
  const currentYear = new Date().getFullYear();

  // 2. Build lightweight context (at most 3 recent messages, truncated)
  const recentHistory: Array<{ role: string; content: string }> = [];
  const startIdx = Math.max(0, messages.length - 4);
  for (let i = startIdx; i < messages.length - 1; i++) {
    const m = messages[i];
    if (m && m.content && (m.role === 'user' || m.role === 'assistant')) {
      const truncated = m.content.length > 250 ? m.content.slice(0, 250) + '...' : m.content;
      recentHistory.push({ role: m.role, content: truncated });
    }
  }

  const classifierSystemPrompt =
    `Ты — быстрый классификатор потребности в веб-поиске.\n` +
    `Текущая дата и время: ${dateInfo}\n\n` +
    `Определи, нужен ли интернет-поиск для актуального ответа на последнее сообщение пользователя:\n` +
    `- НЕ ИСКАТЬ (ответ strictly "NO_SEARCH"): программирование, код, алгоритмы, математика, логика, перевод, редактирование, разговор на общие темы, вежливость, или если ответ понятен из контекста беседы.\n` +
    `- ИСКАТЬ (ответ "SEARCH: <краткий поисковый запрос>"): свежие новости, текущие события, погода, курсы валют, спорт, факты за ${currentYear} год или малоизвестные специфические сущности.\n\n` +
    `Правила для запроса:\n` +
    `1. Строго 2-6 ключевых поисковых слов (без приветствий, знаков препинания и лишних слов).\n` +
    `2. Заменяй местоимения сущностями из контекста диалога.\n` +
    `3. Добавляй год (${currentYear}), если вопрос про недавние события/релизы/новости.\n\n` +
    `Формат ответа: СТРОГО одна строка:\n` +
    `NO_SEARCH\n` +
    `или\n` +
    `SEARCH: <поисковый запрос>`;

  const classifierMessages = [
    { role: 'system', content: classifierSystemPrompt },
    ...recentHistory,
    { role: 'user', content: lastUserQuery },
  ];

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 4500);

  const abortListener = () => timeoutController.abort();
  if (signal) {
    signal.addEventListener('abort', abortListener, { once: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: classifierMessages,
        max_tokens: 35,
        temperature: 0.1,
        stream: false,
        reasoning_effort: 'none',
        reasoning_budget_tokens: 0,
        thinking_budget_tokens: 0,
        chat_template_kwargs: {
          enable_thinking: false,
        },
      }),
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Classifier HTTP error: ${res.status}`);
    }

    const data: any = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const decision = parseSearchDecision(rawContent);

    return {
      needed: decision.needed,
      query: decision.query,
      rawResponse: rawContent,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal?.aborted) {
      throw err;
    }

    // Heuristic fallback if LLM classifier call fails or times out
    if (HEURISTIC_SEARCH_KEYWORDS.test(lastUserQuery)) {
      const fallbackQuery = cleanSearchQuery(lastUserQuery);
      if (fallbackQuery && fallbackQuery.length >= 2) {
        return {
          needed: true,
          query: fallbackQuery,
        };
      }
    }

    return { needed: false };
  } finally {
    if (signal) {
      signal.removeEventListener('abort', abortListener);
    }
  }
}
