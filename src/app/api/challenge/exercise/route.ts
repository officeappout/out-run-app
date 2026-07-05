/**
 * GET /api/challenge/exercise?id=<exerciseId>
 *
 * Returns minimal exercise data (name + videoUrl) for the challenge timer page.
 * Public, no auth required, read-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const snap = await getAdminDb().doc(`exercises/${id}`).get();
    if (!snap.exists) {
      return NextResponse.json({ videoUrl: null, name: id });
    }
    const data = snap.data()!;
    // Video lives in different places depending on exercise structure.
    // Priority: root.videoUrl → root.media.videoUrl → execution_methods[0].media.mainVideoUrl
    const videoUrl: string | null =
      data.videoUrl ??
      data.media?.videoUrl ??
      data.execution_methods?.[0]?.media?.mainVideoUrl ??
      null;
    const rawName = data.name ?? data.nameHe ?? id;
    const name = typeof rawName === 'object' ? (rawName.he ?? rawName.en ?? id) : rawName;
    return NextResponse.json({ videoUrl, name });
  } catch (err) {
    console.error('[challenge/exercise] error:', err);
    return NextResponse.json({ videoUrl: null, name: id });
  }
}
