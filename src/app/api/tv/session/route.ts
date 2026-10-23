/**
 * POST /api/tv/session — opens a TV pairing session (enable_tv_mode_v1).
 *
 * Public (a TV has no account). Creates `tvSessions/{code}` with the Admin SDK so clients can
 * never create or choose a code themselves: 6 random digits (crypto), collision-safe (a code is
 * never reused while its document exists), 4 hours to live, rate-limited per IP.
 * Returns { code, expiresAtMs }. The phone that enters the code first claims the host role.
 *
 * Expired sessions are also removed by a Firestore TTL policy on `expiresAt` (owner action,
 * see docs/tv-mode/README.md); participants carry the same `expiresAt`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { getRequestIp } from '@/lib/requestIp';
import { allocateCode } from '@/features/tv-mode/core/code';
import { expiresAtFor } from '@/features/tv-mode/core/expiry';
import { TV_COLLECTION } from '@/features/tv-mode/core/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const db = getAdminDb();
  if (await isRateLimited(db, `tv-session:ip:${getRequestIp(request)}`, RATE_LIMITS.tvSession.ip())) {
    return NextResponse.json({ error: 'rate-limited' }, { status: 429 });
  }

  const nowMs = Date.now();
  const expiresAtMs = expiresAtFor(nowMs);

  try {
    const code = await allocateCode(async (candidate) => {
      const ref = db.collection(TV_COLLECTION).doc(candidate);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // Any existing doc counts as taken, expired or not: its participants sub-collection is
        // still there until the TTL policy removes both, and must never leak into a new session.
        if (snap.exists) return false;
        tx.set(ref, {
          code: candidate,
          hostUid: null,
          hostName: null,
          hostGender: null,
          status: 'waiting',
          createdAt: Timestamp.fromMillis(nowMs),
          expiresAt: Timestamp.fromMillis(expiresAtMs),
          volume: 1,
        });
        return true;
      });
    }, randomInt);
    return NextResponse.json({ code, expiresAtMs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api/tv/session] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
