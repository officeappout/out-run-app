import { allExercises, patternGroup, type PatternGroup } from './helpers';
import type { InvariantRule } from './types';

/** Fewer main exercises than this are too few to call a block unbalanced. */
const MIN_EXERCISES = 3;
const GROUP_HE: Record<PatternGroup, string> = { push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', core: 'ליבה', other: 'אחר' };

export const strengthSinglePattern: InvariantRule = {
  id: 'STRENGTH_SINGLE_PATTERN',
  titleHe: 'בלוק כוח מדפוס תנועה אחד',
  descriptionHe: 'כל תרגילי הכוח (בלי ליבה) מאותו דפוס תנועה — למשל רק דחיפה — כשלא התבקש פוקוס. מצופה איזון בין דחיפה, משיכה ורגליים.',
  severity: 2,
  check({ input, output }) {
    if (input.focus) return [];
    const groups = allExercises(output)
      .map(({ ex }) => patternGroup(ex.pattern))
      .filter((g): g is PatternGroup => g === 'push' || g === 'pull' || g === 'legs');
    if (groups.length < MIN_EXERCISES) return [];
    const distinct = new Set(groups);
    if (distinct.size !== 1) return [];
    const only = groups[0];
    return [{
      ruleId: 'STRENGTH_SINGLE_PATTERN',
      severity: 2,
      messageHe: `כל ${groups.length} תרגילי הכוח הם ${GROUP_HE[only]}`,
      data: { group: only, count: groups.length },
    }];
  },
};
