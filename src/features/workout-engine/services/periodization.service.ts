/**
 * Periodization Service — The "Resilient Smart Coach" Engine
 *
 * Implements a 5-week periodization clock + inactivity-aware session policy
 * for all strength/calisthenics programs.
 *
 * ── Cycle Anchor ──────────────────────────────────────────────────────────
 *   Source of truth: UserActiveProgram.startDate (already on the user profile).
 *   Formula:         currentCycleWeek = (Math.ceil(daysSinceStart / 7) % 5) || 5
 *
 *   Week 1-3 → "Build"  (default volume / difficulty)
 *   Week 4   → "Peak"   (+20% volume, force at least Δ+1, protocol probability ×1.5)
 *   Week 5   → "Deload" (-50% volume, force Δ-2/-3, protocol prob = 0, SA cap 15%)
 *
 * ── Inactivity Bridge (adopted from Running's AlignmentAction) ────────────
 *   Gap 0-3 days:  No change — normal session.
 *   Gap 4-7 days:  Detraining lock (Option 3 disabled, -40% volume).
 *   Gap 8-21 days: Force Deload (week=5), apply Deload rules.
 *   Gap 21+ days:  Force Deload + emit "rebuild" cue + cycle restart hint.
 *
 *   Caller (home-workout.service) is responsible for actually writing the new
 *   startDate to Firestore on the rebuild path.
 *
 * The policy is a *pure* function: identical inputs → identical outputs.
 * All Firestore I/O happens upstream.
 */

import type { UserActiveProgram } from '@/features/user/core/types/user.types';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface SessionPolicy {
  /** Effective periodization week (1-5). May be forced to 5 by long gaps. */
  periodizationWeek: number;
  /** 1.0 (Build) | 1.2 (Peak) | 0.5 (Deload). Applied to base sets. */
  volumeMultiplier: number;
  /** Force a specific Δ vs user level. Peak: +1, Deload: -2. Undefined = no override. */
  deltaOverride?: number;
  /** Multiplier applied on top of admin protocolProbability. 1.5 (Peak) | 0 (Deload). */
  protocolMultiplier: number;
  /** Hard cap on straight-arm ratio for Deload weeks (tendon protection). */
  straightArmCap?: number;
  /** Detraining lock — locks Option 3, drops volume by `volumeReductionOverride`. */
  detrainingLock: boolean;
  /** -40% (gap 4-7) or -50% (gap 8+) — passed to calculateVolumeAdjustment. */
  volumeReductionOverride?: number;
  /** UI-facing message explaining the active mode. */
  coachCue?: string;
  /** Trio carousel default focus: 0 = Easy, 1 = Normal, 2 = Intense. */
  defaultFocusIndex: 0 | 1 | 2;
  /** Whether the cycle anchor (startDate) should be reset to today. Long-gap rebuild. */
  shouldRestartCycle: boolean;
  /** Reason label for logging/debugging. */
  reason: 'build' | 'peak' | 'deload' | 'detraining' | 'long_gap_deload' | 'rebuild';
}

// ─────────────────────────────────────────────────────────────────────────
// Cycle Week Derivation
// ─────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Dates before this are periodization-impossible — treated as missing. */
const CYCLE_SANITY_FLOOR_MS = new Date('2024-01-01T00:00:00Z').getTime();

/**
 * Compute the current cycle week (1-5) from a program's startDate.
 *
 * Returns 1 when no active program exists (safe default — Build mode).
 * Day 0..6 → week 1, day 7..13 → week 2, ... day 28..34 → week 5,
 * day 35+ → wraps back to week 1.
 */
export function derivePeriodizationWeek(
  activeProgram: UserActiveProgram | null | undefined,
): number {
  if (!activeProgram?.startDate) {
    console.log('[Periodization] No active program startDate — defaulting to Week 1 (Build)');
    return 1;
  }

  // ── Shape normalization (12.07.2026) ──────────────────────────────────
  // Real user docs still carry Firestore-Timestamp startDates: writers that
  // pass `new Date()` to Firestore get stored as Timestamps, and the ISO
  // unification is not deployed everywhere. new Date(TimestampShape) is
  // Invalid — which used to freeze those accounts at Week 1 forever.
  // Decode the instant instead: instance (.toDate), client shape ({seconds}),
  // JSON round-trip shape ({_seconds} — an SDK-INTERNAL field name that may
  // change between SDK versions; belt-and-suspenders only, the public shapes
  // are covered first); else parse as before.
  const raw: unknown = activeProgram.startDate;
  const shape = raw as { toDate?: () => Date; seconds?: number; _seconds?: number };
  const start =
    typeof shape?.toDate === 'function'
      ? shape.toDate()
      : typeof (shape?.seconds ?? shape?._seconds) === 'number'
        ? new Date(((shape.seconds ?? shape._seconds) as number) * 1000)
        : new Date(raw as string | number | Date);

  // Invalid-date guard (crash fix, 09.07.2026): a malformed value that
  // slipped past upstream normalization parses to Invalid Date — which is
  // TRUTHY, so it passed the null-guard above and blew up on toISOString()
  // below. Log the RAW value + its shape so the offending field is always
  // identifiable, then fall back to Week 1 (Build).
  if (isNaN(start.getTime())) {
    console.warn(
      '[Periodization] ⚠️ INVALID startDate — raw:',
      JSON.stringify(activeProgram.startDate),
      `(typeof=${typeof activeProgram.startDate}, ` +
      `constructor=${(activeProgram.startDate as unknown as object)?.constructor?.name ?? 'n/a'}) ` +
      '→ defaulting to Week 1 (Build)',
    );
    return 1;
  }

  // ── Sanity floor (David-approved, 12.07.2026) ─────────────────────────
  // A VALID but ancient date (epoch artifacts, pre-app data) passes both
  // guards above and lands the cycle clock on an arbitrary week — worst
  // case permanent Deload (protocolProbability × 0: no protocols, ever).
  // Anything before the app had periodization is treated as missing.
  if (start.getTime() < CYCLE_SANITY_FLOOR_MS) {
    console.warn(
      `[Periodization] ⚠️ ANCIENT startDate (${start.toISOString().slice(0, 10)}) ` +
      '— pre-2024 is treated as missing → Week 1 (Build)',
    );
    return 1;
  }
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysSinceStart = Math.max(0, Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY));
  const weeksSinceStart = Math.ceil((daysSinceStart + 1) / 7); // +1 so day 0 = week 1
  const currentWeek = (weeksSinceStart % 5) || 5;

  console.log(
    `[Periodization] Cycle clock: startDate=${start.toISOString().slice(0, 10)} ` +
    `daysSinceStart=${daysSinceStart} → Week ${currentWeek}/5`,
  );

  return currentWeek;
}

// ─────────────────────────────────────────────────────────────────────────
// Session Policy Resolver
// ─────────────────────────────────────────────────────────────────────────

const GAP_DETRAINING_THRESHOLD = 3;   // > 3 days → detraining lock
const GAP_FORCE_DELOAD_THRESHOLD = 7;  // > 7 days → force week=5
const GAP_REBUILD_THRESHOLD = 21;      // >= 21 days → cycle restart

const VOLUME_DETRAINING = 0.40;  // -40% on 4-7 day gap (matches existing constant)
const VOLUME_LONG_GAP = 0.50;    // -50% on 8-21 day gap

const DELOAD_SA_CAP = 0.15;       // 15% straight-arm max on deload weeks

/**
 * Resolve the full session policy for a given cycle week + gap.
 *
 * Gap takes precedence over the cycle clock for the more severe cases:
 *   - Gap >= 21: Rebuild (forces deload + restart hint)
 *   - Gap >  7:  Long-gap deload (forces week=5)
 *   - Gap >  3:  Detraining (lock + -40% volume, week unchanged)
 *
 * Otherwise the cycle week dictates the mode.
 */
/**
 * Scale a base probability by the periodization multiplier, capped at 1.0.
 * Shared by BOTH the main protocol probability AND the tabata-finisher
 * probability so a Deload week (multiplier 0) kills them identically.
 */
export function scaleByPeriodization(baseProbability: number, multiplier: number): number {
  return Math.min(1.0, baseProbability * multiplier);
}

export function resolveSessionPolicy(
  cycleWeek: number,
  gapDays: number,
): SessionPolicy {
  const isRebuild = gapDays >= GAP_REBUILD_THRESHOLD;
  const isLongGap = gapDays > GAP_FORCE_DELOAD_THRESHOLD && !isRebuild;
  const isDetraining = gapDays > GAP_DETRAINING_THRESHOLD && !isLongGap && !isRebuild;

  // ── Tier 1: Rebuild (21+ day gap) ────────────────────────────────────
  if (isRebuild) {
    const policy: SessionPolicy = {
      periodizationWeek: 5,
      volumeMultiplier: 0.5,
      deltaOverride: -2,
      protocolMultiplier: 0,
      straightArmCap: DELOAD_SA_CAP,
      detrainingLock: true,
      volumeReductionOverride: VOLUME_LONG_GAP,
      coachCue: `ברוך שובך! התעלמת ${gapDays} ימים — נתחיל מחדש בעדינות עם שבוע שחזור.`,
      defaultFocusIndex: 0,
      shouldRestartCycle: true,
      reason: 'rebuild',
    };
    logPolicy('REBUILD', cycleWeek, gapDays, policy);
    return policy;
  }

  // ── Tier 2: Long Gap (8-21 days) → Force Deload ──────────────────────
  if (isLongGap) {
    const policy: SessionPolicy = {
      periodizationWeek: 5,
      volumeMultiplier: 0.5,
      deltaOverride: -2,
      protocolMultiplier: 0,
      straightArmCap: DELOAD_SA_CAP,
      detrainingLock: true,
      volumeReductionOverride: VOLUME_LONG_GAP,
      coachCue: `חזרת אחרי ${gapDays} ימים — מפעיל את הגוף שוב בשבוע שחזור.`,
      defaultFocusIndex: 0,
      shouldRestartCycle: false,
      reason: 'long_gap_deload',
    };
    logPolicy('LONG_GAP_DELOAD', cycleWeek, gapDays, policy);
    return policy;
  }

  // ── Tier 3: Detraining (4-7 days) → Existing -40% Logic ──────────────
  if (isDetraining) {
    const policy: SessionPolicy = {
      periodizationWeek: cycleWeek,
      volumeMultiplier: 1.0, // override handles volume; multiplier stays neutral
      deltaOverride: undefined,
      protocolMultiplier: 1.0,
      straightArmCap: undefined,
      detrainingLock: true,
      volumeReductionOverride: VOLUME_DETRAINING,
      coachCue: `חזרת אחרי ${gapDays} ימי הפסקה — נתחיל בנוח עם נפח מופחת.`,
      defaultFocusIndex: 1,
      shouldRestartCycle: false,
      reason: 'detraining',
    };
    logPolicy('DETRAINING', cycleWeek, gapDays, policy);
    return policy;
  }

  // ── Tier 4: Cycle Clock (no gap) ─────────────────────────────────────
  let policy: SessionPolicy;

  if (cycleWeek === 5) {
    policy = {
      periodizationWeek: 5,
      volumeMultiplier: 0.5,
      deltaOverride: -2,
      protocolMultiplier: 0,
      straightArmCap: DELOAD_SA_CAP,
      detrainingLock: false,
      volumeReductionOverride: undefined,
      coachCue: 'שבוע שחזור (Deload) — נפח מופחת ב-50%, פרוטוקולים מנוטרלים.',
      defaultFocusIndex: 0,
      shouldRestartCycle: false,
      reason: 'deload',
    };
  } else if (cycleWeek === 4) {
    policy = {
      periodizationWeek: 4,
      volumeMultiplier: 1.2,
      deltaOverride: 1,
      protocolMultiplier: 1.5,
      straightArmCap: undefined,
      detrainingLock: false,
      volumeReductionOverride: undefined,
      coachCue: 'שבוע פסגה (Peak) — נפח +20%, פרוטוקולים אינטנסיביים פעילים.',
      defaultFocusIndex: 2,
      shouldRestartCycle: false,
      reason: 'peak',
    };
  } else {
    policy = {
      periodizationWeek: cycleWeek,
      volumeMultiplier: 1.0,
      deltaOverride: undefined,
      protocolMultiplier: 1.0,
      straightArmCap: undefined,
      detrainingLock: false,
      volumeReductionOverride: undefined,
      coachCue: undefined,
      defaultFocusIndex: 1,
      shouldRestartCycle: false,
      reason: 'build',
    };
  }

  logPolicy(policy.reason.toUpperCase(), cycleWeek, gapDays, policy);
  return policy;
}

// ─────────────────────────────────────────────────────────────────────────
// Logging Helper
// ─────────────────────────────────────────────────────────────────────────

function logPolicy(label: string, cycleWeek: number, gapDays: number, p: SessionPolicy): void {
  console.group(`[Periodization] ${label} → effective Week ${p.periodizationWeek}`);
  console.log(`  Inputs:        cycleWeek=${cycleWeek}, gapDays=${gapDays}`);
  console.log(`  Volume mult:   x${p.volumeMultiplier}${p.volumeReductionOverride ? ` (override=${p.volumeReductionOverride})` : ''}`);
  console.log(`  Δ override:    ${p.deltaOverride ?? 'none'}`);
  console.log(`  Protocol mult: x${p.protocolMultiplier}`);
  console.log(`  SA cap:        ${p.straightArmCap ?? 'none'}`);
  console.log(`  Detraining:    ${p.detrainingLock}`);
  console.log(`  Default focus: ${['Easy(0)', 'Normal(1)', 'Intense(2)'][p.defaultFocusIndex]}`);
  console.log(`  Restart cycle: ${p.shouldRestartCycle}`);
  if (p.coachCue) console.log(`  Coach cue:     "${p.coachCue}"`);
  console.groupEnd();
}
