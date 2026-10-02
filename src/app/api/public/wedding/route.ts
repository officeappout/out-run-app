import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { isValidShareToken, readWedding, writeWedding } from '@/features/wedding/wedding.server';

/**
 * /api/public/wedding — share-link access to the wedding planner.
 * No login: the caller presents the secret in the `x-wedding-token` header
 * (the page at /public/wedding/<token> sends it). A wrong token, or the
 * link being switched off (WEDDING_SHARE_TOKEN unset), answers 404 so the
 * endpoint does not confirm it exists.
 */

export const dynamic = 'force-dynamic';

function denied(request: NextRequest): NextResponse | null {
  if (isValidShareToken(request.headers.get('x-wedding-token'))) return null;
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const deny = denied(request);
  if (deny) return deny;
  return NextResponse.json(await readWedding(), { headers: noStore });
}

export async function PUT(request: NextRequest) {
  const deny = denied(request);
  if (deny) return deny;

  const body = await request.json().catch(() => null);
  try {
    const result = await writeWedding(body, 'share-link');
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.conflict) return NextResponse.json({ error: 'conflict', ...result.doc }, { status: 409, headers: noStore });
    return NextResponse.json(result.doc, { headers: noStore });
  } catch (err) {
    console.error('[wedding/public] save failed', err);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
}
