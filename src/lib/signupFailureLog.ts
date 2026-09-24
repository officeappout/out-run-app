/**
 * signupFailureLog.ts — server-side, fail-safe recording of a signup/
 * onboarding failure. 24.09.2026, David's "eyes for launch day" request
 * (part ב — the failure-logging collection; part א/Crashlytics is frozen
 * until the next native build ships — see docs/audit-2026-09/00-MASTER-
 * PLAN.md §13.18/§13.19).
 *
 * Hard requirements (David, explicit):
 *   - No PII, ever: `uid` only (already an opaque id, no name/email/
 *     phone), a closed-list `stage`, and `reason` — a short, machine-
 *     generated error CODE (Firebase's own `error.code`, or a fixed
 *     fallback string), never the raw error message. A caller passing
 *     free text here is a bug at the CALL SITE, not something this file
 *     can detect — every call site must extract a code, not a message
 *     (see src/lib/reportSignupFailure.ts's extractErrorCode for the
 *     client-side half of this discipline).
 *   - Fail-safe: if the write itself fails, swallow it. A user who's
 *     already stuck must never be handed a SECOND error because our own
 *     diagnostic logging broke. Deliberately the same fail-open posture
 *     as src/lib/rateLimit.ts, for the same underlying reason: the cost
 *     of a missed diagnostic write is far lower than the cost of turning
 *     a stuck-signup bug into a stuck-signup-plus-a-new-crash bug.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type SignupFailureStage =
  | 'AUTH_GOOGLE'
  | 'AUTH_APPLE'
  | 'AUTH_ANONYMOUS'
  | 'GATEWAY_EXPLORE'
  | 'GATEWAY_GET_PROGRAM'
  | 'EXPLORE_MAP_PROFILE_WRITE'
  | 'IDENTITY_SUBMIT'
  | 'COMPLETE_PROFILE_SERVER'
  | 'ASSESSMENT_SAVE'
  | 'RUNNING_DYNAMIC_SYNC'
  | 'HEALTH_SYNC';

/** The closed list — every real catch site this stage covers, matched
 *  1:1 to the actual call sites wired up (see docs/audit-2026-09/00-
 *  MASTER-PLAN.md §13.19/§13.22 for the file:line list). Not aspirational —
 *  every value here has exactly one caller. */
export const SIGNUP_FAILURE_STAGES: readonly SignupFailureStage[] = [
  'AUTH_GOOGLE',
  'AUTH_APPLE',
  'AUTH_ANONYMOUS',
  'GATEWAY_EXPLORE',
  'GATEWAY_GET_PROGRAM',
  'EXPLORE_MAP_PROFILE_WRITE',
  'IDENTITY_SUBMIT',
  'COMPLETE_PROFILE_SERVER',
  'ASSESSMENT_SAVE',
  'RUNNING_DYNAMIC_SYNC',
  'HEALTH_SYNC',
];

const REASON_MAX_LENGTH = 100;

export interface SignupFailureParams {
  uid: string | null;
  stage: SignupFailureStage;
  reason: string;
}

export async function logSignupFailure(db: Firestore, params: SignupFailureParams): Promise<void> {
  if (!SIGNUP_FAILURE_STAGES.includes(params.stage)) {
    console.warn('[signupFailureLog] unknown stage, not recorded:', params.stage);
    return;
  }
  const reason = (params.reason || 'unknown').slice(0, REASON_MAX_LENGTH);
  try {
    await db.collection('signup_failures').add({
      uid: params.uid,
      stage: params.stage,
      reason,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Fail-safe by design (see file header) — never let this throw upward.
    console.warn('[signupFailureLog] failed to record signup failure (swallowed):', err);
  }
}
