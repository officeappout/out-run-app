/**
 * retentionScheduler — Scheduled Cloud Function (v2 scheduler).
 *
 * PURPOSE
 * ───────
 * Re-engage users who completed onboarding but have stopped working out.
 * This complements onboardingDropoffDispatcher (which targets users who never
 * finished onboarding). Together the two functions cover the full lifecycle:
 *
 *   onboardingDropoffDispatcher  →  ghost users (onboardingStatus IN_PROGRESS)
 *   retentionScheduler           →  churning users (onboardingStatus COMPLETED,
 *                                   but no workout in INACTIVITY_THRESHOLD_DAYS)
 *
 * DETECTION (18.10.2026: real activity, not users.lastActive alone)
 * ─────────────────────────────────────────────────────────────────
 * users.lastActive is written only at signup and the onboarding sync, so on
 * its own it made every user onboarded > 7 days ago "inactive" — they got
 * this push every 48h even if they trained yesterday. Now a user is a
 * retention candidate when ALL are true:
 *   1. onboardingStatus === 'COMPLETED'
 *   2. their REAL last activity (lib/user-activity.ts: latest of lastActive,
 *      progression.lastActiveDate, running.lastWorkoutDate, the last native
 *      app open fcmTokenMeta.*.lastSeenAt, and the latest workouts doc) is
 *      at least the threshold days ago (7; 4 under the milestone cadence).
 *      If the workouts lookup fails the user is skipped (fail safe).
 *      Flag app_config/feature_flags.retentionRealActivityGuard, DEFAULT ON
 *      (only an explicit false restores the old lastActive-only check).
 *   3. settings.pushEnabled !== false
 *   4. settings.notificationPrefs.retention !== false (or absent — opt-out model)
 *   5. push_rate/{uid}.retention_lastSentAt older than the rate cap
 *      (enforced by push.service.ts, not duplicated here)
 *
 * CADENCE (flag retentionMilestoneCadence, DEFAULT OFF)
 * ─────────────────────────────────────────────────────
 * Off: the old cadence — every 48h while away >= 7 days, no stop.
 * On (owner-approved): one push per milestone per absence, then silence:
 *   d4 (days 4–6), d7 (7–13, "new week"), d14 (14–29), d30 (30–35, last).
 *   Nothing after day 35 until they train or open the app again. The sent
 *   milestones live on push_rate/{uid} (retention_absenceAnchor = the last
 *   activity the absence is measured from, retention_milestonesSent), so a
 *   new activity starts a fresh log. The milestone is passed to the push
 *   library as conditions.milestone, so rows can be written per milestone.
 *
 * QUERY (collectRetentionCandidates)
 * ─────
 * Pass 1: where(onboardingStatus == COMPLETED) + where(lastActive <= cutoff),
 * orderBy(lastActive desc) — cursor-paginated in pages of
 * RETENTION_BATCH_LIMIT, at most RETENTION_MAX_PAGES pages per run.
 * Composite index: onboardingStatus ASC + lastActive DESC (unchanged).
 * Pass 2 (guard on, 19.10.2026): COMPLETED users by document id whose
 * lastActive is not a real Timestamp (missing, or the serialized
 * { _methodName: 'serverTimestamp' } map — 452/802 users), which pass 1 can
 * never match. Same page bounds; no composite index needed. Users with no doc
 * signal at all are provisional: the workouts lookup decides.
 * Every row is then checked against real activity before sending. The
 * workouts lookup uses the existing userId ASC + date DESC index and runs
 * only for users whose doc signals alone say they're away (or have none).
 *
 * MESSAGE
 * ───────
 * One sendPush() per user, with that user's own name. No day count in the
 * copy any more (@ימים is no longer filled, so a library row that still uses
 * it doesn't render and is skipped).
 *
 * SCHEDULE
 * ────────
 * Runs daily at 10:00 Asia/Jerusalem. Quiet hours are NOT bypassed (10:00 is
 * an active window anyway — one uniform policy). On Shabbat/yom tov (opt-in
 * since 18.10.2026) only Shabbat observers (settings.shabbatObserver === true)
 * are skipped — in toRetentionCandidate(), from the doc already in memory;
 * sendPush() would drop them anyway. Everyone else runs as on any day.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   RETENTION_INACTIVITY_DAYS  — days of inactivity before user is eligible (default 7)
 *   RETENTION_BATCH_LIMIT      — page size of the candidate query (default 200)
 *   RETENTION_MAX_PAGES        — max pages per run (default 10 → 2000 users)
 *   RETENTION_TEST_MODE        — if 'true', logs intent but skips FCM + Firestore writes
 *
 * COPY
 * ────
 * From the push library (push-copy.service.ts, pushType 'retention_lapse'):
 * the recipient's own first name (@שם), their audience and (cadence on) the
 * milestone for targeted rows, rotated per user per day. Copy that needs a value the
 * user doesn't have (e.g. no name) is skipped for that user, never sent with
 * a hole in it.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { isShabbatObserver, isShabbatOrYomTov } from './services/shabbat.service';
import {
  resolvePushCopy,
  pushCopyData,
  audienceFromUserData,
  firstNameFromUserData,
} from './services/push-copy.service';
import type { PushAudience, PushCopyContext } from './shared/push-library.core';
import {
  MS_PER_DAY,
  RETENTION_FIRST_DAY,
  activityFlagsFrom,
  activityToMillis,
  daysAwayBetween,
  isQueryableTimestamp,
  lastActivityFromUserData,
  nextRetentionMilestone,
  recordRetentionMilestone,
  resolveLastActivityMs,
  retentionSentLogFrom,
  type ActivityFlags,
  type RetentionMilestone,
} from './lib/user-activity';
import { isDemoUid } from './lib/demo';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Config ───────────────────────────────────────────────────────────────────

const INACTIVITY_DAYS = (() => {
  const raw = Number(process.env.RETENTION_INACTIVITY_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
})();

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.RETENTION_BATCH_LIMIT);
  return Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : 200;
})();

const MAX_PAGES = (() => {
  const raw = Number(process.env.RETENTION_MAX_PAGES);
  return Number.isFinite(raw) && raw > 0 && raw <= 50 ? raw : 10;
})();

/** Parallel per-user sendPush() calls (each is a handful of reads + one FCM call). */
const SEND_CONCURRENCY = 10;

const TEST_MODE = process.env.RETENTION_TEST_MODE === 'true';

export interface RetentionCandidate {
  uid: string;
  /** First name ('' when unknown). */
  name: string;
  /** Days away (Israel calendar days since the last activity known so far). */
  daysSince: number;
  /** The last activity daysSince is measured from (millis). */
  lastActivityMs?: number;
  audience?: PushAudience;
}

/**
 * The push-library context for ONE user — their own name, and (cadence on)
 * the milestone as conditions.milestone. No day count: @ימים is not filled
 * any more, so copy that needs it never renders. Exported for tests.
 */
export function retentionCopyContext(
  c: RetentionCandidate,
  now: Date = new Date(),
  milestone: RetentionMilestone | null = null,
): PushCopyContext {
  return {
    uid: c.uid,
    now,
    audience: c.audience ?? {},
    vars: { '@שם': c.name.trim() },
    ...(milestone ? { conditions: { milestone } } : {}),
  };
}

/** Days-away threshold for the run: 7 (env override), or 4 under the milestone cadence. */
export function retentionThresholdDays(flags: ActivityFlags): number {
  return flags.milestoneCadence ? RETENTION_FIRST_DAY : INACTIVITY_DAYS;
}

/**
 * Inactivity candidate from a users/{uid} doc, or null when the user should
 * be skipped (push/retention opted out, no usable activity signal, active
 * more recently than `thresholdDays`, or a Shabbat observer while
 * `inShabbatWindow`). With `useAllSignals` (the real-activity guard, default
 * on) the doc's every activity signal counts, not just lastActive; the
 * scheduler still checks the workouts collection before sending.
 * Exported for tests.
 */
export function toRetentionCandidate(
  uid: string,
  data: Record<string, unknown>,
  nowMs: number = Date.now(),
  inShabbatWindow: boolean = false,
  opts: { thresholdDays?: number; useAllSignals?: boolean; allowUnknownDocActivity?: boolean } = {},
): RetentionCandidate | null {
  const thresholdDays = opts.thresholdDays ?? INACTIVITY_DAYS;
  const useAllSignals = opts.useAllSignals !== false;
  const settings = data?.settings as Record<string, unknown> | undefined;
  if (settings?.pushEnabled === false) return null;
  if (inShabbatWindow && isShabbatObserver(settings)) return null;
  const prefs = settings?.notificationPrefs as Record<string, unknown> | undefined;
  if (prefs?.retention === false) return null;

  // No activity signal at all → skip (never treated as "inactive forever"),
  // unless the caller will resolve it from the workouts collection first
  // (allowUnknownDocActivity — the broken-lastActive pass, guard on only):
  // then a PROVISIONAL candidate (no lastActivityMs) that confirmRealInactivity
  // must confirm before anything is sent.
  const lastMs = useAllSignals ? lastActivityFromUserData(data) : activityToMillis(data?.lastActive);
  if (lastMs === null) {
    if (!(useAllSignals && opts.allowUnknownDocActivity)) return null;
    return {
      uid,
      name: firstNameFromUserData(data),
      daysSince: thresholdDays,
      audience: audienceFromUserData(data, new Date(nowMs)),
    };
  }
  const daysSince = useAllSignals
    ? daysAwayBetween(lastMs, nowMs)
    : Math.floor((nowMs - lastMs) / MS_PER_DAY); // legacy (guard off), unchanged
  if (daysSince < thresholdDays) return null;

  return {
    uid,
    name: firstNameFromUserData(data),
    daysSince,
    lastActivityMs: lastMs,
    audience: audienceFromUserData(data, new Date(nowMs)),
  };
}

/**
 * Re-checks a doc-level candidate against the workouts collection. Returns
 * the candidate with the REAL days away, or null when they're actually
 * active (below the threshold). Throws if the lookup fails. Exported for tests.
 */
export async function confirmRealInactivity(
  firestore: admin.firestore.Firestore,
  c: RetentionCandidate,
  data: Record<string, unknown>,
  nowMs: number,
  thresholdDays: number,
): Promise<RetentionCandidate | null> {
  const lastMs = await resolveLastActivityMs(firestore, c.uid, data, nowMs, thresholdDays);
  if (lastMs === null) return null;
  const daysSince = daysAwayBetween(lastMs, nowMs);
  if (daysSince < thresholdDays) return null;
  return { ...c, daysSince, lastActivityMs: lastMs };
}

// ─── Candidate selection ──────────────────────────────────────────────────────

export interface CollectRetentionOpts {
  nowMs: number;
  thresholdDays: number;
  inShabbatWindow: boolean;
  /** The real-activity guard (flag retentionRealActivityGuard). */
  useAllSignals: boolean;
  batchLimit: number;
  maxPages: number;
  /** A page failed after some pages were read: called, and the pages already read are kept. */
  onPageError?: (err: unknown) => void;
}

/**
 * Two bounded passes over COMPLETED users (19.10.2026):
 *
 *  1. where(lastActive <= cutoff) orderBy(lastActive desc) — users whose
 *     lastActive is a real Timestamp. Composite index onboardingStatus ASC +
 *     lastActive DESC.
 *  2. Guard on only: COMPLETED users ordered by document id, keeping those whose
 *     lastActive is NOT a queryable Timestamp (missing, or the serialized
 *     { _methodName: 'serverTimestamp' } map the old onboarding sanitizer
 *     wrote for 452/802 users). Pass 1 can never match them, so before this
 *     retention reached ~10 users. They're judged on every other doc signal;
 *     with none at all they become provisional candidates that
 *     confirmRealInactivity resolves from the workouts collection before
 *     anything is sent (no workout either → skipped, never "away forever").
 *     Equality + documentId order needs no composite index.
 *
 * Each pass reads at most maxPages × batchLimit docs. Exported for tests.
 */
export async function collectRetentionCandidates(
  firestore: admin.firestore.Firestore,
  o: CollectRetentionOpts,
): Promise<{
  candidates: Array<{ c: RetentionCandidate; data: Record<string, unknown> }>;
  fetched: number;
  fetchedUntimed: number;
}> {
  const cutoff = admin.firestore.Timestamp.fromMillis(o.nowMs - o.thresholdDays * MS_PER_DAY);
  const candidates: Array<{ c: RetentionCandidate; data: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  let fetched = 0;
  let fetchedUntimed = 0;

  const consider = (id: string, data: Record<string, unknown>, allowUnknownDocActivity: boolean) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (isDemoUid(id)) return; // demo world guard — simulated users are never re-engaged
    const c = toRetentionCandidate(id, data, o.nowMs, o.inShabbatWindow, {
      thresholdDays: o.thresholdDays,
      useAllSignals: o.useAllSignals,
      allowUnknownDocActivity,
    });
    if (c) candidates.push({ c, data });
  };

  // Pass 1 — Timestamp lastActive <= cutoff.
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  try {
    for (let page = 0; page < o.maxPages; page++) {
      let q = firestore
        .collection('users')
        .where('onboardingStatus', '==', 'COMPLETED')
        .where('lastActive', '<=', cutoff)
        .orderBy('lastActive', 'desc')
        .limit(o.batchLimit);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      fetched += snap.docs.length;
      for (const doc of snap.docs) consider(doc.id, doc.data() as Record<string, unknown>, false);
      if (snap.docs.length < o.batchLimit) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  } catch (err: unknown) {
    if (candidates.length === 0) throw err;
    o.onPageError?.(err);
  }

  // Pass 2 — no queryable lastActive (guard on only; the legacy path is unchanged).
  if (o.useAllSignals) {
    let lastId: string | null = null;
    try {
      for (let page = 0; page < o.maxPages; page++) {
        let q = firestore
          .collection('users')
          .where('onboardingStatus', '==', 'COMPLETED')
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(o.batchLimit);
        if (lastId) q = q.startAfter(lastId);
        const snap = await q.get();
        for (const doc of snap.docs) {
          const data = doc.data() as Record<string, unknown>;
          if (isQueryableTimestamp(data?.lastActive)) continue; // pass 1's job (or recently active)
          fetchedUntimed++;
          consider(doc.id, data, true);
        }
        if (snap.docs.length < o.batchLimit) break;
        lastId = snap.docs[snap.docs.length - 1].id;
      }
    } catch (err: unknown) {
      o.onPageError?.(err);
    }
  }

  return { candidates, fetched, fetchedUntimed };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const retentionScheduler = onSchedule(
  {
    schedule: '0 10 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    // Flags — a read failure keeps the defaults (guard ON, cadence OFF).
    let flags = activityFlagsFrom(undefined);
    try {
      const snap = await db.doc('app_config/feature_flags').get();
      flags = activityFlagsFrom(snap.data() as Record<string, unknown> | undefined);
    } catch (err: unknown) {
      logger.warn('[retention] feature_flags read failed, using defaults (guard on, cadence off)', err);
    }
    const thresholdDays = retentionThresholdDays(flags);

    logger.info(
      `[retention] Starting run — thresholdDays=${thresholdDays} guard=${flags.realActivityGuard} ` +
        `cadence=${flags.milestoneCadence} batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`,
    );

    // Shabbat/yom tov: observers only — filtered per user below.
    const inShabbatWindow = isShabbatOrYomTov();

    const nowMs = Date.now();

    let candidates: Array<{ c: RetentionCandidate; data: Record<string, unknown> }> = [];
    let fetched = 0;
    let fetchedUntimed = 0;
    try {
      ({ candidates, fetched, fetchedUntimed } = await collectRetentionCandidates(db, {
        nowMs,
        thresholdDays,
        inShabbatWindow,
        useAllSignals: flags.realActivityGuard,
        batchLimit: BATCH_LIMIT,
        maxPages: MAX_PAGES,
        onPageError: (err) => logger.error('[retention] Firestore query failed', err),
      }));
    } catch (err: unknown) {
      logger.error('[retention] Firestore query failed', err);
      return;
    }

    logger.info(
      `[retention] ${fetched} COMPLETED user(s) with old lastActive + ${fetchedUntimed} with no usable ` +
        `lastActive fetched, ${candidates.length} candidate(s) after doc-level activity + pref filter`,
    );

    if (candidates.length === 0) return;

    let totalDelivered = 0;
    let totalSkipped = 0;
    let activeAfterCheck = 0;
    let lookupFailed = 0;
    let noMilestone = 0;
    let noSignal = 0;

    const sendOne = async ({ c: docCandidate, data }: { c: RetentionCandidate; data: Record<string, unknown> }): Promise<void> => {
      try {
        // 1. Real activity (workouts collection) — skip when actually active.
        let c: RetentionCandidate | null = docCandidate;
        if (flags.realActivityGuard) {
          try {
            c = await confirmRealInactivity(db, docCandidate, data, nowMs, thresholdDays);
          } catch (err: unknown) {
            lookupFailed++;
            logger.warn(`[retention] workouts lookup failed for uid=${docCandidate.uid}, skipping (fail safe)`, err);
            return;
          }
          if (!c) {
            if (docCandidate.lastActivityMs === undefined) noSignal++;
            else activeAfterCheck++;
            return;
          }
        }

        // 2. Milestone cadence — one push per milestone per absence.
        let milestone: RetentionMilestone | null = null;
        let rateData: Record<string, unknown> | undefined;
        const anchor = c.lastActivityMs ?? 0;
        if (flags.milestoneCadence) {
          const rateSnap = await db.collection('push_rate').doc(c.uid).get();
          rateData = rateSnap.exists ? (rateSnap.data() as Record<string, unknown>) : undefined;
          milestone = nextRetentionMilestone(c.daysSince, anchor, retentionSentLogFrom(rateData));
          if (!milestone) {
            noMilestone++;
            return;
          }
        }

        if (TEST_MODE) {
          logger.warn(
            `[retention] TEST_MODE — would push uid=${c.uid} name="${c.name}" ` +
              `daysAway=${c.daysSince} milestone=${milestone ?? '-'}`,
          );
          return;
        }

        const copy = await resolvePushCopy('retention_lapse', retentionCopyContext(c, new Date(nowMs), milestone));
        if (!copy) return;
        const result = await sendPush({
          toUids: [c.uid],
          channel: 'retention',
          title: copy.title,
          body: copy.body,
          deepLink: copy.deepLink,
          data: {
            triggerType: 'Inactivity',
            daysSince: String(c.daysSince),
            ...(milestone ? { milestone } : {}),
            ...pushCopyData(copy),
          },
          // The cadence's sent log already stops repeats; the cap only spaces
          // milestones a day apart. Without the cadence: the old 48h.
          rateCapHours: flags.milestoneCadence ? 24 : 48,
        });
        totalDelivered += result.delivered;
        totalSkipped +=
          result.skippedRateCap + result.skippedPrefs + result.skippedDailyCap +
          result.skippedQuietHours + result.skippedShabbat + result.skippedGlobalKill;

        // 3. Record the milestone only once it actually went out — a skipped
        // one (caps, Shabbat) is retried the next day inside its window.
        if (milestone && result.delivered > 0) {
          const next = recordRetentionMilestone(anchor, retentionSentLogFrom(rateData), milestone);
          await db.collection('push_rate').doc(c.uid).set(
            { retention_absenceAnchor: next.anchor, retention_milestonesSent: next.sent },
            { merge: true },
          );
        }
      } catch (err: unknown) {
        logger.error(`[retention] sendPush failed for uid=${docCandidate.uid}`, err);
      }
    };

    for (let i = 0; i < candidates.length; i += SEND_CONCURRENCY) {
      await Promise.all(candidates.slice(i, i + SEND_CONCURRENCY).map(sendOne));
    }

    logger.info(
      `[retention] Run complete — candidates=${candidates.length} activeAfterWorkoutCheck=${activeAfterCheck} ` +
        `noActivitySignal=${noSignal} lookupFailed=${lookupFailed} noMilestoneDue=${noMilestone} delivered=${totalDelivered} skipped=${totalSkipped}`,
    );
  },
);
