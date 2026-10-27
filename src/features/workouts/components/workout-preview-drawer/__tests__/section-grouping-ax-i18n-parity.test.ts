/**
 * i18n wave 2 batch ax (namespace `library`, preview.section.*): the section titles groupExercisesIntoSections
 * returns (warm-up, superset, straight set, pyramid label, tabata, cool-down) move to the catalog.
 * Snapshot recorded BEFORE the extraction (unmodified main).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupExercisesIntoSections } from '../utils/section-grouping.utils';

const ex = (id: string, over: Record<string, unknown> = {}) =>
  ({ exercise: { id, name: { he: id } }, sets: 3, reps: 8, exerciseRole: 'main', reasoning: [], score: 50, ...over }) as never;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const titles = (list: unknown[]) => groupExercisesIntoSections(list as never).map((s) => ({ id: s.id, title: s.title, rounds: s.rounds }));

it('section titles', async () => {
  const out = {
    full: titles([
      ex('w', { exerciseRole: 'warmup' }),
      ex('a', { pairedWith: 'b' }), ex('b', { pairedWith: 'a' }),
      ex('solo'),
      ex('lonely', { pairedWith: 'ghost' }),
      ex('t1', { protocolBlock: 'tabata' }), ex('t2', { protocolBlock: 'tabata' }),
      ex('c', { exerciseRole: 'cooldown' }),
    ]),
    pyramid: titles([
      ex('p', { pyramidSequence: [{ targetReps: 4 }, { targetReps: 6 }, { targetReps: 8 }] }),
      ex('q', { pyramidSequence: [{ targetHold: 10 }, { targetHold: 20 }] }),
      ex('r', { pairedWith: 'zzz', pyramidSequence: [{ targetReps: 5 }, { targetReps: 7 }] }),
    ]),
    timedMain: groupExercisesIntoSections([ex('a'), ex('b')] as never, { timedMainTitle: 'AMRAP 10' }).map((s) => ({ id: s.id, title: s.title })),
  };
  await expect(`${JSON.stringify(out, null, 1)}\n`).toMatchFileSnapshot('./__snapshots__/section-grouping-ax-i18n/titles.json');
});
