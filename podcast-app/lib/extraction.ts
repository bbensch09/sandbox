export interface ExtractionResult {
  title: string;
  content: string;
  sourceUrl: string;
}

export async function extractArticle(url: string): Promise<ExtractionResult> {
  // Primary: Jina AI Reader
  try {
    const result = await extractWithJina(url);
    if (result.content.length > 200) return result;
  } catch {
    // fall through to Readability
  }

  // Fallback: Mozilla Readability
  return extractWithReadability(url);
}

async function extractWithJina(url: string): Promise<ExtractionResult> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(jinaUrl, {
    headers: {
      Accept: 'application/json',
      'X-No-Cache': 'true',
    },
    // 30s timeout
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`Jina returned ${response.status}`);

  const data = await response.json();
  const article = data?.data;
  if (!article?.content) throw new Error('Jina returned empty content');

  return {
    title: article.title || new URL(url).hostname,
    content: article.content,
    sourceUrl: url,
  };
}

async function extractWithReadability(url: string): Promise<ExtractionResult> {
  const { JSDOM } = await import('jsdom');
  const { Readability } = await import('@mozilla/readability');

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`Fetch returned ${response.status}`);

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) throw new Error('Readability could not parse article');

  return {
    title: article.title || new URL(url).hostname,
    content: article.textContent || '',
    sourceUrl: url,
  };
}
