export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  pageContent?: string;
}

export function cleanSearchQuery(query: string): string {
  let cleaned = query.trim();
  // Strip leading SEARCH: / ПОИСК: labels if any
  cleaned = cleaned.replace(/^(?:search|поиск|искать)\s*:\s*/i, '');
  // Strip surrounding quotes or markdown
  cleaned = cleaned.replace(/^["'`*]+|["'`*]+$/g, '');
  // Strip conversational Russian/English prefixes
  cleaned = cleaned.replace(/^(\s*(глянь|посмотри|найди\s+мне|найди|расскажи|покажи|какие\s+сейчас|что\s+слышно\s+про|новости\s+про|пожалуйста|мне|search\s+for|look\s+up|find\s+me)\s+)+/gi, '').trim();
  // Strip trailing punctuation
  cleaned = cleaned.replace(/[?.!]+$/g, '').trim();
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned || query.trim();
}

function extractReadableText(html: string): string {
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

  clean = clean.replace(/<[^>]+>/g, ' ');
  clean = clean
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#171;/gi, '«')
    .replace(/&#187;/gi, '»')
    .replace(/&#8212;/gi, '—')
    .replace(/&#[0-9]+;/g, ' ');

  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

async function fetchPageSnippet(url: string, timeoutMs = 3500): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8,*;q=0.5',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return undefined;
    }
    const html = await res.text();
    const text = extractReadableText(html);
    return text.length > 60 ? text.slice(0, 1000) : undefined;
  } catch {
    return undefined;
  }
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8,*;q=0.5',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[Search] DuckDuckGo HTTP status ${res.status}`);
      return [];
    }

    const html = await res.text();
    const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippetMatches = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];

    const results: SearchResult[] = [];
    const count = Math.min(titleMatches.length, maxResults);

    for (let i = 0; i < count; i++) {
      const rawUrl = titleMatches[i][1];
      let url = rawUrl;
      if (rawUrl.includes('uddg=')) {
        try {
          const encoded = rawUrl.split('uddg=')[1].split('&')[0];
          url = decodeURIComponent(encoded);
        } catch {
          url = rawUrl;
        }
      }

      const title = titleMatches[i][2].replace(/<[^>]+>/g, '').trim();
      const snippet = snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, '').trim() : '';

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    return results;
  } catch (err: any) {
    console.warn('[Search] DuckDuckGo query error:', err.message);
    return [];
  }
}

async function searchBingFallback(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8,*;q=0.5',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const bResults = [...html.matchAll(/<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)];
    const results: SearchResult[] = [];

    for (const match of bResults) {
      if (results.length >= maxResults) break;
      const item = match[1];
      const titleMatch = item.match(/<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = item.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (titleMatch) {
        let url = titleMatch[1];
        if (url.includes('&u=')) {
          try {
            const raw = url.split('&u=')[1].split('&')[0];
            if (raw.startsWith('a1')) {
              url = Buffer.from(raw.slice(2), 'base64').toString('utf8');
            }
          } catch {
            // keep url
          }
        }
        const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        if (title && url && !url.includes('bing.com')) {
          results.push({ title, url, snippet });
        }
      }
    }
    return results;
  } catch (err: any) {
    console.warn('[Search] Bing fallback error:', err.message);
    return [];
  }
}

export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  const cleanQuery = cleanSearchQuery(query);
  if (!cleanQuery) return [];

  let results = await searchDuckDuckGo(cleanQuery, maxResults);
  if (results.length === 0) {
    results = await searchBingFallback(cleanQuery, maxResults);
  }
  if (results.length === 0 && cleanQuery !== query.trim()) {
    // Retry with raw original query
    results = await searchDuckDuckGo(query.trim(), maxResults);
    if (results.length === 0) {
      results = await searchBingFallback(query.trim(), maxResults);
    }
  }

  if (results.length === 0) {
    return [];
  }

  // Fetch page contents for the top 3 results in parallel
  const topToFetch = results.slice(0, 3);
  await Promise.all(
    topToFetch.map(async (r) => {
      const content = await fetchPageSnippet(r.url, 3500);
      if (content) {
        r.pageContent = content;
      }
    })
  );

  return results;
}

export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `[Web Search for "${query}": No results found]`;
  }

  const items = results.map((r, idx) => {
    let block = `[${idx + 1}] ${r.title}\nURL: ${r.url}`;
    if (r.pageContent) {
      block += `\nСодержимое страницы:\n${r.pageContent}`;
    } else if (r.snippet) {
      block += `\nКраткое описание:\n${r.snippet}`;
    }
    return block;
  });

  return (
    `[Web Search Results for "${query}"]:\n` +
    items.join('\n\n') +
    '\n\nИнструкции для модели:\n' +
    '1. Строго используй факты и содержание из приведённых выше результатов поиска для ответа.\n' +
    '2. Категорически запрещено придумывать или выводить устаревшие новости из старой базы обучения (2024 г. и ранее).\n' +
    '3. Обязательно ссылайся на источники в формате Markdown: [Название источника](URL).'
  );
}
