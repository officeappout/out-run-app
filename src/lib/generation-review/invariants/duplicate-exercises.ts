import { allExercises } from './helpers';
import type { Finding, InvariantRule } from './types';

export const duplicateExercises: InvariantRule = {
  id: 'DUPLICATE_EXERCISES',
  titleHe: 'אותו תרגיל פעמיים',
  descriptionHe: 'אותו תרגיל מופיע יותר מפעם אחת באותו בלוק כוח (אותה תחנה או אותו אימון).',
  severity: 2,
  check({ output }) {
    const seen = new Map<string, number>();
    for (const { ex, block } of allExercises(output)) {
      const k = `${block}|${ex.id}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const out: Finding[] = [];
    for (const [k, n] of seen) {
      if (n < 2) continue;
      const [block, id] = k.split('|');
      out.push({
        ruleId: 'DUPLICATE_EXERCISES',
        severity: 2,
        messageHe: `${id} מופיע ${n} פעמים ${block === 'main' ? 'באימון' : `בתחנה ${Number(block.slice(3)) + 1}`}`,
        data: { exerciseId: id, block, count: n },
      });
    }
    return out;
  },
};
