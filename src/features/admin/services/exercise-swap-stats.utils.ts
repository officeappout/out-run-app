/**
 * Pure helpers for /admin/exercises/swap-stats ("תרגילים שמחליפים הכי הרבה",
 * soft-adaptation Phase 0). Input: exercise_stats docs (anonymous counters
 * written by the onExerciseSwapCreated / onWorkoutCreateExerciseStats Cloud
 * Functions). No I/O here.
 */

export interface ExerciseStatsDoc {
  id: string;
  name?: string;
  lastLevel?: number;
  domain?: string;
  prescribedCompleted?: number;
  completedAsReplacement?: number;
  swappedAway?: number;
  systemSwappedAway?: number;
  swappedTo?: number;
  byDirection?: Partial<Record<'lower' | 'same' | 'higher', number>>;
  byTab?: Partial<Record<'adaptation' | 'alternative', number>>;
  bySource?: Record<string, number>;
  byLocation?: Record<string, number>;
  byReason?: Record<string, number>;
  topReplacements?: Record<string, number>;
  replacementNames?: Record<string, string>;
}

export type SwapAutoLabel = 'level_too_low' | 'disliked' | 'equipment';

export const AUTO_LABEL_TEXT: Record<SwapAutoLabel, string> = {
  level_too_low: 'ייתכן שהרמה מתויגת נמוך מדי',
  disliked: 'לא אהוב / לא מתאים',
  equipment: 'בעיית ציוד במיקום',
};

export const REASON_LABELS: Record<string, string> = {
  too_hard: 'קשה מדי',
  too_easy: 'קל מדי',
  no_equipment: 'אין ציוד',
  dislike: 'פחות מתאים',
  pain: 'כואב',
};

/** Minimum swap opportunities (swaps + completions) for the ranked table. */
export const MIN_SAMPLE = 20;

export interface SwapStatsRow {
  id: string;
  name: string;
  level?: number;
  domain?: string;
  prescribedCompleted: number;
  swappedAway: number;
  /** swappedAway + prescribedCompleted — every time it was in front of a user and resolved. */
  n: number;
  swapRate: number;
  /** Wilson 95% lower bound of swapRate — the ranking key (penalises tiny n). */
  wilsonLower: number;
  direction: { lower: number; same: number; higher: number };
  topReplacements: { id: string; name: string; count: number }[];
  topReasons: { reason: string; label: string; count: number }[];
  locations: { location: string; count: number }[];
  labels: SwapAutoLabel[];
}

const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Wilson score interval lower bound (z = 1.96 → 95%). 0 when n = 0. */
export function wilsonLowerBound(successes: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = Math.min(1, Math.max(0, successes / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / denom);
}

function sortedEntries(map: Record<string, number> | undefined): [string, number][] {
  return Object.entries(map ?? {})
    .map(([k, v]) => [k, n0(v)] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Heuristic labels (a hint for a human, not a decision):
 *  • level_too_low — most user swaps go DOWN a level and a real share
 *    (≥30%) start from the in-player "קשה מדי?" coach hint.
 *  • disliked — most swaps stay at the SAME level and they come mostly from
 *    the "תרגיל חלופי" tab, or "פחות מתאים לי" is the top reason.
 *  • equipment — "אין לי את הציוד" is the top reason, or ≥80% of swaps
 *    happen in one location (min 5 swaps).
 */
export function autoLabels(doc: ExerciseStatsDoc): SwapAutoLabel[] {
  const out: SwapAutoLabel[] = [];
  const swaps = n0(doc.swappedAway);
  if (swaps === 0) return out;
  const lower = n0(doc.byDirection?.lower);
  const same = n0(doc.byDirection?.same);
  const higher = n0(doc.byDirection?.higher);
  const dirTotal = lower + same + higher;
  const coachHint = n0(doc.bySource?.in_workout_coach_hint);
  const altTab = n0(doc.byTab?.alternative);
  const tabTotal = altTab + n0(doc.byTab?.adaptation);
  const reasons = sortedEntries(doc.byReason);
  const topReason = reasons[0]?.[0];
  const locations = sortedEntries(doc.byLocation);
  const locTotal = locations.reduce((a, [, v]) => a + v, 0);

  if (dirTotal > 0 && lower / dirTotal >= 0.6 && coachHint / swaps >= 0.3) out.push('level_too_low');
  if (
    dirTotal > 0 &&
    same / dirTotal >= 0.6 &&
    ((tabTotal > 0 && altTab / tabTotal >= 0.5) || topReason === 'dislike')
  ) {
    out.push('disliked');
  }
  if (topReason === 'no_equipment' || (swaps >= 5 && locTotal > 0 && locations[0][1] / locTotal >= 0.8)) {
    out.push('equipment');
  }
  return out;
}

export function toSwapStatsRow(doc: ExerciseStatsDoc): SwapStatsRow {
  const swappedAway = n0(doc.swappedAway);
  const prescribedCompleted = n0(doc.prescribedCompleted);
  const n = swappedAway + prescribedCompleted;
  return {
    id: doc.id,
    name: doc.name || doc.id,
    ...(typeof doc.lastLevel === 'number' ? { level: doc.lastLevel } : {}),
    ...(doc.domain ? { domain: doc.domain } : {}),
    prescribedCompleted,
    swappedAway,
    n,
    swapRate: n > 0 ? swappedAway / n : 0,
    wilsonLower: wilsonLowerBound(swappedAway, n),
    direction: {
      lower: n0(doc.byDirection?.lower),
      same: n0(doc.byDirection?.same),
      higher: n0(doc.byDirection?.higher),
    },
    topReplacements: sortedEntries(doc.topReplacements)
      .slice(0, 3)
      .map(([id, count]) => ({ id, name: doc.replacementNames?.[id] || id, count })),
    topReasons: sortedEntries(doc.byReason)
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, label: REASON_LABELS[reason] ?? reason, count })),
    locations: sortedEntries(doc.byLocation).map(([location, count]) => ({ location, count })),
    labels: autoLabels(doc),
  };
}

/**
 * Ranked rows (n ≥ MIN_SAMPLE, by Wilson lower bound desc) and the
 * "מעט נתונים" rows (swapped at least once but n < MIN_SAMPLE, by swaps desc).
 */
export function buildSwapStatsTables(docs: ExerciseStatsDoc[]): {
  ranked: SwapStatsRow[];
  lowData: SwapStatsRow[];
} {
  const rows = docs.map(toSwapStatsRow).filter((r) => r.swappedAway > 0);
  const ranked = rows
    .filter((r) => r.n >= MIN_SAMPLE)
    .sort((a, b) => b.wilsonLower - a.wilsonLower || b.swappedAway - a.swappedAway);
  const lowData = rows
    .filter((r) => r.n < MIN_SAMPLE)
    .sort((a, b) => b.swappedAway - a.swappedAway || b.swapRate - a.swapRate);
  return { ranked, lowData };
}
