/**
 * rateLimitConfig.ts — single source of truth for every rate-limit
 * threshold introduced in the 22.09.2026 rate-limiting rollout (see
 * .claude/plans/rate-limiting-sensitive-endpoints.md).
 *
 * Every threshold is an env var with a code default, per David's explicit
 * requirement: thresholds must be loosenable/tightenable without a deploy.
 * An unset or non-numeric env var falls back to the code default silently
 * — this is a tuning knob, not a required config, so a missing/malformed
 * value must never break the endpoint it protects.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { isRateLimited } from './rateLimit';

export interface RateLimitWindow {
  windowMs: number;
  maxRequests: number;
}

function envWindow(prefix: string, defaultWindowMs: number, defaultMax: number): RateLimitWindow {
  const windowMs = Number(process.env[`${prefix}_WINDOW_MS`]);
  const maxRequests = Number(process.env[`${prefix}_MAX`]);
  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : defaultWindowMs,
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : defaultMax,
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Every threshold below, with its env var names, mirrors the table in
 * .claude/plans/rate-limiting-sensitive-endpoints.md part ב — keep both in
 * sync when a value changes here.
 */
export const RATE_LIMITS = {
  // Priority 1 — sending a login link (sendMagicLink pre-flight gate).
  loginLink: {
    emailShort: () => envWindow('RL_LOGIN_LINK_EMAIL_SHORT', 15 * MIN, 3),
    emailDaily: () => envWindow('RL_LOGIN_LINK_EMAIL_DAILY', DAY, 5),
    ipHourly: () => envWindow('RL_LOGIN_LINK_IP_HOURLY', HOUR, 20),
    ipDaily: () => envWindow('RL_LOGIN_LINK_IP_DAILY', DAY, 100),
  },
  // Priority 2 — POST /api/auth/accept-invitation.
  acceptInvitation: {
    ipShort: () => envWindow('RL_ACCEPT_INVITATION_IP_SHORT', 15 * MIN, 20),
    ipHourly: () => envWindow('RL_ACCEPT_INVITATION_IP_HOURLY', HOUR, 60),
  },
  // Priority 3 — POST /api/auth/session.
  session: {
    ipShort: () => envWindow('RL_SESSION_IP_SHORT', 15 * MIN, 60),
    ipHourly: () => envWindow('RL_SESSION_IP_HOURLY', HOUR, 200),
    uidShort: () => envWindow('RL_SESSION_UID_SHORT', 15 * MIN, 10),
    uidHourly: () => envWindow('RL_SESSION_UID_HOURLY', HOUR, 30),
  },
  // Priority 4 — POST/DELETE /api/admin/invitations (shared budget, both verbs).
  adminInvitations: {
    ipShort: () => envWindow('RL_ADMIN_INVITATIONS_IP_SHORT', 15 * MIN, 10),
    ipHourly: () => envWindow('RL_ADMIN_INVITATIONS_IP_HOURLY', HOUR, 30),
    adminShort: () => envWindow('RL_ADMIN_INVITATIONS_ADMIN_SHORT', 15 * MIN, 10),
    adminHourly: () => envWindow('RL_ADMIN_INVITATIONS_ADMIN_HOURLY', HOUR, 20),
  },
  // Priority 5 — public Firestore-reading endpoints (survey findings).
  linkClick: {
    ip: () => envWindow('RL_LINK_CLICK_IP', MIN, 30),
    linkId: () => envWindow('RL_LINK_CLICK_LINKID', MIN, 120),
  },
  calendar: {
    ip: () => envWindow('RL_CALENDAR_IP', MIN, 10),
  },
  leaderboard: {
    ip: () => envWindow('RL_LEADERBOARD_IP', MIN, 30),
  },
  challengeExercise: {
    ip: () => envWindow('RL_CHALLENGE_EXERCISE_IP', MIN, 60),
  },
  // Task 4 Stage 1 — POST /api/units/join-requests (create + re-request
  // after rejection). David's ד.5 decision (23.09.2026): "בקשה חוזרת אחת
  // ל-24 שעות, מקסימום 3 ניסיונות" — the closest direct fit using this
  // module's existing sliding-window primitive (no separate "min spacing"
  // algorithm exists here) is "at most 3 attempts in any rolling 24h
  // window," applied uniformly to every create call for a given uid
  // (first request included, not just re-requests — simpler to reason
  // about and still well within a generous cap for a legitimate user).
  unitJoinRequest: {
    uidDaily: () => envWindow('RL_UNIT_JOIN_REQUEST_UID_DAILY', DAY, 3),
  },
  // POST /api/telemetry/signup-failure (24.09.2026) — David's launch-day
  // visibility request. IP-only (this endpoint is deliberately reachable
  // pre-auth, since many of the failures it exists to catch happen before
  // any session exists at all). Generous cap — a user genuinely stuck in
  // a bad signup session may legitimately retry several times in a row;
  // this is abuse-flooding protection, not a tight security gate.
  signupFailureTelemetry: {
    ip: () => envWindow('RL_SIGNUP_FAILURE_TELEMETRY_IP', 15 * MIN, 30),
  },
  // POST /api/units/declare (25.09.2026) — persona-flow self-declaration of
  // a military/educational unit. uid-keyed (authenticated route, matches
  // unitJoinRequest's own precedent above) — generous, since this is
  // abuse-flooding protection for a low-frequency legitimate action
  // (declare once, maybe switch units a handful of times), not a tight gate.
  unitDeclaration: {
    uidHourly: () => envWindow('RL_UNIT_DECLARATION_UID_HOURLY', HOUR, 10),
  },
  // GET /api/units/structure (25.09.2026, Slice D — §13.28) — the officer
  // panel's own read of a unit's name/path/icon + its children. A normal
  // page load fires this once or twice; generous headroom for repeated
  // navigation between units in the same session.
  unitStructure: {
    uidHourly: () => envWindow('RL_UNIT_STRUCTURE_UID_HOURLY', HOUR, 60),
  },
} as const;

/**
 * Runs one or more isRateLimited checks in order and short-circuits on the
 * first one that blocks — each key is an independent bucket (e.g. a short
 * window and a daily window for the same dimension), so ANY hit blocks the
 * whole request. Every isRateLimited call already fails open on its own
 * (see rateLimit.ts) — this helper adds no additional failure handling.
 */
export async function isBlockedByAny(
  db: Firestore,
  checks: Array<{ key: string; window: RateLimitWindow }>,
): Promise<{ blocked: boolean; window: RateLimitWindow | null }> {
  for (const check of checks) {
    if (await isRateLimited(db, check.key, check.window)) {
      return { blocked: true, window: check.window };
    }
  }
  return { blocked: false, window: null };
}
