/**
 * Running plan "shape" for the v2 plan summary (enable_home_v2) — what the
 * "איך התוכנית בנויה" bar chart draws.
 *
 * Read-only and deterministic: it uses the SAME pure rules the real plan
 * generator uses when the running bridge builds the program after signup
 * (plan-generator.service.ts — distributePhases() + buildVolumeMultipliers()),
 * so the bars are the template's own week-by-week volume multipliers.
 *
 * Exact kilometres are NOT knowable on the summary screen: they come from
 * generatePlan() over the Firestore workout templates + pace map, which only
 * runs later (bridgeRunningOnboarding during sync). So the chart shows
 * RELATIVE volume (multiplier / max multiplier), labelled "נפח יחסי".
 */
import {
  buildVolumeMultipliers,
  distributePhases,
} from '@/features/workout-engine/core/services/plan-generator.service';
import { calibrateBasePace, computeZones, determineProfileType } from '@/features/workout-engine/core/services/running-engine.service';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';
import type { RunnerGoal } from '@/features/workout-engine/core/types/running.types';

export type PlanWeekKind = 'build' | 'recovery' | 'goal';

export interface PlanWeekBar {
  /** 1-based week number. */
  week: number;
  /** The template's volume multiplier for this week (e.g. 1.0, 1.1, 0.8, 0.6). */
  multiplier: number;
  /** multiplier / max multiplier, 0..1 — the bar height. */
  relative: number;
  kind: PlanWeekKind;
}

/**
 * Same rule as generateProgramTemplate(): conservative (deload every 3 weeks)
 * when the runner has < 12 months of history or injuries. The onboarding
 * bridge defaults runningHistoryMonths to 0 (no question collects it), so
 * every onboarding plan today is conservative.
 */
export function isConservativePlan(answers: { runningHistoryMonths?: unknown; hasInjuries?: unknown }): boolean {
  const months = typeof answers.runningHistoryMonths === 'number' ? answers.runningHistoryMonths : 0;
  return months < 12 || answers.hasInjuries === true;
}

/** How often a recovery week comes, per the generator's deload cadence. */
export function recoveryCadenceWeeks(conservative: boolean): number {
  return conservative ? 3 : 4;
}

/**
 * Week-by-week bars for a plan of `totalWeeks`.
 *  - goal:     the taper (race) week(s) — last phase.
 *  - recovery: a week whose volume drops below the week before it.
 *  - build:    everything else.
 */
export function buildWeeklyVolumePattern(totalWeeks: number, conservative: boolean): PlanWeekBar[] {
  const weeks = Math.max(1, Math.round(totalWeeks));
  if (weeks < 4) {
    // The generator's phase math assumes ≥4 weeks (the UI floor is 4).
    return Array.from({ length: weeks }, (_, i) => ({
      week: i + 1,
      multiplier: 1,
      relative: 1,
      kind: i === weeks - 1 ? 'goal' : 'build',
    }));
  }

  const layout = distributePhases(weeks);
  const raw: { multiplier: number; isGoal: boolean }[] = [];
  for (const phase of ['base', 'build', 'peak', 'taper'] as const) {
    const n = layout[phase].weeks;
    if (n <= 0) continue;
    const m = buildVolumeMultipliers(phase, n, conservative);
    for (let i = 0; i < n; i++) {
      const value = Array.isArray(m) ? (m[i] ?? m[m.length - 1]) : m;
      raw.push({ multiplier: value, isGoal: phase === 'taper' });
    }
  }

  const max = Math.max(...raw.map((r) => r.multiplier), 0.0001);
  return raw.map((r, i) => {
    const prev = i > 0 ? raw[i - 1].multiplier : null;
    const kind: PlanWeekKind = r.isGoal
      ? 'goal'
      : prev !== null && r.multiplier < prev
        ? 'recovery'
        : 'build';
    return {
      week: i + 1,
      multiplier: r.multiplier,
      relative: Math.round((r.multiplier / max) * 1000) / 1000,
      kind,
    };
  });
}

/** Which week numbers get an axis label (all when short, else every Nth + the last). */
export function weekLabelsToShow(totalWeeks: number): Set<number> {
  const step = totalWeeks <= 12 ? 1 : totalWeeks <= 24 ? 2 : 4;
  const out = new Set<number>();
  for (let w = 1; w <= totalWeeks; w++) {
    if (w === 1 || w === totalWeeks || (w - 1) % step === 0) out.add(w);
  }
  return out;
}

const DIST_KM: Record<string, 3 | 5 | 10> = { '2k': 3, '3k': 3, '5k': 5, '10k': 10, maintenance: 5 };

function mapGoal(goalPath: unknown, targetDistance: unknown): RunnerGoal {
  if (goalPath === 'maintain_fitness') return 'maintain_fitness';
  if (goalPath === 'start_running') return 'couch_to_5k';
  return targetDistance === '10k' ? 'improve_speed_10k' : 'improve_speed_5k';
}

/**
 * Easy-run pace range ("6:20–6:50") — only when the runner entered a
 * result (paceInputSeconds), computed the way the bridge does
 * (calibrateBasePace at the same distance) against the code's default
 * pace map. The live plan reads the admin pace map from Firestore, which
 * falls back to this same default — if an admin changed the table, the
 * plan's real range can differ slightly. null when no result was given.
 */
export function easyPaceRangeLabel(answers: PaceAnswers): string | null {
  return paceZonesFor(answers)?.easy?.label ?? null;
}

type PaceAnswers = { goalPath?: unknown; targetDistance?: unknown; paceInputSeconds?: unknown };

/** The default-pace-map zones for an entered result, or null when none was given. */
function paceZonesFor(answers: PaceAnswers): ReturnType<typeof computeZones> | null {
  const secs = typeof answers.paceInputSeconds === 'number' ? answers.paceInputSeconds : 0;
  if (!(secs > 0)) return null;
  // Byte-for-byte the bridge's deriveBasePace(): reference = target distance.
  const km = DIST_KM[String(answers.targetDistance ?? '5k')] ?? 5;
  const basePace = calibrateBasePace(secs, km, km);
  const profileType = determineProfileType(mapGoal(answers.goalPath, answers.targetDistance), basePace);
  return computeZones(basePace, profileType, DEFAULT_PACE_MAP_CONFIG);
}

export interface PaceTargetRow {
  label: string;
  /** "6:20–6:50" (min:sec per km). */
  range: string;
}

/**
 * "יעדי קצב" tile (enable_home_v2 plan summary, jr/J2-11): the zones this
 * plan's sessions run in, from the same default pace map as the easy label
 * above — easy/long always; tempo + short reps for a time-improvement plan
 * (its quality pool), fartlek for the other goals. [] when no result was
 * entered (paces are only known after the first runs then).
 */
export function paceTargetRows(answers: PaceAnswers): PaceTargetRow[] {
  const z = paceZonesFor(answers);
  if (!z) return [];
  const rows: PaceTargetRow[] = [];
  if (z.easy?.label) rows.push({ label: 'קלה וארוכה', range: z.easy.label });
  if (answers.goalPath === 'improve_time') {
    if (z.tempo?.label) rows.push({ label: 'טמפו', range: z.tempo.label });
    if (z.interval_short?.label) rows.push({ label: 'חזרות קצרות', range: z.interval_short.label });
  } else if (z.fartlek_medium?.label) {
    rows.push({ label: 'פארטלק', range: z.fartlek_medium.label });
  }
  return rows;
}

// ── "מה יש בתוכנית" rows ───────────────────────────────────────────

export type PlanContentKind = 'easy' | 'quality' | 'recovery' | 'adapt';

export interface PlanContentRow {
  kind: PlanContentKind;
  title: string;
  sub: string;
}

/**
 * The plan's ingredients, worded from the template rules the generator
 * applies (plan-generator.service.ts):
 *  - every non-taper week has a required long run; a 4th weekly run adds
 *    an easy run (slots trimmed to the weekly frequency by priority);
 *  - quality: 1 required slot, +1 optional from 3 runs/week; the pool is
 *    gentle (fartlek / strides / short hills) for a new runner, fartlek +
 *    strides for maintenance, intervals + tempo for improving a time;
 *  - recovery weeks = the dips in the volume pattern.
 */
export function buildPlanContentRows(input: {
  goalPath: unknown;
  frequency: number;
  bars: PlanWeekBar[];
  easyPaceLabel: string | null;
}): PlanContentRow[] {
  const { goalPath, frequency, bars, easyPaceLabel } = input;
  const rows: PlanContentRow[] = [];

  rows.push({
    kind: 'easy',
    title: frequency >= 4 ? 'ריצות קלות וארוכות' : 'ריצה ארוכה בקצב נוח',
    sub: easyPaceLabel ? `בסיס סיבולת · ${easyPaceLabel}` : 'בסיס סיבולת, בלי למהר',
  });

  const perWeek = frequency >= 3 ? 'עד פעמיים בשבוע' : 'פעם בשבוע';
  if (goalPath === 'improve_time') {
    rows.push({ kind: 'quality', title: 'אינטרוולים וטמפו', sub: `${perWeek} · מהירות וסף` });
  } else if (goalPath === 'maintain_fitness') {
    rows.push({ kind: 'quality', title: 'פארטלק קל והאצות', sub: `${perWeek} · שומרים על חדות` });
  } else {
    rows.push({ kind: 'quality', title: 'פארטלק, האצות ועליות קצרות', sub: `${perWeek} · עבודת מהירות עדינה` });
  }

  const recovery = bars.filter((b) => b.kind === 'recovery').map((b) => b.week);
  if (recovery.length > 0) {
    const list =
      recovery.length === 1
        ? `שבוע ${recovery[0]}`
        : recovery.length <= 3
          ? `שבועות ${recovery.slice(0, -1).join(', ')} ו-${recovery[recovery.length - 1]}`
          : `${recovery.length} שבועות לאורך התוכנית`;
    rows.push({ kind: 'recovery', title: 'שבועות התאוששות', sub: `${list} · פחות נפח` });
  }

  rows.push({ kind: 'adapt', title: 'מתעדכן לפי הריצות שלך', sub: 'הקצבים מחושבים מחדש לפי הביצועים' });
  return rows;
}
