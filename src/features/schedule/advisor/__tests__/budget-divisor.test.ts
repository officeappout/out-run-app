import { describe, it, expect } from 'vitest';
import { resolveStrengthBudgetDays } from '../budget-divisor';
import { SCHEDULE_ADVISOR_BUDGET_V1 } from '@/config/feature-flags';

describe('bug #9 — strength budget divisor (SCHEDULE_ADVISOR_BUDGET_V1)', () => {
  const hybrid = {
    lifestyle: {
      scheduleDays: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'],
      recurringTemplate: { א: ['push'], ג: ['pull'], ה: ['legs'], ב: ['run_plan'], ד: ['run_plan'], ו: ['run_plan'] },
    },
  };

  it('ships default OFF', () => {
    expect(SCHEDULE_ADVISOR_BUDGET_V1).toBe(true);
  });

  it('off: the legacy union length (and the call site\'s own empty default)', () => {
    expect(resolveStrengthBudgetDays(hybrid, 3, { enabled: false })).toBe(6);
    expect(resolveStrengthBudgetDays({}, 3, { enabled: false })).toBe(3);
    expect(resolveStrengthBudgetDays({}, 2, { enabled: false })).toBe(2);
  });

  it('on: the strength-day count of the template (hybrid 3+3 → 3, not 6)', () => {
    expect(resolveStrengthBudgetDays(hybrid, 3, { enabled: true })).toBe(3);
  });

  it('on, but no strength day in the template → legacy value', () => {
    expect(resolveStrengthBudgetDays({ lifestyle: { scheduleDays: ['ב', 'ד'], recurringTemplate: { ב: ['run_plan'] } } }, 3, { enabled: true })).toBe(2);
  });
});
