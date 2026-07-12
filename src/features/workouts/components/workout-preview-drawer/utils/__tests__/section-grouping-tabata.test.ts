import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupExercisesIntoSections } from '../section-grouping.utils';

const ex = (id: string, over: Record<string, unknown> = {}) =>
  ({
    exercise: { id, name: { he: id } },
    sets: 3,
    reps: 8,
    exerciseRole: 'main',
    reasoning: [],
    score: 50,
    ...over,
  } as never);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('groupExercisesIntoSections — tabata block (Stage 3 UX)', () => {
  it('pulls marked members into ONE finisher section after the mains, before cooldown', () => {
    const sections = groupExercisesIntoSections([
      ex('w', { exerciseRole: 'warmup' }),
      ex('t1', { protocolBlock: 'tabata' }), // interleaved on purpose
      ex('a'),
      ex('t2', { protocolBlock: 'tabata' }),
      ex('b'),
      ex('c', { exerciseRole: 'cooldown' }),
    ] as never);

    const ids = sections.map((s) => s.id);
    expect(ids).toEqual(['warmup', 'regular-0', 'regular-1', 'tabata', 'cooldown']);
    const tabata = sections.find((s) => s.id === 'tabata')!;
    expect(tabata.exercises.map((e: { exercise: { id: string } }) => e.exercise.id)).toEqual(['t1', 't2']);
    expect(tabata.title).toBe('טבטה');
  });

  it('FIELD-GUARD: workouts without the marker are grouped exactly as before', () => {
    const a = ex('a', { pairedWith: 'b' });
    const b = ex('b', { pairedWith: 'a' });
    const sections = groupExercisesIntoSections([a, b, ex('solo')] as never);
    expect(sections.map((s) => s.id)).toEqual(['superset-0', 'regular-1']);
    expect(sections.some((s) => s.id === 'tabata')).toBe(false);
  });

  it('a marked member never leaks into superset pairing even if pairedWith is set', () => {
    // sortAndPair (service-level) may re-pair AFTER block assembly — the
    // preview must still show the member inside the tabata section only.
    const a = ex('a', { pairedWith: 'b', protocolBlock: 'tabata' });
    const b = ex('b', { pairedWith: 'a' });
    const sections = groupExercisesIntoSections([a, b] as never);
    const tabata = sections.find((s) => s.id === 'tabata')!;
    expect(tabata.exercises).toHaveLength(1);
    // b lost its partner to the block → demoted to straight (existing warn path)
    expect(sections.filter((s) => s.id.startsWith('regular'))).toHaveLength(1);
  });
});
