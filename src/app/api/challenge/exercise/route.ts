/**
 * GET /api/challenge/exercise?id=<exerciseId>
 *
 * Returns minimal exercise data (name + videoUrl) for the challenge timer page.
 * Public, no auth required, read-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Cheapest of the surveyed public endpoints (single-doc read), still
    // rate-limited by IP for consistency — see plan doc appendix a.
    const ip = getRequestIp(request);
    const { blocked, window } = await isBlockedByAny(db, [
      { key: `challenge-exercise:ip:${ip}`, window: RATE_LIMITS.challengeExercise.ip() },
    ]);
    if (blocked) {
      logRateLimitBlock({ route: 'challenge-exercise', dimension: 'ip', ip });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((window?.windowMs ?? 60_000) / 1000)) } },
      );
    }

    const snap = await db.doc(`exercises/${id}`).get();
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
