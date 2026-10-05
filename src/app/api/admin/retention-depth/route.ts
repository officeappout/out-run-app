/**
 * GET /api/admin/retention-depth
 *
 * Journey Hub Wave 3 (05.10.2026, approved wave plan) — the 3 "defer-
 * until-scale" Tab 3 design elements: cohort retention curve (day 0/1/
 * 3/7/14/30, one line per signup cohort), D7 retention, and resurrected/
 * reactivated users. Confirmed missing everywhere else in the codebase
 * (growth-analytics-plan.md's gap audit; `NorthStarRow.tsx`'s own
 * comment explicitly refuses to stub these as fake data).
 *
 * Same server-scoped pattern as growth-metrics/statistics-summary
 * (`resolveAdminAnalyticsScope`) — a new route rather than cramming a
 * 3rd concern into growth-metrics, since all 3 metrics here share ONE
 * expensive ingredient growth-metrics doesn't need: workout history
 * going back up to `LOOKBACK_DAYS` (180), not just the 30-day trend
 * window. Keeping that read in its own route means growth-metrics'
 * existing 30-day query stays untouched.
 *
 * Explicitly NOT filtered by the Wave 2 segmentation row (program/
 * level/sex/age/date/campaign/source/city) — the approved wave plan
 * asked for segmentation on "every EXISTING graph," and these 3 are
 * new structures, not existing ones. Out of scope for this wave by
 * design, not an oversight.
 *
 * The core discipline (David's explicit Wave 3 instruction): build the
 * REAL chart/card shape wired to a REAL query, gated behind a minimum-
 * sample-size threshold, with an explicit "not enough data yet" empty
 * state in place of noisy small-N numbers — never a fake/stubbed
 * value. Once real counts cross the threshold, it auto-populates; no
 * manual flip. `MIN_SAMPLE_SIZE` is deliberately well above the ~20
 * users the approved plan flagged as already-too-noisy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'הנתונים כאן משקפים את כל הפלטפורמה — לא רלוונטי לתפקיד שלך. לנתוני העיר שלך, ראה את לוח הבקרה שלך.';

/**
 * How far back the one `workouts` range query reaches. Needs to cover
 * D30 cohort curves (30 days) + the resurrection definition's "had a
 * real workout before going dormant" check — which has no true upper
 * bound (a user could have been established arbitrarily long ago).
 * 180 days is a pragmatic, bounded choice for the app's current real
 * lifetime, not a theoretical guarantee: a user established MORE than
 * 180 days before reactivating would be undercounted (treated as
 * ineligible rather than resurrected) — an acceptable, documented
 * Wave-3 scoping limit, not a silent gap.
 */
const LOOKBACK_DAYS = 180;
/** Cohort retention curve day-offsets, per the design spec. */
const RETENTION_DAY_OFFSETS = [0, 1, 3, 7, 14, 30] as const;
/** +/- tolerance (days) when checking "active on day N after signup" — smooths exact-calendar-day noise without widening the window so much it stops meaning "day N." */
const DAY_OFFSET_TOLERANCE = 1;
/** Below this, a cohort/aggregate renders the empty state instead of a real number — well above the ~20-user case already flagged as too noisy. */
const MIN_SAMPLE_SIZE = 50;
/** Cohorts are grouped by signup week; this many trailing weeks are considered (bounded, not unbounded history). */
const COHORT_WEEKS = 12;
/** The "reactivation" window — did they come back in the last N days? */
const REACTIVATION_WINDOW_DAYS = 30;
/** The "dormant gap" window immediately before reactivation — must be EMPTY for a real resurrection, not just ongoing activity. */
const DORMANT_GAP_DAYS = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') return (v as { toDate: () => Date }).toDate();
  return null;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/** Monday-anchored start of the week containing `d`, at midnight. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  out.setDate(out.getDate() - diffToMonday);
  return out;
}

export interface CohortRetentionEntry {
  cohortLabel: string;
  cohortWeekStart: string;
  cohortSize: number;
  /** null = not enough elapsed time yet to know this day-offset for this cohort (e.g. a 10-day-old cohort has no day-30 answer). Distinct from a real 0%. */
  retentionByDay: Record<string, number | null>;
}

export interface RetentionDepthResponse {
  scope: 'platform' | 'vertical';
  vertical?: string;
  minSampleSize: number;
  cohortRetention: {
    cohorts: CohortRetentionEntry[];
    dayOffsets: readonly number[];
  };
  d7Retention: {
    pct: number | null;
    sampleSize: number;
    thresholdMet: boolean;
  };
  resurrectedUsers: {
    count: number;
    eligiblePopulation: number;
    thresholdMet: boolean;
  };
}

export async function computeRetentionDepth(db: FirebaseFirestore.Firestore, scope: AdminAnalyticsScope) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  }
  if (scope.kind === 'authority') {
    return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };
  }

  const authorityIds: string[] | null = scope.kind === 'platform' ? null : scope.authorityIds;

  // ── Users (scoped when vertical, real accounts only) — same pattern growth-metrics/statistics-summary already use ──
  const userDocs =
    authorityIds === null
      ? (await db.collection('users').get()).docs
      : authorityIds.length === 0
        ? []
        : (await Promise.all(chunk(authorityIds, 30).map((b) => db.collection('users').where('core.authorityId', 'in', b).get()))).flatMap((s) => s.docs);
  const realUserDocs = userDocs.filter((d) => !isTestOrMockUser(d.data()?.core as Record<string, unknown> | undefined));
  const realUserIds = new Set(realUserDocs.map((d) => d.id));
  const createdAtByUser = new Map<string, Date>();
  realUserDocs.forEach((d) => {
    const createdAt = toDateSafe(d.data()?.createdAt);
    if (createdAt) createdAtByUser.set(d.id, createdAt);
  });

  // ── One extended workouts range query (LOOKBACK_DAYS back, not just
  //    the 30-day trend window growth-metrics uses) — every metric
  //    below needs this same longer history, so it's read once here. ──
  const now = new Date();
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);
  lookbackStart.setHours(0, 0, 0, 0);

  let relevantWorkoutDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  try {
    const workoutsSnap = await db.collection('workouts').where('date', '>=', lookbackStart).get();
    relevantWorkoutDocs = workoutsSnap.docs.filter((d) => {
      const uid = d.data()?.userId;
      return typeof uid === 'string' && realUserIds.has(uid);
    });
  } catch (err) {
    console.error('[/api/admin/retention-depth] workouts range query failed:', err);
    relevantWorkoutDocs = [];
  }

  // Per-user sorted workout dates — every metric below is a question
  // of "did this user work out on/near some specific day."
  const workoutDatesByUser = new Map<string, Date[]>();
  relevantWorkoutDocs.forEach((d) => {
    const data = d.data();
    const uid = data?.userId;
    const date = toDateSafe(data?.date);
    if (typeof uid !== 'string' || !date) return;
    const arr = workoutDatesByUser.get(uid) ?? [];
    arr.push(date);
    workoutDatesByUser.set(uid, arr);
  });
  workoutDatesByUser.forEach((arr) => arr.sort((a, b) => a.getTime() - b.getTime()));

  function wasActiveNearDayOffset(uid: string, signupDate: Date, dayOffset: number): boolean {
    const dates = workoutDatesByUser.get(uid);
    if (!dates || dates.length === 0) return false;
    const targetStart = new Date(signupDate);
    targetStart.setDate(targetStart.getDate() + dayOffset - DAY_OFFSET_TOLERANCE);
    const targetEnd = new Date(signupDate);
    targetEnd.setDate(targetEnd.getDate() + dayOffset + DAY_OFFSET_TOLERANCE);
    return dates.some((d) => d >= targetStart && d <= targetEnd);
  }

  // ── Cohort retention curve — weekly signup cohorts, last COHORT_WEEKS ──
  const cohortWeekKeys: string[] = [];
  for (let i = 0; i < COHORT_WEEKS; i++) {
    const weekStart = startOfWeek(new Date(now));
    weekStart.setDate(weekStart.getDate() - i * 7);
    cohortWeekKeys.push(weekStart.toISOString().split('T')[0]);
  }
  const usersByCohortWeek = new Map<string, string[]>();
  createdAtByUser.forEach((createdAt, uid) => {
    const weekKey = startOfWeek(createdAt).toISOString().split('T')[0];
    if (!cohortWeekKeys.includes(weekKey)) return;
    const arr = usersByCohortWeek.get(weekKey) ?? [];
    arr.push(uid);
    usersByCohortWeek.set(weekKey, arr);
  });

  const cohorts: CohortRetentionEntry[] = cohortWeekKeys
    .filter((weekKey) => (usersByCohortWeek.get(weekKey)?.length ?? 0) > 0)
    .map((weekKey) => {
      const userIds = usersByCohortWeek.get(weekKey) ?? [];
      const cohortWeekStart = new Date(weekKey);
      const retentionByDay: Record<string, number | null> = {};
      RETENTION_DAY_OFFSETS.forEach((offset) => {
        // Below MIN_SAMPLE_SIZE, this cohort renders "not enough data
        // yet" for every day-offset — exactly the noisy-small-N case
        // the approved wave plan named explicitly (~20 users). Checked
        // before the elapsed-time gate below so a tiny-but-old cohort
        // still doesn't get a real (noisy) number.
        if (userIds.length < MIN_SAMPLE_SIZE) {
          retentionByDay[String(offset)] = null;
          return;
        }
        // Can only know day-N retention once the cohort itself is at
        // least N + tolerance days old — else it's "unknown yet," not 0%.
        const elapsedSinceCohortStart = daysBetween(cohortWeekStart, now);
        if (elapsedSinceCohortStart < offset + DAY_OFFSET_TOLERANCE) {
          retentionByDay[String(offset)] = null;
          return;
        }
        const activeCount = userIds.filter((uid) => {
          const signupDate = createdAtByUser.get(uid);
          return signupDate && wasActiveNearDayOffset(uid, signupDate, offset);
        }).length;
        retentionByDay[String(offset)] = Math.round((activeCount / userIds.length) * 1000) / 10;
      });
      return {
        cohortLabel: cohortWeekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
        cohortWeekStart: weekKey,
        cohortSize: userIds.length,
        retentionByDay,
      };
    })
    .sort((a, b) => a.cohortWeekStart.localeCompare(b.cohortWeekStart));

  // ── D7 retention — single aggregate across every user old enough to
  //    have a real day-7 answer, gated by MIN_SAMPLE_SIZE. ──────────────
  const d7Eligible: string[] = [];
  createdAtByUser.forEach((signupDate, uid) => {
    if (daysBetween(signupDate, now) >= 7 + DAY_OFFSET_TOLERANCE) d7Eligible.push(uid);
  });
  const d7ActiveCount = d7Eligible.filter((uid) => {
    const signupDate = createdAtByUser.get(uid)!;
    return wasActiveNearDayOffset(uid, signupDate, 7);
  }).length;
  const d7ThresholdMet = d7Eligible.length >= MIN_SAMPLE_SIZE;
  const d7Retention = {
    pct: d7ThresholdMet ? Math.round((d7ActiveCount / d7Eligible.length) * 1000) / 10 : null,
    sampleSize: d7Eligible.length,
    thresholdMet: d7ThresholdMet,
  };

  // ── Resurrected users — 3 clean, non-overlapping windows:
  //      established:  anything before `dormantWindowStart`
  //      dormant gap:   [dormantWindowStart, resurrectionWindowStart) — must be EMPTY
  //      reactivated:   [resurrectionWindowStart, now] — must have ≥1 workout
  //    "Established" proves this isn't simply a brand-new user whose
  //    first-ever workout happens to land inside the reactivation
  //    window; the empty dormant-gap window is what makes it a real
  //    resurrection, not just ongoing activity. ──────────────────────────
  const resurrectionWindowStart = new Date(now);
  resurrectionWindowStart.setDate(resurrectionWindowStart.getDate() - REACTIVATION_WINDOW_DAYS);
  const dormantWindowStart = new Date(resurrectionWindowStart);
  dormantWindowStart.setDate(dormantWindowStart.getDate() - DORMANT_GAP_DAYS);

  let resurrectedCount = 0;
  let eligiblePopulation = 0;
  workoutDatesByUser.forEach((dates) => {
    const hasEstablishedActivity = dates.some((d) => d < dormantWindowStart);
    if (!hasEstablishedActivity) return; // too new to ever have been "dormant" — not eligible
    eligiblePopulation++;

    const hadDormantGap = !dates.some((d) => d >= dormantWindowStart && d < resurrectionWindowStart);
    const hasReactivated = dates.some((d) => d >= resurrectionWindowStart);
    if (hadDormantGap && hasReactivated) resurrectedCount++;
  });

  const resurrectedThresholdMet = eligiblePopulation >= MIN_SAMPLE_SIZE;

  return {
    status: 200 as const,
    body: {
      scope: scope.kind,
      vertical: scope.kind === 'vertical' ? scope.vertical : undefined,
      minSampleSize: MIN_SAMPLE_SIZE,
      cohortRetention: {
        cohorts,
        dayOffsets: RETENTION_DAY_OFFSETS,
      },
      d7Retention,
      resurrectedUsers: {
        count: resurrectedThresholdMet ? resurrectedCount : 0,
        eligiblePopulation,
        thresholdMet: resurrectedThresholdMet,
      },
    } satisfies RetentionDepthResponse,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const scope = await resolveAdminAnalyticsScope(uid);
    const db = getAdminDb();
    const result = await computeRetentionDepth(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/retention-depth] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
