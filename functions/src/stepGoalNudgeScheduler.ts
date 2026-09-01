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
 *   2. A matching message exists in the content library for the user's
 *      resolved persona + the bucket they're actually in right now
 *      (triggerType='Daily_Goal', activityType='walking', dailyGoalBucket=
 *      computed from `dailyActivity/{uid}_{today}.steps` /
 *      `users/{uid}.progression.dailyStepGoal` — see `computeDailyGoalBucket`)
 *      — if none, the user is silently skipped, not an error. Wave 1 only
 *      seeds start/mid/close copy, so hit/over-bucket users are skipped in
 *      practice today (no celebration content yet), not specially excluded.
 *      `dailyStepGoal` defaults to 3000 when absent (matches
 *      `src/features/user/identity/services/profile.service.ts:66`'s
 *      client-side default for a fresh account); `steps` defaults to 0
 *      when the day's activity doc doesn't exist yet.
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
 * 18:00 Asia/Jerusalem daily — sits inside active hours, `skipQuietHours:
 * true` matches every other scheduled job's own reasoning.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import {
  selectNotificationContent,
  personaliseNotificationText,
  resolveCanonicalPersona,
} from './services/notification-content.service';
import { DEFAULT_OUTCOME_WINDOW_HOURS } from './services/push-events.service';
import type { PersonaResolvableProfile } from './services/persona-alias-map.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Configuration ────────────────────────────────────────────────────────────

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.STEP_GOAL_BATCH_LIMIT);
  return Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : 300;
})();

const DEFAULT_DAILY_STEP_GOAL = 3000; // matches profile.service.ts:66's fresh-account default

const TRIGGER_TYPE = 'Daily_Goal';
const ACTIVITY_TYPE = 'walking';
const PUSH_TITLE = '💪 יעד הצעדים היומי';
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
function computeDailyGoalBucket(todaySteps: number, dailyStepGoal: number): string {
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

interface CandidateUser {
  uid: string;
  name: string;
  personaProfile: PersonaResolvableProfile;
  dailyStepGoal: number;
  currentStreak: number;
  /** Filled in after fetchTodaySteps() — 0 until then. */
  todaySteps: number;
}

/** Reads a raw users/{uid} doc snapshot into the shape this scheduler needs.
 * todaySteps is NOT set here (this fires before the steps fetch) — callers
 * must merge it in via fetchTodaySteps() before dispatching. */
function toCandidateUser(uid: string, data: Record<string, unknown>): CandidateUser {
  const core = (data.core ?? {}) as Record<string, unknown>;
  const progression = (data.progression ?? {}) as Record<string, unknown>;
  return {
    uid,
    name: typeof core.name === 'string' ? core.name : '',
    personaProfile: {
      personas: Array.isArray(data.personas) ? (data.personas as { id?: string | null }[]) : null,
      lifestyle: (data.lifestyle ?? null) as PersonaResolvableProfile['lifestyle'],
    },
    dailyStepGoal:
      typeof progression.dailyStepGoal === 'number' && progression.dailyStepGoal > 0
        ? progression.dailyStepGoal
        : DEFAULT_DAILY_STEP_GOAL,
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

async function dispatchToUser(
  user: CandidateUser,
): Promise<{ sent: boolean; reason?: string; bucket: string }> {
  const persona = resolveCanonicalPersona(user.personaProfile);
  const bucket = computeDailyGoalBucket(user.todaySteps, user.dailyStepGoal);
  const selected = await selectNotificationContent({
    triggerType: TRIGGER_TYPE,
    activityType: ACTIVITY_TYPE,
    dailyGoalBucket: bucket,
    persona,
    uid: user.uid,
  });

  if (!selected) {
    return { sent: false, bucket, reason: `no content for persona=${persona} bucket=${bucket}` };
  }

  const stepsLeft = Math.max(0, user.dailyStepGoal - user.todaySteps);
  const distanceMeters = stepsToDistanceMeters(stepsLeft);
  const walkMinutes = stepsToWalkMinutes(stepsLeft);
  const body = personaliseNotificationText(selected.text, {
    name: user.name,
    stepsLeft,
    distanceMeters,
    walkMinutes,
    streakDays: user.currentStreak,
    steps_left: String(stepsLeft), // legacy {steps_left} form, kept for any older seeded copy
  });

  // Carries the gap so the map side (behind IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED,
  // src/config/feature-flags.ts) can pre-build a route sized to it instead of
  // landing on the empty config drawer. Raw gap only for this test — no
  // time-of-day chunking yet, that's a later design decision.
  const deepLink = `/map?openRun=walking&targetSteps=${stepsLeft}`;

  const result = await sendPush({
    toUids: [user.uid],
    channel: 'health_milestone',
    title: PUSH_TITLE,
    body,
    deepLink,
    data: { triggerType: 'DailyGoal', bundleId: selected.bundleId },
    rateCapHours: 24,
    skipQuietHours: true,
    measurement: {
      variantId: selected.bundleId,
      category: TRIGGER_TYPE,
      persona,
      activityType: ACTIVITY_TYPE,
      framing: selected.psychologicalTrigger,
      timeOfDay: timeOfDayIsrael(),
      outcomeWindowHours: DEFAULT_OUTCOME_WINDOW_HOURS,
    },
  });

  logger.info(
    `[stepGoalNudge] uid=${user.uid} persona=${persona} bucket=${bucket} bundleId=${selected.bundleId} ` +
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
      candidates = baseCandidates.map((c) => ({ ...c, todaySteps: stepsByUid.get(c.uid) ?? 0 }));
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
      candidates = rawCandidates.map((c) => ({ ...c, todaySteps: stepsByUid.get(c.uid) ?? 0 }));
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
    let errors = 0;

    for (const user of candidates) {
      try {
        const outcome = await dispatchToUser(user);
        if (outcome.sent) {
          sent += 1;
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
        `errors=${errors}`,
    );
  },
);
