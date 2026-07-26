import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRunnerWorkoutPlanFromGenerated } from '../buildRunnerWorkoutPlanFromGenerated';
import { TABATA_CLASSIC } from '../protocols/tabata.constants';

/**
 * Real runtime-path coverage (David 26.07). After the main-wins merge, the SHIPPING
 * mapper is buildRunnerWorkoutPlanFromGenerated (drawer) + the identical home inline
 * copy — NOT the branch's workout-plan.mapper. This locks the graft: gw.tabataBlock
 * must surface as a seg-tabata segment (protocol:'tabata' + protocolConfig) so the
 * runner runs the interval format, instead of the members landing in seg-main.
 */

const gwEx = (id: string, role: 'main' | 'warmup' | 'cooldown' = 'main') =>
  ({
    exercise: {
      id,
      name: { he: id },
      type: 'reps',
      content: {},
      primaryMuscle: 'chest',
      muscleGroups: [],
      execution_methods: [],
      exerciseRole: role,
    },
    method: {},
    sets: 1,
    reps: 20,
    restSeconds: 10,
    isTimeBased: false,
    score: 0,
    reasoning: [],
    exerciseRole: role,
    protocolBlock: 'tabata',
  }) as never;

const gwOf = (exercises: unknown[], over: Record<string, unknown> = {}) =>
  ({
    title: 'test', description: '', exercises,
    estimatedDuration: 15, structure: 'standard', difficulty: 2,
    ...over,
  }) as never;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('buildRunnerWorkoutPlanFromGenerated — tabata graft (shipping runtime path)', () => {
  it('gw.tabataBlock → seg-tabata (protocol:tabata + protocolConfig); members OUT of seg-main', () => {
    const plan = buildRunnerWorkoutPlanFromGenerated(
      gwOf([gwEx('strengthA'), gwEx('t1'), gwEx('t2')], {
        tabataBlock: { config: TABATA_CLASSIC, exerciseIds: ['t1', 't2'] },
      }),
      { id: 'w1' },
    );
    const segs = plan.segments as Array<{ id: string; protocol?: string; protocolConfig?: unknown; exercises: Array<{ id: string }> }>;

    const segTabata = segs.find((s) => s.id === 'seg-tabata');
    expect(segTabata).toBeDefined();
    expect(segTabata!.protocol).toBe('tabata');
    expect(segTabata!.protocolConfig).toEqual(TABATA_CLASSIC);
    expect(segTabata!.exercises.map((e) => e.id).sort()).toEqual(['t1', 't2']);

    // the non-tabata main stays put — the block is additive, not a swallow
    const segMain = segs.find((s) => s.id === 'seg-main');
    expect(segMain!.exercises.map((e) => e.id)).toEqual(['strengthA']);
  });

  it('no tabataBlock → no seg-tabata (field-guard)', () => {
    const plan = buildRunnerWorkoutPlanFromGenerated(gwOf([gwEx('a'), gwEx('b')]), { id: 'w1' });
    expect((plan.segments as Array<{ id: string }>).some((s) => s.id === 'seg-tabata')).toBe(false);
  });

  it('degenerate block (<2 members after filtering) dissolves back into seg-main', () => {
    const plan = buildRunnerWorkoutPlanFromGenerated(
      gwOf([gwEx('a'), gwEx('b')], {
        tabataBlock: { config: TABATA_CLASSIC, exerciseIds: ['a', 'gone'] }, // only 'a' present
      }),
      { id: 'w1' },
    );
    const segs = plan.segments as Array<{ id: string; exercises: Array<{ id: string }> }>;
    expect(segs.some((s) => s.id === 'seg-tabata')).toBe(false);
    expect(segs.find((s) => s.id === 'seg-main')!.exercises.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});
