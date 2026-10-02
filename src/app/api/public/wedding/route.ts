import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { readWedding, writeWedding } from '@/features/wedding/wedding.server';

/**
 * /api/public/wedding — the wedding planner's data. Open by design, no
 * login or token (David's explicit choice, 02.10.2026). Touches only the
 * single wedding_planner/main document; the body is sanitized by
 * parseWeddingState before it is stored.
 */

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  return NextResponse.json(await readWedding(), { headers: noStore });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  try {
    const result = await writeWedding(body, 'public-link');
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.conflict) return NextResponse.json({ error: 'conflict', ...result.doc }, { status: 409, headers: noStore });
    return NextResponse.json(result.doc, { headers: noStore });
  } catch (err) {
    console.error('[wedding/public] save failed', err);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
}
