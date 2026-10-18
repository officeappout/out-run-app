/**
 * stepGoalNudgeScheduler — Scheduled Cloud Function.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════
 * Evening nudge for users who haven't hit their daily step goal yet.
 * First live caller of both `persona-alias-map.service.ts` (Phase 0 Item 4,
 * previously zero callers) and `notification-content.service.ts` (the
 * generic selector over the existing "מנהל התראות" content library at
 * `workoutMetadata/notifications/notifications` — NOT a new parallel
 * store). See `.claude/knowledge/notification-manager-wiring-design.md`.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ELIGIBILITY (normal mode)
 * ═══════════════════════════════════════════════════════════════════════
 *   1. `onboardingStatus === 'COMPLETED'`
 *   2. Copy exists in the push library (push-copy.service.ts, pushType
 *      'step_goal') for the bucket the user is actually in right now
 *      (condition bucket = computed from `dailyActivity/{uid}_{today}.steps`
 *      / the user's ONE step goal — see `computeDailyGoalBucket` and
 *      lib/resolveUserStepGoal), library rows first, then the code
 *      defaults — if none, the user is silently skipped, not an error. Only
 *      start/mid/close copy exists, so hit/over-bucket users are skipped in
 *      practice today (no celebration copy yet), not specially excluded.
 *      Original content-library rows (triggerType 'Daily_Goal') are still
 *      read, adapted by push-copy.service.ts.
 *      The goal comes from the same resolver the app's home ring and streak
 *      use (src/features/activity/lib/step-goal.ts, vendored): the user's
 *      manual choice, else the weekly adaptive goal (base 8000) — so the
 *      push's start/mid/close bucket and "@צעדים left" always match the
 *      screen. `steps` defaults to 0 when the day's activity doc doesn't
 *      exist yet.
 *   Standard push.service.ts guardrails apply on top (pushEnabled,
 *   notificationPrefs.health_milestone, rate cap, global/per-channel
 *   kill-switch).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TEST-SCOPING (app_config/feature_flags.stepGoalTestUids)
 * ═══════════════════════════════════════════════════════════════════════
 * When this Firestore array field is non-empty, the function SKIPS the
 * full candidate query and the below-goal eligibility filter entirely —
 * it evaluates ONLY the listed uid(s) directly, unconditionally eligible
 * (a deliberate QA override: forces a real end-to-end send regardless of
 * the test user's actual step count/goal today, so a single dev can
 * verify the whole pipeline without waiting to actually be behind goal).
 * Implemented as a Firestore field rather than an env var — deliberate
 * deviation from the originally-discussed `STEP_GOAL_TEST_UIDS` env-var
 * name, because this deployment has no working env-var mechanism today
 * (no `functions/.env.*` file, no `defineString`/`defineSecret` usage
 * anywhere in the codebase — every existing scheduler's env-var configs
 * are unset in practice, always running on their documented fallback).
 * A Firestore field also means the test scope can be widened/narrowed
 * without a redeploy, consistent with every other flag in this project.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MASTER FLAG (app_config/feature_flags.stepGoalNudgeEnabled)
 * ═══════════════════════════════════════════════════════════════════════
 * Default false/absent — the function logs and returns immediately when
 * not `=== true`. Deploying this function is safe regardless of flag
 * state; it does nothing until flipped.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCHEDULE
 * ═══════════════════════════════════════════════════════════════════════
 * 18:00 Asia/Jerusalem daily — sits inside active hours. Quiet hours are
 * NOT bypassed (since 17.10.2026 — one uniform policy; the check is free at
 * 18:00). Shabbat/yom tov is enforced by sendPush() itself.
 *
 * MORNING-ONLY BUCKET
 * ───────────────────
 * The 'start' bucket (<25% of goal) is seeded with MORNING copy only ("יום
 * חדש", "בוא/י נתחיל את היום נכון", "לפני שיושבים מול המסך כל היום") — so
 * from noon on, 'start'-bucket users are skipped rather than sent a
 * good-morning message at 18:00 (see isMorningOnlyBucketAtThisHour). They
 * come back once evening copy for that bucket exists.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { resolveCanonicalPersona } from './services/notification-content.service';
import {
  resolvePushCopy,
  pushCopyData,
  audienceFromUserData,
  firstNameFromUserData,
} from './services/push-copy.service';
import type { PushAudience, PushCopyContext } from './shared/push-library.core';
import { DEFAULT_OUTCOME_WINDOW_HOURS } from './services/push-events.service';
import type { PersonaResolvableProfile } from './services/persona-alias-map.service';
import { resolveUserStepGoal } from './lib/resolveUserStepGoal';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Configuration ────────────────────────────────────────────────────────────

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.STEP_GOAL_BATCH_LIMIT);
  return Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : 300;
})();


const TRIGGER_TYPE = 'Daily_Goal';
const ACTIVITY_TYPE = 'walking';
const TOKEN_FETCH_BATCH = 100;

/** Mirrors route-request.utils.ts's stepsToTargetKm() — src/ code, not
 * importable into functions/src (cross-project boundary, see axioms.md §4
 * style rationale in persona-alias-map.service.ts). Same constant, same
 * formula: average walking stride, no pace/time-of-day chunking. */
const AVG_WALK_STRIDE_METERS = 0.75;
function stepsToDistanceMeters(steps: number): number {
  const safeSteps = Number.isFinite(steps) && steps > 0 ? steps : 0;
  return Math.round(safeSteps * AVG_WALK_STRIDE_METERS);
}

/** Approximate walking minutes for @דקות — steps-per-minute assumption for
 * an average walking pace, min 1 (never "0 minutes" for a nonzero gap). */
const AVG_STEPS_PER_MINUTE = 110;
function stepsToWalkMinutes(steps: number): number {
  const safeSteps = Number.isFinite(steps) && steps > 0 ? steps : 0;
  return Math.max(1, Math.round(safeSteps / AVG_STEPS_PER_MINUTE));
}

/** Daily-goal-completion bucket — same 5-value axis as branding.types.ts's
 * DailyGoalBucket, computed here from the raw steps/goal ratio. */
export function computeDailyGoalBucket(todaySteps: number, dailyStepGoal: number): string {
  const pct = dailyStepGoal > 0 ? (todaySteps / dailyStepGoal) * 100 : 0;
  if (pct > 100) return 'over';
  if (pct >= 100) return 'hit';
  if (pct >= 70) return 'close';
  if (pct >= 25) return 'mid';
  return 'start';
}

/** Coarse time-of-day bucket for the measurement layer — this scheduler
 * runs at a fixed 18:00, so this is 'evening' in practice, but computed
 * properly (not hardcoded) in case the cron ever changes. */
function timeOfDayIsrael(): string {
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const FEATURE_FLAGS_DOC = 'app_config/feature_flags';

/** Local Israel hour (0–23). */
function hourIsrael(): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours();
}

/** 'start' copy is morning-only (see header) — don't use it from noon on. */
export function isMorningOnlyBucketAtThisHour(bucket: string, hour: number): boolean {
  return bucket === 'start' && hour >= 12;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Current date in Asia/Jerusalem as YYYY-MM-DD — matches the format
 * ingestHealthSamples.ts uses for dailyActivity/{uid}_{date} doc IDs. */
function todayDateStringIsrael(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export interface CandidateUser {
  uid: string;
  /** First name ('' when unknown). */
  name: string;
  audience: PushAudience;
  personaProfile: PersonaResolvableProfile;
  /** Raw users/{uid}.progression — resolved to `dailyStepGoal` by withResolvedGoals(). */
  progression: Record<string, unknown>;
  /** Filled in by withResolvedGoals() — 0 until then. */
  dailyStepGoal: number;
  currentStreak: number;
  /** Filled in after fetchTodaySteps() — 0 until then. */
  todaySteps: number;
}

/** Reads a raw users/{uid} doc snapshot into the shape this scheduler needs.
 * todaySteps is NOT set here (this fires before the steps fetch) — callers
 * must merge it in via fetchTodaySteps() before dispatching. */
function toCandidateUser(uid: string, data: Record<string, unknown>): CandidateUser {
  const progression = (data.progression ?? {}) as Record<string, unknown>;
  return {
    uid,
    name: firstNameFromUserData(data),
    audience: audienceFromUserData(data),
    personaProfile: {
      personas: Array.isArray(data.personas) ? (data.personas as { id?: string | null }[]) : null,
      lifestyle: (data.lifestyle ?? null) as PersonaResolvableProfile['lifestyle'],
    },
    progression,
    dailyStepGoal: 0,
    currentStreak:
      typeof progression.currentStreak === 'number' && progression.currentStreak >= 0
        ? progression.currentStreak
        : 0,
    todaySteps: 0,
  };
}

/** Fetch today's step count for a batch of uids. Returns uid -> steps
 * (missing doc = 0 steps, not an error — the day just hasn't synced yet). */
async function fetchTodaySteps(uids: string[], dateStr: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < uids.length; i += TOKEN_FETCH_BATCH) {
    const slice = uids.slice(i, i + TOKEN_FETCH_BATCH);
    const refs = slice.map((uid) => db.collection('dailyActivity').doc(`${uid}_${dateStr}`));
    const docs = await db.getAll(...refs);
    docs.forEach((d, idx) => {
      const steps = d.exists ? Number((d.data() as Record<string, unknown>)?.steps ?? 0) : 0;
      out.set(slice[idx], Number.isFinite(steps) ? steps : 0);
    });
  }
  return out;
}

/** Resolve each candidate's ONE step goal (see lib/resolveUserStepGoal). */
async function withResolvedGoals(users: CandidateUser[], dateStr: string): Promise<CandidateUser[]> {
  const out: CandidateUser[] = [];
  for (const u of users) {
    out.push({ ...u, dailyStepGoal: await resolveUserStepGoal(db, u.uid, u.progression, dateStr) });
  }
  return out;
}

/** @מרחק — same formatting the client-side tag used (meters under 1 km). */
function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} מטר` : `${(meters / 1000).toFixed(1)} ק"מ`;
}

/** Push-library context for one user at one bucket. Exported for tests. */
export function stepGoalCopyContext(user: CandidateUser, bucket: string): PushCopyContext {
  const stepsLeft = Math.max(0, user.dailyStepGoal - user.todaySteps);
  return {
    uid: user.uid,
    audience: user.audience,
    conditions: { bucket },
    vars: {
      '@שם': user.name,
      '@צעדים_שנותרו': stepsLeft.toLocaleString('he-IL'),
      '@דקות': String(stepsToWalkMinutes(stepsLeft)),
      '@מרחק': formatDistance(stepsToDistanceMeters(stepsLeft)),
      // "0 ימים ברצף" / "1 ימים ברצף" read wrong — streak copy only from 2.
      '@רצף': user.currentStreak >= 2 ? String(user.currentStreak) : undefined,
    },
    // Carries the gap so the map side (behind IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED,
    // src/config/feature-flags.ts) can pre-build a route sized to it.
    params: { targetSteps: stepsLeft },
  };
}

async function dispatchToUser(
  user: CandidateUser,
): Promise<{ sent: boolean; reason?: string; bucket: string; morningOnly?: boolean }> {
  const persona = resolveCanonicalPersona(user.personaProfile);
  const bucket = computeDailyGoalBucket(user.todaySteps, user.dailyStepGoal);
  if (isMorningOnlyBucketAtThisHour(bucket, hourIsrael())) {
    return { sent: false, bucket, reason: 'morning-only bucket at an afternoon/evening run', morningOnly: true };
  }
  const copy = await resolvePushCopy('step_goal', stepGoalCopyContext(user, bucket));

  if (!copy) {
    return { sent: false, bucket, reason: `no content for persona=${persona} bucket=${bucket}` };
  }

  const result = await sendPush({
    toUids: [user.uid],
    channel: 'health_milestone',
    title: copy.title,
    body: copy.body,
    deepLink: copy.deepLink,
    data: { triggerType: 'DailyGoal', bundleId: copy.rowId, ...pushCopyData(copy) },
    rateCapHours: 24,
    measurement: {
      variantId: copy.rowId,
      category: TRIGGER_TYPE,
      persona,
      activityType: ACTIVITY_TYPE,
      timeOfDay: timeOfDayIsrael(),
      outcomeWindowHours: DEFAULT_OUTCOME_WINDOW_HOURS,
      pushType: copy.pushType,
      copyRowId: copy.rowId,
    },
  });

  logger.info(
    `[stepGoalNudge] uid=${user.uid} persona=${persona} bucket=${bucket} row=${copy.rowId} ` +
      `pushId=${result.pushId ?? '(none)'} delivered=${result.delivered} failed=${result.failed} ` +
      `skippedGlobalKill=${result.skippedGlobalKill} skippedPrefs=${result.skippedPrefs} ` +
      `skippedRateCap=${result.skippedRateCap}`,
  );

  return { sent: result.delivered > 0, bucket };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const stepGoalNudgeScheduler = onSchedule(
  {
    schedule: '0 18 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    let flagsData: Record<string, unknown> = {};
    try {
      const flagsSnap = await db.doc(FEATURE_FLAGS_DOC).get();
      flagsData = flagsSnap.exists ? (flagsSnap.data() as Record<string, unknown>) : {};
    } catch (err: any) {
      logger.error('[stepGoalNudge] feature_flags read failed, aborting run:', err?.message);
      return;
    }

    if (flagsData.stepGoalNudgeEnabled !== true) {
      logger.info('[stepGoalNudge] stepGoalNudgeEnabled !== true — skipping run.');
      return;
    }

    const testUids = Array.isArray(flagsData.stepGoalTestUids)
      ? (flagsData.stepGoalTestUids as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];
    const isTestMode = testUids.length > 0;

    logger.info(
      `[stepGoalNudge] run start — mode=${isTestMode ? `TEST(${testUids.length} uid(s))` : 'normal'} ` +
        `batchLimit=${BATCH_LIMIT}`,
    );

    const today = todayDateStringIsrael();
    let candidates: CandidateUser[] = [];

    if (isTestMode) {
      const refs = testUids.map((uid) => db.collection('users').doc(uid));
      const docs = await db.getAll(...refs);
      const baseCandidates = docs
        .filter((d) => d.exists)
        .map((d) => toCandidateUser(d.id, d.data() as Record<string, unknown>));
      // Test mode bypasses the eligibility filter but still needs a real
      // steps_left number for the copy, so fetch today's steps too.
      const stepsByUid = await fetchTodaySteps(baseCandidates.map((c) => c.uid), today);
      candidates = await withResolvedGoals(
        baseCandidates.map((c) => ({ ...c, todaySteps: stepsByUid.get(c.uid) ?? 0 })),
        today,
      );
      logger.info(`[stepGoalNudge] TEST mode — resolved ${candidates.length}/${testUids.length} uid(s)`);
    } else {
      let candidateDocs: admin.firestore.QueryDocumentSnapshot[];
      try {
        const snap = await db
          .collection('users')
          .where('onboardingStatus', '==', 'COMPLETED')
          .limit(BATCH_LIMIT)
          .get();
        candidateDocs = snap.docs;
      } catch (err: any) {
        logger.error('[stepGoalNudge] candidate query failed:', err?.message);
        return;
      }

      const rawCandidates = candidateDocs.map((d) => toCandidateUser(d.id, d.data() as Record<string, unknown>));
      const stepsByUid = await fetchTodaySteps(rawCandidates.map((c) => c.uid), today);
      // No below-goal pre-filter: bucket-based selection (dispatchToUser)
      // naturally skips hit/over-bucket users when no content matches —
      // Wave 1 only seeds start/mid/close copy, so this is currently
      // equivalent in practice, but stays correct once celebration content
      // for hit/over is seeded later.
      candidates = await withResolvedGoals(
        rawCandidates.map((c) => ({ ...c, todaySteps: stepsByUid.get(c.uid) ?? 0 })),
        today,
      );
      logger.info(
        `[stepGoalNudge] normal mode — ${candidateDocs.length} candidate(s) resolved for ${today}`,
      );
    }

    if (candidates.length === 0) {
      logger.info('[stepGoalNudge] nothing to send — exiting cleanly.');
      return;
    }

    let sent = 0;
    // Split by bucket: 'no content' for a below-goal user is a real content
    // gap worth noticing; 'no content' for a hit/over user is EXPECTED this
    // wave (no celebration copy seeded yet) — collapsing both into one
    // counter would bury a real gap under the normal daily hit/over cohort.
    let skippedBelowGoalNoContent = 0;
    let skippedAtOrOverGoalNoContent = 0;
    let skippedMorningOnlyBucket = 0;
    let errors = 0;

    for (const user of candidates) {
      try {
        const outcome = await dispatchToUser(user);
        if (outcome.sent) {
          sent += 1;
        } else if (outcome.morningOnly) {
          skippedMorningOnlyBucket += 1;
        } else if (outcome.reason) {
          if (outcome.bucket === 'hit' || outcome.bucket === 'over') {
            skippedAtOrOverGoalNoContent += 1;
          } else {
            skippedBelowGoalNoContent += 1;
          }
        }
      } catch (err: any) {
        errors += 1;
        logger.warn(`[stepGoalNudge] dispatch failed for uid=${user.uid}:`, err?.message);
      }
    }

    logger.info(
      `[stepGoalNudge] run complete — candidates=${candidates.length} sent=${sent} ` +
        `skippedBelowGoalNoContent=${skippedBelowGoalNoContent} ` +
        `skippedAtOrOverGoalNoContent=${skippedAtOrOverGoalNoContent} (expected — no hit/over copy seeded yet) ` +
        `skippedMorningOnlyBucket=${skippedMorningOnlyBucket} ` +
        `errors=${errors}`,
    );
  },
);
