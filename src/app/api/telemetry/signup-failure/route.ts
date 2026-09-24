/**
 * POST /api/telemetry/signup-failure — records a signup/onboarding
 * failure for launch-day visibility (David, 24.09.2026 — see
 * docs/audit-2026-09/00-MASTER-PLAN.md §13.18/§13.19).
 *
 * Deliberately NOT gated behind a required auth token — many of the
 * failures this exists to catch happen BEFORE a user has any session at
 * all (e.g. anonymous sign-in itself failing, before any uid exists). An
 * Authorization header is read if present (best-effort uid attribution),
 * but an invalid/expired/missing token never rejects the request — this
 * endpoint's only rejection reasons are malformed input and IP rate-
 * limiting. It is called fire-and-forget from the client
 * (src/lib/reportSignupFailure.ts) — nothing here is meant to be awaited
 * or surfaced to the user either way.
 *
 * No PII: uid (an opaque id, already not personally identifying on its
 * own) + a closed-list stage + a short error-code reason — see
 * src/lib/signupFailureLog.ts for the full write-side contract.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';
import { logSignupFailure, SIGNUP_FAILURE_STAGES, type SignupFailureStage } from '@/lib/signupFailureLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const db = getAdminDb();

    // IP dimension first — cheapest gate, before anything else. This route
    // has no per-uid dimension: many callers have no uid at all yet.
    const ipCheck = await isBlockedByAny(db, [
      { key: `signup-failure-telemetry:ip:${ip}`, window: RATE_LIMITS.signupFailureTelemetry.ip() },
    ]);
    if (ipCheck.blocked) {
      logRateLimitBlock({ route: 'signup-failure-telemetry', dimension: 'ip', ip });
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const stage = typeof (body as { stage?: unknown } | null)?.stage === 'string' ? (body as { stage: string }).stage : '';
    const reason = typeof (body as { reason?: unknown } | null)?.reason === 'string' ? (body as { reason: string }).reason : '';
    if (!SIGNUP_FAILURE_STAGES.includes(stage as SignupFailureStage) || !reason) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Best-effort uid attribution — an invalid/missing token is never a
    // rejection reason here, only ever leaves uid as null.
    let uid: string | null = null;
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (idToken) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(idToken, false);
        uid = decoded.uid;
      } catch {
        uid = null;
      }
    }

    await logSignupFailure(db, { uid, stage: stage as SignupFailureStage, reason });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/telemetry/signup-failure] error:', err?.message ?? err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
