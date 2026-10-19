import { allExercises, patternGroup } from './helpers';
import type { Finding, InvariantRule } from './types';

/** Levels apart (program level scale) before an exercise is "far" from the user. */
export const LEVEL_GAP_MAX = 4;

function userLevelFor(levels: Record<string, number> | undefined, pattern: string | null): number | null {
  if (!levels) return null;
  const g = patternGroup(pattern);
  const v = (g && levels[g]) ?? (pattern ? levels[pattern] : undefined) ?? levels.overall ?? levels.strength;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const levelGap: InvariantRule = {
  id: 'LEVEL_GAP',
  titleHe: 'תרגיל רחוק מהרמה של המשתמש',
  descriptionHe: `תרגיל שהרמה שלו רחוקה ביותר מ-${LEVEL_GAP_MAX} רמות מהרמה של המשתמש באותו דפוס (קל מדי או קשה מדי).`,
  severity: 2,
  check({ input, output }) {
    const out: Finding[] = [];
    for (const { ex } of allExercises(output)) {
      if (typeof ex.level !== 'number') continue;
      const lvl = userLevelFor(input.levels, ex.pattern);
      if (lvl === null) continue;
      const gap = ex.level - lvl;
      if (Math.abs(gap) <= LEVEL_GAP_MAX) continue;
      out.push({
        ruleId: 'LEVEL_GAP',
        severity: gap > 0 ? 3 : 2,
        messageHe: `${ex.id}: רמה ${ex.level} למשתמש ברמה ${lvl} (${gap > 0 ? 'קשה' : 'קל'} מדי)`,
        data: { exerciseId: ex.id, exerciseLevel: ex.level, userLevel: lvl },
      });
    }
    return out;
  },
};
