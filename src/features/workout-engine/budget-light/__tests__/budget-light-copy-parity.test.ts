/** i18n extraction batch 3: budget-light "why" lines. File snapshot recorded from unmodified origin/main. */
import { describe, expect, it } from 'vitest';
import { budgetLightText } from '../copy';

describe('budget light copy (Hebrew)', () => {
  it('every key x form x gender', async () => {
    const out: unknown[] = [];
    for (const key of ['budget_light.weekly_spent', 'budget_light.daily_spent'] as const)
      for (const form of ['card', 'description'] as const)
        for (const g of ['female', 'male', null, undefined] as const) out.push([key, form, g ?? null, budgetLightText(key, form, g)]);
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('./__snapshots__/budget-light-copy/all.json');
    expect(out.length).toBe(16);
  });
});
