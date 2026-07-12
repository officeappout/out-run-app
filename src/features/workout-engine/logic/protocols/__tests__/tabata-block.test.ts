import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTabataBlock, partitionByTabataBlock } from '../tabata.block';
import { TABATA_CLASSIC, TABATA_BLOCK_SECONDS } from '../tabata.constants';
import { calculateEstimatedDuration } from '../../workout-budgeting.utils';
import { enforceVolumeCap } from '@/features/workout-engine/core/presentation/PresentationFormatter';
import type { WorkoutExercise } from '../../workout-generator.types';

const mainEx = (id: string, score: number, over: Record<string, unknown> = {}): WorkoutExercise =>
  ({
    exercise: { id, name: { he: id }, movementGroup: 'horizontal_push', secondsPerRep: 3, symmetry: 'bilateral' },
    exerciseRole: 'main',
    sets: 3,
    reps: 8,
    restSeconds: 120,
    isTimeBased: false,
    score,
    priority: 'compound',
    tier: 'match',
    reasoning: [],
    ...over,
  } as never);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('buildTabataBlock', () => {
  it('picks the top-scored ≤4 non-elite mains, stamps them, returns classic config', () => {
    const exs = [
      mainEx('a', 50), mainEx('b', 90), mainEx('c', 70),
      mainEx('elite-1', 99, { tier: 'elite' }), // excluded: elite
      mainEx('d', 60), mainEx('e', 40),
      mainEx('warm', 80, { exerciseRole: 'warmup' }), // excluded: not main
    ];
    const block = buildTabataBlock('tabata', exs, {});
    expect(block).toBeDefined();
    expect(block!.config).toEqual(TABATA_CLASSIC);
    expect(block!.exerciseIds).toEqual(['b', 'c', 'd', 'a']); // score desc, max 4
    for (const id of block!.exerciseIds) {
      const member = exs.find((e) => e.exercise.id === id)!;
      expect(member.protocolBlock).toBe('tabata');
    }
    expect(exs.find((e) => e.exercise.id === 'elite-1')!.protocolBlock).toBeUndefined();
    expect(exs.find((e) => e.exercise.id === 'e')!.protocolBlock).toBeUndefined();
  });

  it('returns undefined (stamping nothing) when setType is not tabata', () => {
    const exs = [mainEx('a', 50), mainEx('b', 60)];
    expect(buildTabataBlock('straight', exs, {})).toBeUndefined();
    expect(exs.every((e) => !e.protocolBlock)).toBe(true);
  });

  it('blast intent takes precedence — no block', () => {
    const exs = [mainEx('a', 50), mainEx('b', 60)];
    expect(buildTabataBlock('tabata', exs, { intentMode: 'blast' })).toBeUndefined();
    expect(exs.every((e) => !e.protocolBlock)).toBe(true);
  });

  it('fewer than 2 eligible mains → undefined (caller reverts to straight)', () => {
    expect(buildTabataBlock('tabata', [mainEx('a', 50)], {})).toBeUndefined();
    expect(buildTabataBlock('tabata', [mainEx('a', 50), mainEx('b', 60, { tier: 'elite' })], {})).toBeUndefined();
  });

  it("ELIGIBILITY (David 12.07): max-effort skills are OUT via the engine's isometric cap", () => {
    // Corpus-faithful shapes: planche is spelled פלאנץ׳ and filed under
    // horizontal_push; one-arm holds are mislabeled bilateral — only the
    // name heuristic in getIsometricTimeCap catches them (cap 15 < 20).
    const planche = mainEx('planche-tuck', 95, {
      isTimeBased: true,
      exercise: { id: 'planche-tuck', name: { he: 'פלאנץ׳ בטאק' }, movementGroup: 'horizontal_push', symmetry: 'bilateral' },
    });
    const frontLeverRaise = mainEx('fl-raise', 90, {
      exercise: { id: 'fl-raise', name: { he: 'הרמות פרונט לבר' }, movementGroup: 'horizontal_pull', symmetry: 'bilateral' },
    });
    const oneArmHold = mainEx('oa-90', 85, {
      isTimeBased: true,
      exercise: { id: 'oa-90', name: { he: 'החזקת מתח יד אחת ב-90°' }, movementGroup: 'vertical_pull', symmetry: 'bilateral' },
    });
    const plank = mainEx('plank', 60, {
      isTimeBased: true,
      tier: 'easy',
      exercise: { id: 'plank', name: { he: 'פלאנק' }, movementGroup: 'core', symmetry: 'bilateral' },
    });
    const pushups = mainEx('pushups', 55, {
      exercise: { id: 'pushups', name: { he: 'שכיבות סמיכה' }, movementGroup: 'horizontal_push', symmetry: 'bilateral' },
    });

    const block = buildTabataBlock('tabata', [planche, frontLeverRaise, oneArmHold, plank, pushups], {});
    expect(block).toBeDefined();
    // The three skills are OUT despite outscoring everyone; plank+pushups IN.
    expect(block!.exerciseIds.sort()).toEqual(['plank', 'pushups']);
  });

  it('ELIGIBILITY: a hard-tier HOLD is out (5-10s prescription), hard-tier REPS stay in', () => {
    const hardHold = mainEx('hard-hold', 90, {
      isTimeBased: true, tier: 'hard',
      exercise: { id: 'hard-hold', name: { he: 'החזקת ליבה' }, movementGroup: 'core', symmetry: 'bilateral' },
    });
    const hardReps = mainEx('hard-reps', 80, { tier: 'hard' });
    const easyA = mainEx('easy-a', 70);
    const block = buildTabataBlock('tabata', [hardHold, hardReps, easyA], {});
    expect(block).toBeDefined();
    expect(block!.exerciseIds.sort()).toEqual(['easy-a', 'hard-reps']);
  });

  it('COMPOSITION: interval costs must tile rounds — unilateral counts double', () => {
    const uni = (id: string, score: number) =>
      mainEx(id, score, { exercise: { id, name: { he: id }, movementGroup: 'core', symmetry: 'unilateral' } });

    // [bi(90), uni(80), bi(70)]: best subset = all three (cycle cost 4 | 8).
    const b1 = buildTabataBlock('tabata', [mainEx('a', 90), uni('u', 80), mainEx('b', 70)], {});
    expect(b1!.exerciseIds.sort()).toEqual(['a', 'b', 'u']);

    // [bi(90), uni(80)] alone: cycle cost 3 ∤ 8 and no smaller valid subset → revert.
    expect(buildTabataBlock('tabata', [mainEx('a', 90), uni('u', 80)], {})).toBeUndefined();

    // Two unilaterals: cycle cost 4 | 8 → valid pair.
    const b2 = buildTabataBlock('tabata', [uni('u1', 90), uni('u2', 80)], {});
    expect(b2!.exerciseIds.sort()).toEqual(['u1', 'u2']);
  });
});

describe('partitionByTabataBlock (mapper side)', () => {
  const ui = (id: string) => ({ id, name: id });

  it('splits by exerciseIds, order preserved on both sides', () => {
    const mains = [ui('a'), ui('b'), ui('c'), ui('d')];
    const { tabata, rest } = partitionByTabataBlock(mains, {
      config: TABATA_CLASSIC, exerciseIds: ['b', 'd'],
    });
    expect(tabata.map((e) => e.id)).toEqual(['b', 'd']);
    expect(rest.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('no block → everything stays in rest', () => {
    const mains = [ui('a'), ui('b')];
    expect(partitionByTabataBlock(mains, undefined)).toEqual({ tabata: [], rest: mains });
  });

  it('degenerate block (<2 survivors after swap) dissolves back into main', () => {
    const mains = [ui('a'), ui('swapped-in')];
    const { tabata, rest } = partitionByTabataBlock(mains, {
      config: TABATA_CLASSIC, exerciseIds: ['a', 'gone-after-swap'],
    });
    expect(tabata).toEqual([]);
    expect(rest.map((e) => e.id)).toEqual(['a', 'swapped-in']);
  });
});

describe('duration pricing — block is a fixed constant', () => {
  it('members cost (work+rest)×rounds once, NOT sets×reps×rest each', () => {
    // Two heavy mains as straight sets: 2 × (3×8×3s + 3×120s) = 864s ≈ 15min
    const straight = [mainEx('a', 50), mainEx('b', 60)];
    const straightMin = calculateEstimatedDuration(straight);

    // The same two as tabata members: fixed 240s = 4min + no per-set math
    const blocked = [
      mainEx('a', 50, { protocolBlock: 'tabata' }),
      mainEx('b', 60, { protocolBlock: 'tabata' }),
    ];
    const blockedMin = calculateEstimatedDuration(blocked);

    expect(blockedMin).toBe(Math.ceil(TABATA_BLOCK_SECONDS / 60)); // 4
    expect(straightMin).toBeGreaterThan(blockedMin + 8); // per-set math is gone
  });

  it('block + straight mains: block adds exactly its fixed cost + one transition unit', () => {
    const straightOnly = [mainEx('a', 50), mainEx('b', 60)];
    const withBlock = [
      mainEx('a', 50), mainEx('b', 60),
      mainEx('t1', 70, { protocolBlock: 'tabata' }),
      mainEx('t2', 80, { protocolBlock: 'tabata' }),
    ];
    const delta = calculateEstimatedDuration(withBlock) - calculateEstimatedDuration(straightOnly);
    // fixed 240s + one 30s transition into the block = 270s = 4.5 → ±rounding
    expect(delta).toBeGreaterThanOrEqual(4);
    expect(delta).toBeLessThanOrEqual(5);
  });
});

describe('volume guard — block members are untouchable', () => {
  it('Phases A/B/C never remove or trim block members even at an impossible cap', () => {
    const workout = {
      exercises: [
        mainEx('t1', 10, { protocolBlock: 'tabata' }), // lowest scores — prime drop targets
        mainEx('t2', 20, { protocolBlock: 'tabata' }),
        mainEx('s1', 90), mainEx('s2', 80), mainEx('s3', 70),
      ],
      estimatedDuration: 0,
      totalPlannedSets: 0,
    } as never;
    const result = enforceVolumeCap(workout, { durationCap: 5 }) as {
      exercises: Array<{ exercise: { id: string }; protocolBlock?: string; sets: number }>;
    };
    const members = result.exercises.filter((e) => e.protocolBlock === 'tabata');
    expect(members.map((e) => e.exercise.id).sort()).toEqual(['t1', 't2']); // survived
    expect(members.every((e) => e.sets === 3)).toBe(true); // sets untouched (Phase B skip)
  });
});
