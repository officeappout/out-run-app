/**
 * Strength questionnaire v3 (enable_strength_quiz_v3), after the assessment: the screen order
 * (5a skills → 5b skill questionnaire → 6 summary → 7 to 9 explainers → health declaration) and the
 * explainers' data. Pure, no React (__tests__/quiz-v3-outro.test.ts).
 */
import type { QuizV3SkillId } from './skill-unlock';
import { SUMMARY_GROUPS, type SummaryGroup } from './quiz-v3-summary';

// ── Screen order ───────────────────────────────────────────────────

export type OutroScreen =
  | { kind: 'skills' }
  | { kind: 'skillSlider'; skillId: QuizV3SkillId }
  | { kind: 'done' }
  | { kind: 'explain'; index: 1 | 2 | 3 };

export const EXPLAIN_COUNT = 3;

/** The first screen: the skills screen when something unlocked, else the summary. */
export function firstOutroScreen(hasUnlockedSkills: boolean): OutroScreen {
  return hasUnlockedSkills ? { kind: 'skills' } : { kind: 'done' };
}

/** Forward. null = leave the outro (on to the health declaration). */
export function nextOutroScreen(s: OutroScreen): OutroScreen | null {
  switch (s.kind) {
    case 'skills':
    case 'skillSlider':
      return { kind: 'done' };
    case 'done':
      return { kind: 'explain', index: 1 };
    case 'explain':
      return s.index < EXPLAIN_COUNT ? { kind: 'explain', index: (s.index + 1) as 2 | 3 } : null;
  }
}

/** Back. null = leave the outro backwards (the page returns to the last slider). */
export function prevOutroScreen(s: OutroScreen, hasUnlockedSkills: boolean): OutroScreen | null {
  switch (s.kind) {
    case 'skills':
      return null;
    case 'skillSlider':
      return { kind: 'skills' };
    case 'done':
      return hasUnlockedSkills ? { kind: 'skills' } : null;
    case 'explain':
      return s.index === 1 ? { kind: 'done' } : { kind: 'explain', index: (s.index - 1) as 1 | 2 };
  }
}

/** "דלג" on the explainers jumps to the last one (it holds the CTA to the health declaration). */
export function skipExplainers(): OutroScreen {
  return { kind: 'explain', index: EXPLAIN_COUNT };
}

// ── Explainer 1: "what is level N in <group>" ──────────────────────

/** The group explained: the weakest one; on a tie the first in push / pull / legs / core order. */
export function explainGroup(levels: Partial<Record<string, number>>): { group: SummaryGroup; level: number } | null {
  let best: { group: SummaryGroup; level: number } | null = null;
  for (const g of SUMMARY_GROUPS) {
    const lvl = levels[g];
    if (typeof lvl !== 'number' || !Number.isFinite(lvl) || lvl <= 0) continue;
    if (!best || lvl < best.level) best = { group: g, level: Math.round(lvl) };
  }
  return best;
}

export type LadderNodeState = 'locked' | 'next' | 'current' | 'done';

export interface LadderNode {
  level: number;
  state: LadderNodeState;
}

/**
 * The ~5 node window of the group's progress map, top (hardest) first like the board:
 * one locked, the next goal, the current level, two done. Uses only levels that exist in the
 * program (`levels`, gaps skipped); fewer nodes at the bottom or top of the ladder.
 */
export function ladderWindow(levels: readonly number[], current: number): LadderNode[] {
  const sorted = Array.from(new Set(levels.filter((l) => Number.isFinite(l) && l > 0))).sort((a, b) => a - b);
  const below = sorted.filter((l) => l < current).slice(-2);
  const above = sorted.filter((l) => l > current).slice(0, 2);
  const nodes: LadderNode[] = [];
  if (above[1] !== undefined) nodes.push({ level: above[1], state: 'locked' });
  if (above[0] !== undefined) nodes.push({ level: above[0], state: 'next' });
  nodes.push({ level: current, state: 'current' });
  for (const l of [...below].reverse()) nodes.push({ level: l, state: 'done' });
  return nodes;
}

// ── Explainer 3: the week preview strip ────────────────────────────

/** Days 0..6 (Sunday first). A static illustration: three training days, alternating. */
export const PREVIEW_TRAINING_DAYS = [0, 2, 4] as const;

export interface WeekPreviewDay {
  day: number;
  group: SummaryGroup | null;
}

/** The user's groups (those with a level) spread over the preview's training days, in order. */
export function weekPreview(levels: Partial<Record<string, number>>): WeekPreviewDay[] {
  const groups = SUMMARY_GROUPS.filter((g) => {
    const l = levels[g];
    return typeof l === 'number' && l > 0;
  });
  const days: WeekPreviewDay[] = [];
  for (let day = 0; day < 7; day++) {
    const slot = (PREVIEW_TRAINING_DAYS as readonly number[]).indexOf(day);
    days.push({ day, group: slot >= 0 && groups.length > 0 ? groups[slot % groups.length] : null });
  }
  return days;
}
