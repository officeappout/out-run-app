/**
 * i18n wave 2A (namespace `push`): firstWeekCard() snapshot recorded from UNMODIFIED origin/main, BEFORE its copy
 * moved to src/messages/he/push.json. Every day index x workout state x first-name shape (none, blank, a name, a name
 * with ICU-looking characters). The extraction must keep it byte-identical. Pure function, no clock.
 */
import { expect, it } from 'vitest';
import { firstWeekCard } from '../first-week.core';

it('firstWeekCard — every day, every name shape', async () => {
  const names: Array<string | null | undefined> = [undefined, null, '', '   ', 'דנה', '  יואב  ', "O'Neil {x} <b>", '{name}', '#', 'a,b'];
  const days: Array<number | null> = [null, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30];
  const out: unknown[] = [];
  for (const dayIndex of days) {
    for (const hasWorkout of [false, true]) {
      for (const firstName of names) {
        out.push({ dayIndex, hasWorkout, firstName: firstName ?? null, card: firstWeekCard({ dayIndex, hasWorkout, firstName }) });
      }
    }
  }
  await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('./__snapshots__/first-week-card-i18n/card.json');
});
