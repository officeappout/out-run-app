/**
 * Strength questionnaire v3 (enable_strength_quiz_v3), screen 6 (board Done): the program cards, like the
 * progress tab. A full-body master card (level + ring) and one row per muscle group (level + percent).
 * Pure, no React (__tests__/quiz-v3-summary.test.ts).
 */

export const SUMMARY_GROUPS = ['push', 'pull', 'legs', 'core'] as const;
export type SummaryGroup = (typeof SUMMARY_GROUPS)[number];

/** progression.tracks shape (profile) or the assessment's own levels mapped to it. */
export type TrackLike = { currentLevel?: number; percent?: number } | undefined;

export interface SummaryRow {
  group: SummaryGroup;
  level: number;
  /** Progress inside the level, 0 to 100 (what the ring shows). */
  percent: number;
}

export interface ProgramSummary {
  master: { level: number; percent: number; groupCount: number };
  rows: SummaryRow[];
}

const clampPct = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0);
const validLevel = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Rows for the groups that have a level (unassessed groups are left out, never shown as level 0),
 * in push / pull / legs / core order. The master level is `masterLevel` when the caller has it
 * (the assessment's own average), else the rounded mean of the rows; its percent is the rows' mean.
 */
export function buildProgramSummary(
  tracks: Partial<Record<string, TrackLike>>,
  masterLevel?: number,
): ProgramSummary {
  const rows: SummaryRow[] = [];
  for (const group of SUMMARY_GROUPS) {
    const t = tracks[group];
    if (!t || !validLevel(t.currentLevel)) continue;
    rows.push({ group, level: Math.round(t.currentLevel), percent: clampPct(t.percent) });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const level = validLevel(masterLevel) ? Math.round(masterLevel) : Math.round(mean(rows.map((r) => r.level)));
  return {
    master: { level, percent: Math.round(mean(rows.map((r) => r.percent))), groupCount: rows.length },
    rows,
  };
}

/** The assessment's levels as tracks: a level just assessed starts at 0% inside it (onboarding-sync writes percent 0). */
export function tracksFromLevels(levels: Partial<Record<string, number>>): Record<string, TrackLike> {
  const out: Record<string, TrackLike> = {};
  for (const g of SUMMARY_GROUPS) {
    const lvl = levels[g];
    if (validLevel(lvl)) out[g] = { currentLevel: lvl, percent: 0 };
  }
  return out;
}

/** A skill program on the plan screen (planche, front lever...), with the level the user settled on. */
export interface SkillSummaryRow {
  skillId: string;
  level: number;
}

/**
 * Owner 28.10 (Y11): the plan screen shows every program the user leaves with, not only full body.
 * Skills answered inside the assessment (`levels` keys that are not muscle groups) and skills added on
 * the skills screen (`chosen`, which wins on a clash), in that order, each once.
 */
export function skillSummaryRows(
  levels: Partial<Record<string, number>>,
  chosen: readonly { skillId: string; level: number }[] = [],
): SkillSummaryRow[] {
  const out = new Map<string, number>();
  for (const [id, lvl] of Object.entries(levels)) {
    if ((SUMMARY_GROUPS as readonly string[]).includes(id) || !validLevel(lvl)) continue;
    out.set(id, Math.round(lvl));
  }
  for (const c of chosen) {
    if (validLevel(c.level)) out.set(c.skillId, Math.round(c.level));
  }
  return Array.from(out, ([skillId, level]) => ({ skillId, level }));
}

/** Plan screen entry (Y10): each card in turn, the parent (full-body) card last. Seconds. */
export const CARD_ENTER_FIRST_S = 0.25;
export const CARD_ENTER_STEP_S = 0.18;

export function cardEnterDelays(childCount: number): { children: number[]; master: number } {
  const children = Array.from({ length: childCount }, (_, i) => CARD_ENTER_FIRST_S + i * CARD_ENTER_STEP_S);
  return { children, master: CARD_ENTER_FIRST_S + childCount * CARD_ENTER_STEP_S + 0.1 };
}

/**
 * "הידעת?" bubble (board Done). Rendered ONLY with a real norms source; none is wired yet, so the
 * screen passes nothing and the bubble stays hidden. Never invent a percentile.
 */
export interface NormsFact {
  group: SummaryGroup;
  /** Share of people of the same gender and age band below this level, 0 to 100. */
  percentile: number;
  /** Shown under the line, e.g. the norms table's name. */
  source: string;
}

export function isRenderableNormsFact(fact: NormsFact | null | undefined): fact is NormsFact {
  return !!fact && Number.isFinite(fact.percentile) && fact.percentile >= 0 && fact.percentile <= 100 && fact.source.trim() !== '';
}
