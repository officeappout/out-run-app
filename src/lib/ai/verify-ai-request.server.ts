/**
 * verifyAiRequest — the gate every user-facing AI route runs first (OUT AI Phase 0).
 *
 * In order (cheapest / most specific first; nothing is spent before every check passes):
 *   1. Bearer Firebase ID token, verifyIdToken(token, checkRevoked=true)      → 401
 *   2. users/{uid} exists and core.ageGroup === 'adult'                        → 403
 *   3. canUseAi(flags, entitlements/{uid})                                    → 403
 *   4. app_config/ai kill switch + daily budget (assertAiBudget)              → 503
 *   5. per-user hour/day rate limit, fail-closed (checkAiRateLimit)           → 429
 * Budget runs before the rate limit so a killed / exhausted day doesn't burn the user's quota.
 *
 * Rate-limit exemptions (the kill switch and the global daily budget still apply to them):
 *   - the OUT team: root admins (isRootAdmin on the token's email, the same allowlist as
 *     firestore.rules) and super admins (users/{uid}.core.isSuperAdmin), who test Kelly all day;
 *   - `opts.rateLimit: false` — the caller has already paid for this turn (the chat route's
 *     client-tool continuation, see /api/ai-coach/chat).
 *
 * A denial after the token check carries `uid` (and `profile` / `flags` once read), so a route
 * can still answer the user without AI (the Kelly chat's paused reply).
 *
 * Any infrastructure failure along the way (Firestore down, unreadable config) is a 503 —
 * never a pass. Usage:
 *
 *   const auth = await verifyAiRequest(request);
 *   if (!auth.ok) return aiDenialResponse(auth);
 *   // auth.uid, auth.profile, auth.config
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { canUseAi, type AiEntitlementDoc } from './ai-entitlement';
import type { AiConfig } from './ai-config';
import { AiUnavailableError, assertAiBudget, checkAiRateLimit, loadAiConfig } from './anthropic.server';
import { aiFlagsFrom, getAiEntitlement, getServerFeatureFlags, type ServerFeatureFlags } from './entitlement.server';

/** users/{uid} as stored (raw Firestore data, read through optional chaining). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data
export type AiProfileDoc = Record<string, any>;

export type AiDenialCode =
  | 'missing_token'
  | 'invalid_token'
  | 'profile_not_found'
  | 'not_adult'
  | 'ai_not_available'
  | 'rate_limited'
  | 'kill_switch'
  | 'over_budget'
  | 'unavailable';

export interface AiDenial {
  ok: false;
  status: 401 | 403 | 429 | 503;
  code: AiDenialCode;
  retryAfterSec?: number;
  /** Set once the token is verified. */
  uid?: string;
  /** users/{uid}, once read (never sent to the client). */
  profile?: AiProfileDoc;
  /** Feature flags, once read. */
  flags?: ServerFeatureFlags;
}

export interface VerifyAiRequestOptions {
  /** false: skip the per-user rate limit (the turn was already counted). Default true. */
  rateLimit?: boolean;
}

/** The OUT team is exempt from the per-user rate limit (not from the kill switch / budget). */
export function isAiRateLimitExempt(email: string | null | undefined, profile: AiProfileDoc | null | undefined): boolean {
  return isRootAdmin(email) || profile?.core?.isSuperAdmin === true;
}

export interface AiGrant {
  ok: true;
  uid: string;
  /** users/{uid} as stored (Admin SDK read). Build the AI context from this — never send contact details. */
  profile: AiProfileDoc;
  entitlement: AiEntitlementDoc | null;
  config: AiConfig;
  /** system_config/feature_flags as read for this request (real values, no super-admin override). */
  flags?: ServerFeatureFlags;
}

const deny = (
  status: AiDenial['status'],
  code: AiDenialCode,
  retryAfterSec?: number,
  ctx: Pick<AiDenial, 'uid' | 'profile' | 'flags'> = {},
): AiDenial => ({
  ok: false,
  status,
  code,
  ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
  ...(ctx.uid ? { uid: ctx.uid } : {}),
  ...(ctx.profile ? { profile: ctx.profile } : {}),
  ...(ctx.flags ? { flags: ctx.flags } : {}),
});

export async function verifyAiRequest(request: Request, opts: VerifyAiRequestOptions = {}): Promise<AiGrant | AiDenial> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return deny(401, 'missing_token');

  let uid: string;
  let email: string | null = null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    uid = decoded.uid;
    email = typeof decoded.email === 'string' ? decoded.email : null;
  } catch {
    return deny(401, 'invalid_token');
  }

  try {
    const db = getAdminDb();
    const [userSnap, flags, entitlement] = await Promise.all([
      db.collection('users').doc(uid).get(),
      getServerFeatureFlags(db),
      getAiEntitlement(uid, db),
    ]);

    if (!userSnap.exists) return deny(403, 'profile_not_found', undefined, { uid, flags });
    const profile = (userSnap.data() ?? {}) as AiProfileDoc;
    const ctx = { uid, profile, flags };
    if (profile.core?.ageGroup !== 'adult') return deny(403, 'not_adult', undefined, ctx);

    if (!canUseAi({ flags: aiFlagsFrom(flags), entitlement })) return deny(403, 'ai_not_available', undefined, ctx);

    let config: AiConfig;
    try {
      config = await loadAiConfig(db);
      await assertAiBudget(db, { config });
    } catch (err) {
      if (err instanceof AiUnavailableError && err.reason !== 'config_unavailable') {
        return deny(503, err.reason, undefined, ctx);
      }
      console.error('[ai] verifyAiRequest: config/budget unavailable', err);
      return deny(503, 'unavailable', undefined, ctx);
    }

    if (opts.rateLimit !== false && !isAiRateLimitExempt(email, profile)) {
      const rl = await checkAiRateLimit(uid, config, db);
      if (rl.limited) return deny(429, 'rate_limited', rl.retryAfterSec, ctx);
    }

    return { ok: true, uid, profile, entitlement, config, flags };
  } catch (err) {
    console.error('[ai] verifyAiRequest failed — denying', err);
    return deny(503, 'unavailable', undefined, { uid });
  }
}

/** Standard JSON response for a denial: `{ error: code }` + Retry-After on 429. */
export function aiDenialResponse(denial: AiDenial): NextResponse {
  return NextResponse.json(
    { error: denial.code },
    {
      status: denial.status,
      headers: denial.retryAfterSec ? { 'Retry-After': String(denial.retryAfterSec) } : undefined,
    },
  );
}
