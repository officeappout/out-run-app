/**
 * Module-level translated constants (action chips, reminder plan, age labels, what-now Kelly chips…):
 * Hebrew output pinned from unmodified main, so turning them into locale-following getters cannot move it.
 * `v()` unwraps a value that later became a function.
 */
import { describe, expect, it } from 'vitest';
import { COACH_ACTIONS } from '@/lib/ai/coach/action-chips';
import { EMPTY_REMINDER_PLAN } from '@/features/user/onboarding/utils/wizard-reminder-plan';
import { AGE_BRACKET_LABELS_HE } from '@/features/user/onboarding/utils/goal-note';
import { whatNowKellyChips, firstWorkoutNoteText, starterChipsFor, firstWorkoutNote } from '@/features/user/onboarding/services/entry-whatnow';

const v = (x: unknown): unknown => (typeof x === 'function' ? (x as () => unknown)() : x);
const dump = (x: unknown) => JSON.stringify(x, null, 1) + '\n';

describe('module constants: Hebrew stays pinned', () => {
  it('coach action chips', async () => {
    await expect(dump(COACH_ACTIONS)).toMatchFileSnapshot('./__snapshots__/module-constants/coach-actions.json');
  });
  it('onboarding constants', async () => {
    await expect(dump({
      EMPTY_REMINDER_PLAN, AGE_BRACKET_LABELS_HE,
      chips: v(whatNowKellyChips), note: v(firstWorkoutNoteText),
      starter: starterChipsFor('entry'), noteFn: firstWorkoutNote(true, false),
    })).toMatchFileSnapshot('./__snapshots__/module-constants/onboarding.json');
  });
});
