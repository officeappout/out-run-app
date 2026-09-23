/**
 * POST /api/auth/login-link-gate
 *
 * Pre-flight rate-limit check for sending a passwordless login link.
 * `sendMagicLink` (src/lib/auth.service.ts) calls Firebase's client SDK
 * (`sendSignInLinkToEmail`) DIRECTLY from the browser — there was no
 * server-side gate on that action at all before this route. See
 * .claude/plans/rate-limiting-sensitive-endpoints.md §0.1: this gate is
 * best-effort (a scripted caller can still hit Firebase's own public REST
 * endpoint directly, bypassing this route entirely) — Firebase's own
 * 150-requests/IP/hour cap is the real hard backstop for that case.
 *
 * This endpoint does ONLY rate limiting — no "does this email exist"
 * check. authority-portal/login/page.tsx sends its magic link
 * unconditionally by design, specifically to avoid becoming an "is X a
 * manager" oracle (see that file's own comment at the sendMagicLink call
 * site) — this gate must preserve that property. The response differs
 * ONLY on submission frequency (both by IP and by email), never on
 * whether the email is registered: the rate-limit counters increment
 * identically for a real manager's address and a made-up one, so a 429
 * here reveals nothing about registration status, only that this exact
 * IP/email pair has submitted the form some N times already — information
 * the caller already has.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_MESSAGE = 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const db = getAdminDb();

  // Email dimension checked first — it's the primary defense (a targeted
  // attacker floods one inbox regardless of which IP they use). IP
  // dimension is deliberately more generous: a whole municipality office
  // can sit behind one shared IP (see the plan doc's part ב).
  const emailCheck = await isBlockedByAny(db, [
    { key: `login-link:email:${email}:short`, window: RATE_LIMITS.loginLink.emailShort() },
    { key: `login-link:email:${email}:daily`, window: RATE_LIMITS.loginLink.emailDaily() },
  ]);
  if (emailCheck.blocked) {
    logRateLimitBlock({ route: 'login-link-gate', dimension: 'email', ip, identifier: email });
    return NextResponse.json(
      { allowed: false, error: GENERIC_MESSAGE },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((emailCheck.window?.windowMs ?? 900_000) / 1000)) } },
    );
  }

  const ipCheck = await isBlockedByAny(db, [
    { key: `login-link:ip:${ip}:hourly`, window: RATE_LIMITS.loginLink.ipHourly() },
    { key: `login-link:ip:${ip}:daily`, window: RATE_LIMITS.loginLink.ipDaily() },
  ]);
  if (ipCheck.blocked) {
    logRateLimitBlock({ route: 'login-link-gate', dimension: 'ip', ip, identifier: email });
    return NextResponse.json(
      { allowed: false, error: GENERIC_MESSAGE },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((ipCheck.window?.windowMs ?? 3_600_000) / 1000)) } },
    );
  }

  return NextResponse.json({ allowed: true });
}
