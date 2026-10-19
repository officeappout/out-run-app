import { allExercises } from './helpers';
import type { InvariantRule } from './types';

export const missingMedia: InvariantRule = {
  id: 'MISSING_MEDIA',
  titleHe: 'תרגיל בלי סרטון',
  descriptionHe: 'תרגיל שהוצג למשתמש בלי סרטון או תמונה.',
  severity: 1,
  check({ output }) {
    const ids = Array.from(new Set(allExercises(output).filter(({ ex }) => ex.hasMedia === false).map(({ ex }) => ex.id)));
    if (!ids.length) return [];
    return [{
      ruleId: 'MISSING_MEDIA',
      severity: 1,
      messageHe: `${ids.length} תרגילים בלי סרטון: ${ids.slice(0, 5).join(', ')}`,
      data: { count: ids.length, ids: ids.slice(0, 10).join(',') },
    }];
  },
};
