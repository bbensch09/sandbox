/**
 * Transcript preparation: strip what isn't the article before it is read aloud,
 * and decide whether a human should look at the text first.
 *
 * Two passes:
 *  1. Rules (always): page numbers, running headers/footers repeated on every
 *     PDF page, newsletter chrome ("View in browser", "Subscribe", …).
 *  2. An LLM judge (when an OpenAI key is configured): reads the numbered
 *     paragraphs and names the ones a careful reader would agree are not part
 *     of the piece, plus any sign the extraction went wrong.
 *
 * Work is done on whole paragraphs, so the judge only returns indices — fast,
 * cheap, and it can never rewrite the author's words.
 */

export interface RemovedBlock {
  text: string;
  reason: string;
}

/** Above this share of unrelated text, hold the episode for review. */
export const REVIEW_THRESHOLD = 0.03;

/** Paragraph batch size for one judge call (~3k tokens). */
const BATCH_CHARS = 12_000;

const JUNK_LINE: { re: RegExp; reason: string }[] = [
  { re: /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i, reason: 'Page number' },
  { re: /^[-–—]\s*\d{1,4}\s*[-–—]$/, reason: 'Page number' },
  { re: /^https?:\/\/\S+$/i, reason: 'Bare link' },
  { re: /^!\[[^\]]*\]\([^)]*\)$/, reason: 'Image' },
  { re: /^\[[^\]]{0,60}\]\([^)]+\)$/, reason: 'Bare link' },
  {
    re: /^(view|read|open)( this| it)?( post| email| issue)?( (in|on)( your| the)? (browser|web|app))\.?$/i,
    reason: 'Newsletter chrome',
  },
  {
    re: /^(subscribe( now)?|share|like|comment|restack|reply|upgrade to paid|leave a comment|forward this email|get the app|start writing|download the app|give a gift subscription|share this post|read more|continue reading)[.!]?$/i,
    reason: 'Newsletter chrome',
  },
  { re: /^thanks for reading\b.*\bsubscribe\b/i, reason: 'Subscribe prompt' },
  { re: /\bunsubscribe\b|\bmanage (your )?(subscription|preferences)\b|you('| a)re receiving this/i, reason: 'Email footer' },
  { re: /^(©|copyright\b)/i, reason: 'Copyright footer' },
];

/** Lines this short that repeat this often are PDF running headers/footers. */
const REPEAT_MAX_LEN = 80;
const REPEAT_MIN_COUNT = 3;

export function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  let paras = normalized.split(/\n\s*\n/);
  // PDF text often has no blank lines at all — fall back to single newlines so
  // a page footer can still be removed on its own.
  if (paras.length < 3 && normalized.length > 3000) paras = normalized.split('\n');
  return paras.map((p) => p.trim()).filter(Boolean);
}

/** Rule-based pass. Repeated-line removal is skipped for interviews, where
 *  the same short speaker label legitimately appears on every turn. */
export function ruleClean(
  text: string,
  { isInterview = false }: { isInterview?: boolean } = {},
): { paragraphs: string[]; removed: RemovedBlock[] } {
  const removed: RemovedBlock[] = [];

  const counts = new Map<string, number>();
  if (!isInterview) {
    for (const line of text.split('\n')) {
      const key = line.trim().toLowerCase();
      if (key && key.length <= REPEAT_MAX_LEN) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const paragraphs: string[] = [];
  for (const para of splitParagraphs(text)) {
    const kept: string[] = [];
    for (const line of para.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const junk = t.length < 200 ? JUNK_LINE.find((j) => j.re.test(t)) : undefined;
      if (junk) {
        removed.push({ text: t, reason: junk.reason });
      } else if ((counts.get(t.toLowerCase()) ?? 0) >= REPEAT_MIN_COUNT && !/[.!?]["”’)]?$/.test(t)) {
        // A full sentence repeated is more likely a refrain than a footer.
        removed.push({ text: t, reason: 'Repeated header/footer' });
      } else {
        kept.push(line);
      }
    }
    if (kept.length) paragraphs.push(kept.join('\n'));
  }

  return { paragraphs, removed: collapseRepeats(removed) };
}

/** "Page number" ×40 is noise in the review list; keep one example of each. */
function collapseRepeats(blocks: RemovedBlock[]): RemovedBlock[] {
  const out: RemovedBlock[] = [];
  const seen = new Map<string, RemovedBlock & { n: number }>();
  for (const b of blocks) {
    // Page numbers differ in text but are one kind of thing.
    const key = b.reason === 'Page number' ? b.reason : `${b.reason}|${b.text.toLowerCase()}`;
    const prev = seen.get(key);
    if (prev) {
      prev.n++;
      prev.reason = `${b.reason} (×${prev.n})`;
    } else {
      const entry = { ...b, n: 1 };
      seen.set(key, entry);
      out.push(entry);
    }
  }
  return out.map(({ text, reason }) => ({ text, reason }));
}

/** Group paragraph indices into batches of roughly BATCH_CHARS. */
export function batchParagraphs(paragraphs: string[]): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let size = 0;
  paragraphs.forEach((p, i) => {
    if (size + p.length > BATCH_CHARS && current.length) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += p.length;
  });
  if (current.length) batches.push(current);
  return batches;
}

export interface JudgeResult {
  remove: { index: number; reason: string }[];
  problems: string[];
}

const JUDGE_MODEL = 'gpt-5-mini';

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['remove', 'problems'],
  properties: {
    remove: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'reason'],
        properties: {
          index: { type: 'integer' },
          reason: { type: 'string' },
        },
      },
    },
    problems: { type: 'array', items: { type: 'string' } },
  },
};

const JUDGE_INSTRUCTIONS = `You prepare articles to be read aloud by text-to-speech. You receive numbered paragraphs from ONE piece (an article, essay, newsletter or interview), extracted from a web page, email or PDF.

1. "remove": list every paragraph a careful human editor would agree is NOT part of the piece's body, with a short reason. Be aggressive about:
   - page numbers, running headers/footers, PDF artifacts, table-of-contents lines
   - navigation, menus, cookie/login/paywall notices, "view in browser", share/like/comment/subscribe prompts
   - ads, sponsor messages, promotional blocks, "upgrade to paid", referral and gift offers
   - image captions, photo credits, alt text, "click to enlarge"
   - related-article lists, comment sections, author bios boilerplate, legal/copyright footers
   Do NOT remove anything the author wrote as part of the piece: quotes, block quotes, lists, footnote text, headings that structure the piece, or interview speaker turns. When unsure, keep it.

2. "problems": list any sign the extraction itself went wrong, each as one short plain sentence. Examples: the text is a login, viewer, error or file-sharing page instead of the document; it looks garbled or like bad OCR; large parts seem missing; it ends mid-sentence (judge only on the final batch); paragraphs from more than one unrelated piece are mixed together. Return an empty list when the text reads as one coherent piece.`;

export async function judgeBatch(opts: {
  apiKey: string;
  title: string;
  paragraphs: string[];
  indices: number[];
  batchNumber: number;
  batchCount: number;
}): Promise<JudgeResult> {
  const { apiKey, title, paragraphs, indices, batchNumber, batchCount } = opts;
  const numbered = indices.map((i) => `[${i}] ${paragraphs[i]}`).join('\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      reasoning_effort: 'low',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'transcript_review', strict: true, schema: JUDGE_SCHEMA },
      },
      messages: [
        { role: 'system', content: JUDGE_INSTRUCTIONS },
        {
          role: 'user',
          content: `Title: ${title}\nBatch ${batchNumber} of ${batchCount}${batchNumber === batchCount ? ' (final batch — check whether the piece ends properly)' : ''}.\n\n${numbered}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300) || 'no detail'}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as JudgeResult;
  const valid = new Set(indices);
  return {
    // Ignore any index outside this batch rather than trusting the model.
    remove: (parsed.remove ?? []).filter((r) => valid.has(r.index)),
    problems: parsed.problems ?? [],
  };
}

export interface PreparedTranscript {
  content: string;
  removed: RemovedBlock[];
  unrelatedShare: number;
  reviewNotes: string[];
}

/** Combine both passes into the final text and the review decision. */
export function finalizeTranscript(opts: {
  originalLength: number;
  paragraphs: string[];
  ruleRemoved: RemovedBlock[];
  judged: JudgeResult[];
  judgeError?: string | null;
  fromUrl: boolean;
}): PreparedTranscript {
  const { originalLength, paragraphs, ruleRemoved, judged, judgeError, fromUrl } = opts;

  const dropped = new Map<number, string>();
  for (const j of judged) for (const r of j.remove) dropped.set(r.index, r.reason);

  const kept = paragraphs.filter((_, i) => !dropped.has(i));
  const content = kept.join('\n\n');

  const removed: RemovedBlock[] = [
    ...ruleRemoved,
    ...[...dropped].sort((a, b) => a[0] - b[0]).map(([i, reason]) => ({ text: paragraphs[i], reason })),
  ];

  const keptChars = content.replace(/\s+/g, '').length;
  const totalChars = Math.max(originalLength, 1);
  const unrelatedShare = Math.max(0, 1 - keptChars / totalChars);

  const reviewNotes: string[] = [];
  if (unrelatedShare > REVIEW_THRESHOLD) {
    reviewNotes.push(`${(unrelatedShare * 100).toFixed(1)}% of the extracted text looked unrelated to the piece and was cut — check nothing important went with it.`);
  }
  for (const j of judged) reviewNotes.push(...j.problems);
  if (judgeError) reviewNotes.push(`The automatic transcript check couldn't run (${judgeError}). Give it a quick read.`);
  if (fromUrl && keptChars < 800) {
    reviewNotes.push('Very little text came back from the link — it may be a login, preview or file-sharing page rather than the article.');
  }

  return { content, removed, unrelatedShare, reviewNotes: [...new Set(reviewNotes)] };
}

/** Whitespace-free length, so reflowed line breaks don't count as "removed". */
export function textLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}
