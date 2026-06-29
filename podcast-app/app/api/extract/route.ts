import { NextRequest, NextResponse } from 'next/server';
import { extractArticle } from '@/lib/extraction';

export async function POST(request: NextRequest) {
  const { url } = await request.json();
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  try {
    const result = await extractArticle(url);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 422 },
    );
  }
}
