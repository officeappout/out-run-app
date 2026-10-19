import type { InvariantRule } from './types';

export const DURATION_TOLERANCE = 0.25;

export const durationMismatch: InvariantRule = {
  id: 'DURATION_MISMATCH',
  titleHe: 'משך האימון רחוק מהיעד',
  descriptionHe: `סך הדקות של האימון שונה ביותר מ-${Math.round(DURATION_TOLERANCE * 100)}% מהזמן שהמשתמש ביקש.`,
  severity: 2,
  check({ input, output }) {
    const target = input.targetMinutes;
    const total = output.totalMinutes;
    if (typeof target !== 'number' || target <= 0 || typeof total !== 'number' || total < 0) return [];
    const err = (total - target) / target;
    if (Math.abs(err) <= DURATION_TOLERANCE) return [];
    return [{
      ruleId: 'DURATION_MISMATCH',
      severity: Math.abs(err) > 0.6 ? 3 : 2,
      messageHe: `התבקשו ${Math.round(target)} דק׳ והאימון ${Math.round(total)} דק׳ (${err > 0 ? '+' : ''}${Math.round(err * 100)}%)`,
      data: { targetMinutes: target, totalMinutes: total, errorPct: Math.round(err * 100) },
    }];
  },
};
