/** i18n extraction batch 3: celebration copy. File snapshots recorded from unmodified origin/main (commit 1); commit 2 only adapts the calls to the new signature (translator passed in). */
import { describe, expect, it } from 'vitest';
import { celebrationCopy, celebrationLabels, shareText } from '../celebration-copy';
import { makeT } from '@/lib/i18n/t';
import { home } from '@/messages/ns/home';
import type { Celebration } from '../celebration.core';

const snap = (name: string) => `./__snapshots__/celebration-copy/${name}.json`;
const t = makeT('he', home);
const GENDERS = [null, undefined, 'male', 'female', 'other'] as const;

describe('celebration copy (Hebrew)', () => {
  it('every variant x streak x gender', async () => {
    const out: unknown[] = [];
    const base = { best: 0, shieldsLeft: 0, shieldDays: [] as string[] };
    const cases: Celebration[] = [];
    for (const streak of [1, 2, 5, 6, 7, 14, 21, 28, 70]) cases.push({ variant: 'day', streak, ...base } as Celebration, { variant: 'week', streak, ...base } as Celebration);
    for (const streak of [7, 30, 100, 365, 400]) cases.push({ variant: 'milestone', streak, milestone: streak, ...base } as Celebration);
    for (const shieldsLeft of [0, 1, 2]) for (const days of [['2026-10-20'], ['2026-10-19', '2026-10-20']]) cases.push({ variant: 'shield', streak: 9, best: 9, shieldsLeft, shieldDays: days } as Celebration);
    for (const best of [1, 3, 12, 40]) for (const streak of [1]) cases.push({ variant: 'back', streak, best, shieldsLeft: 0, shieldDays: [] } as Celebration);
    for (const c of cases) for (const g of GENDERS) out.push([c, g, celebrationCopy(c, g as never, t), shareText(c, t)]);
    const l = celebrationLabels(t);
    out.push([l.continue, l.share, l.close]);
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(snap('all'));
    expect(out.length).toBeGreaterThan(50);
  });
});
