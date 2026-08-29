/**
 * Turn a forwarded email into either article text or an article URL.
 *
 * Newsletters carry the whole piece in the body, while a "check this out"
 * forward carries almost nothing but a link. This picks whichever is actually
 * present rather than assuming one shape.
 */

export interface ParsedEmail {
  title: string;
  /** Article text, when the body carries real content. */
  content: string | null;
  /** First real article link, used when the body is too thin to be the article. */
  sourceUrl: string | null;
}

/** Below this many characters of cleaned body text, prefer a link instead. */
export const MIN_BODY_CHARS = 1500;

/** Links that appear in newsletter chrome rather than being the article. */
const BOILERPLATE_URL = [
  /unsubscribe/i,
  /list-manage/i,
  /mailchimp/i,
  /campaign-archive/i,
  /\/privacy\b/i,
  /\/terms\b/i,
  /\/preferences\b/i,
  /manage[-_]?subscription/i,
  /\.(png|jpe?g|gif|svg|webp|ico)(\?|#|$)/i,
  /(facebook|twitter|x|linkedin|instagram|threads|bsky|mastodon)\.(com|app|social)/i,
  /\/share\b/i,
  /beacon|pixel|track(ing)?\./i,
];

/** `"Brian <brian@example.com>"` → `"brian@example.com"` */
export function normalizeAddress(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  return (angle ? angle[1] : from).trim().toLowerCase();
}

export function cleanSubject(subject: string): string {
  return (
    subject
      // Strip any run of Fwd:/Fw:/Re: prefixes, including bracketed variants.
      .replace(/^(\s*(re|fwd?|aw|tr)\s*(\[\d+\])?\s*:\s*)+/i, '')
      .trim() || 'Forwarded Email'
  );
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/(p|div|tr|h[1-6]|li|blockquote)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Remove the header block Gmail/Outlook insert above a forwarded message, so
 * the sender/date lines don't get read aloud as part of the article.
 */
export function stripForwardHeaders(text: string): string {
  const marker = text.search(
    /^\s*(-{2,}\s*forwarded message\s*-{2,}|-{2,}\s*original message\s*-{2,}|_{5,})\s*$/im,
  );
  if (marker === -1) return text.trim();

  const after = text.slice(marker).split('\n').slice(1);

  // Drop the RFC-822-ish header lines and the blank line that follows them.
  let i = 0;
  while (
    i < after.length &&
    (after[i].trim() === '' ||
      /^\s*(from|date|sent|subject|to|cc|bcc|reply-to)\s*:/i.test(after[i]))
  ) {
    i++;
  }

  return after.slice(i).join('\n').trim();
}

function isBoilerplateUrl(url: string): boolean {
  return BOILERPLATE_URL.some((re) => re.test(url));
}

/** First link that looks like an article rather than newsletter chrome. */
export function extractFirstLink(text: string, html?: string): string | null {
  const candidates: string[] = [];

  if (html) {
    // href values first — they survive text-wrapping intact.
    for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      candidates.push(m[1]);
    }
  }
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    candidates.push(m[0]);
  }

  for (const raw of candidates) {
    const url = raw.trim().replace(/[.,;:)\]]+$/, '');
    if (!/^https?:\/\//i.test(url)) continue;
    if (isBoilerplateUrl(url)) continue;
    try {
      new URL(url);
    } catch {
      continue;
    }
    return url;
  }
  return null;
}

export function parseForwardedEmail(input: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): ParsedEmail {
  const title = cleanSubject(input.subject ?? '');

  const rawText = input.text?.trim()
    ? input.text
    : input.html
      ? htmlToText(input.html)
      : '';

  const body = stripForwardHeaders(rawText);

  // Measure real prose, not link soup: a body that is mostly one long URL
  // should still count as "thin" and fall through to link extraction.
  const prose = body.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

  if (prose.length >= MIN_BODY_CHARS) {
    return { title, content: body, sourceUrl: null };
  }

  const link = extractFirstLink(body, input.html ?? undefined);
  if (link) return { title, content: null, sourceUrl: link };

  // Nothing linkable — fall back to whatever body exists so the caller can
  // decide whether it is worth keeping.
  return { title, content: body || null, sourceUrl: null };
}
