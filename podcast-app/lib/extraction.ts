export interface ExtractionResult {
  title: string;
  content: string;
  sourceUrl: string;
}

/**
 * Google Drive/Docs share links open a viewer page, so extracting them reads
 * the viewer chrome instead of the document. Point at the raw file instead.
 * Only works for files shared as "Anyone with the link".
 */
export function directDocumentUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }

  if (u.hostname === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id');
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }

  if (u.hostname === 'docs.google.com') {
    const m = u.pathname.match(/\/(document|presentation)\/d\/([\w-]+)/);
    if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=${m[1] === 'document' ? 'txt' : 'pdf'}`;
  }

  return url;
}

export async function extractArticle(sourceUrl: string): Promise<ExtractionResult> {
  const url = directDocumentUrl(sourceUrl);

  // Primary: Jina AI Reader (also reads PDFs)
  try {
    const result = await extractWithJina(url);
    if (result.content.length > 200) return result;
  } catch {
    // fall through to Readability
  }

  // Plain-text exports (Google Docs) have nothing for Readability to parse.
  if (url !== sourceUrl) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.startsWith('text/plain')) {
      return { title: new URL(sourceUrl).hostname, content: await res.text(), sourceUrl };
    }
    throw new Error(
      `Couldn't read the shared file (HTTP ${res.status}). Make sure it's shared as "Anyone with the link".`,
    );
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
