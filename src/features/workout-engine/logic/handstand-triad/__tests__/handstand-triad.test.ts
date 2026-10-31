import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseRole } from '@/features/content/exercises/core/exercise.types';
import {
  addTriadTrackLevels,
  buildTriadPlan,
  checkTriadEligibility,
  fillTriadPlan,
  getTriadScores,
  primaryAxis,
  rankAxes,
  resolveTriadLevels,
  triadPoolGate,
  type TriadValues,
} from '..';

// Owner's ratings (Drive, "עמידות ידיים" tab) + the approved mobility ladder (31.10), S/B/M.
const ex = (id: string, s: number, b: number, m: number, role: ExerciseRole = 'main', primaryMuscle = 'shoulders'): Exercise =>
  ({
    id,
    exerciseRole: role,
    primaryMuscle,
    targetPrograms: [{ programId: 'handstand', level: Math.round((s + b + m) / 3), strengthScore: s, balanceScore: b, mobilityScore: m }],
  }) as unknown as Exercise;

const CATALOG: Exercise[] = [
  ex('wrist_warmup', 1, 1, 4, 'warmup'),
  ex('upper_stretch', 1, 1, 5, 'cooldown'),
  ex('prayer_stretch', 1, 1, 2),
  ex('rail_opening', 1, 1, 3),
  ex('butcher_block', 1, 1, 5),
  ex('passive_hang', 2, 1, 6),
  ex('prone_ytl', 2, 1, 8),
  ex('hanging_cobra', 4, 1, 10),
  ex('frog', 4, 5, 2),
  ex('crow', 4, 7, 2),
  ex('fall_practice_knees', 5, 6, 7),
  ex('toe_taps', 9, 10, 10),
  ex('heel_pulls', 9, 12, 11),
  ex('free_handstand', 8, 14, 11),
  ex('perfect_line', 10, 15, 15),
  ex('pike_stance', 4, 1, 3),
  ex('wall_walk', 7, 2, 4),
  ex('chest_to_wall', 9, 3, 11),
  ex('shoulder_shrugs_wall', 12, 3, 14),
  ex('pike_pushup', 6, 1, 5),
  ex('scap_pushups', 3, 1, 2),
  ex('hollow_body', 5, 1, 1, 'main', 'core'),
  ex('high_plank', 5, 1, 2, 'main', 'core'),
];

const FLEXIBLE_WEAK: TriadValues = { strength: 4, balance: 6, mobility: 12 };
const STRONG_STIFF: TriadValues = { strength: 12, balance: 6, mobility: 4 };
const BALANCED: TriadValues = { strength: 8, balance: 8, mobility: 8 };

const idsOf = (blocks: ReturnType<typeof fillTriadPlan>) =>
  Object.fromEntries(blocks.map((b) => [b.kind, b.exercises.map((e) => e.id)]));

describe('scores', () => {
  it('reads the highest demand per axis across handstand/HSPU rows; unscored → null', () => {
    const two = {
      targetPrograms: [
        { programId: 'handstand', level: 5, strengthScore: 7, balanceScore: 3, mobilityScore: 7 },
        { programId: 'hspu', level: 6, strengthScore: 7, balanceScore: 3, mobilityScore: 8 },
      ],
    } as unknown as Exercise;
    expect(getTriadScores(two)).toEqual({ strength: 7, balance: 3, mobility: 8 });
    expect(getTriadScores({ targetPrograms: [{ programId: 'push', level: 5 }] } as unknown as Exercise)).toBeNull();
  });
  it('ignores non-handstand rows (stale scores after a program change) and half-rated rows', () => {
    const stale = { targetPrograms: [{ programId: 'push', level: 5, strengthScore: 3, balanceScore: 9, mobilityScore: 3 }] } as unknown as Exercise;
    expect(getTriadScores(stale)).toBeNull();
    const half = { targetPrograms: [{ programId: 'handstand', level: 5, balanceScore: 12 }] } as unknown as Exercise;
    expect(getTriadScores(half)).toBeNull();
  });
  it('primary axis = highest demand; a stretch is mobility, a free handstand is balance', () => {
    expect(primaryAxis({ strength: 1, balance: 1, mobility: 8 })).toBe('mobility');
    expect(primaryAxis({ strength: 8, balance: 14, mobility: 11 })).toBe('balance');
  });
});

describe('levels', () => {
  it('reads the hidden track levels, falls back to the handstand level, then base', () => {
    const m = new Map([['handstand', 6]]);
    addTriadTrackLevels(m, { handstand: { triad: { mobility: 11 } } }, true);
    expect(resolveTriadLevels(m, 2)).toEqual({ strength: 6, balance: 6, mobility: 11 });
    expect(resolveTriadLevels(undefined, 3)).toEqual({ strength: 3, balance: 3, mobility: 3 });
    expect(resolveTriadLevels(new Map([['hspu', 9]]), 3, 'hspu')).toEqual({ strength: 9, balance: 9, mobility: 9 });
  });
  it('ranks the weakest / strongest axis; all equal → no emphasis', () => {
    expect(rankAxes(STRONG_STIFF)).toEqual({ weakest: 'mobility', strongest: 'strength' });
    expect(rankAxes(BALANCED)).toEqual({ weakest: null, strongest: null });
  });
});

describe('eligibility', () => {
  it('a low score never blocks: a pure stretch is open to a weak but flexible user', () => {
    expect(checkTriadEligibility({ strength: 1, balance: 1, mobility: 8 }, FLEXIBLE_WEAK).eligible).toBe(true);
  });
  it('every axis must fit; +1 only on the block axis', () => {
    const chestToWall = { strength: 9, balance: 3, mobility: 11 };
    expect(checkTriadEligibility(chestToWall, { strength: 8, balance: 8, mobility: 11 })).toMatchObject({ eligible: false, axis: 'strength' });
    expect(checkTriadEligibility(chestToWall, { strength: 8, balance: 8, mobility: 11 }, { blockAxis: 'strength' }).eligible).toBe(true);
    expect(checkTriadEligibility(chestToWall, { strength: 8, balance: 8, mobility: 11 }, { blockAxis: 'mobility' }).eligible).toBe(false);
  });
  it('peak skills (balance ≥ 13) get no tolerance', () => {
    const free = { strength: 8, balance: 14, mobility: 11 };
    expect(checkTriadEligibility(free, { strength: 12, balance: 13, mobility: 12 }, { blockAxis: 'balance' }).eligible).toBe(false);
    expect(checkTriadEligibility(free, { strength: 12, balance: 14, mobility: 11 }).eligible).toBe(true);
  });
  it('strong but stiff never gets the free handstand (no banana handstand)', () => {
    expect(checkTriadEligibility({ strength: 8, balance: 14, mobility: 11 }, { strength: 15, balance: 15, mobility: 4 }).eligible).toBe(false);
  });
  it('fall-practice gate: balance ≥ 8 blocked only when known not done', () => {
    const toeTaps = { strength: 9, balance: 10, mobility: 10 };
    const lv = { strength: 10, balance: 10, mobility: 10 };
    expect(checkTriadEligibility(toeTaps, lv, { fallPracticeDone: false })).toMatchObject({ eligible: false, reason: 'needs_fall_practice' });
    expect(checkTriadEligibility(toeTaps, lv, { fallPracticeDone: true }).eligible).toBe(true);
    expect(checkTriadEligibility(toeTaps, lv).eligible).toBe(true);
  });
});

describe('session skeleton', () => {
  it('standalone = 6 blocks in the legacy order', () => {
    expect(buildTriadPlan(BALANCED).map((b) => b.kind)).toEqual(['warmup', 'mobility', 'balance', 'strength', 'line', 'cooldown']);
  });
  it('weakest axis gets +1 set and a second exercise; strongest gets maintenance', () => {
    const plan = buildTriadPlan(STRONG_STIFF);
    expect(plan.find((b) => b.kind === 'mobility')).toMatchObject({ sets: 4, slots: 2, emphasis: 'weakest' });
    expect(plan.find((b) => b.kind === 'strength')).toMatchObject({ sets: 2, slots: 1, emphasis: 'strongest' });
    expect(plan.find((b) => b.kind === 'line')).toMatchObject({ sets: 3, slots: 1 });
  });
  it('balanced profile: no emphasis anywhere', () => {
    expect(buildTriadPlan(BALANCED).every((b) => !b.emphasis)).toBe(true);
  });
  it('block mode (inside another workout) = warmup + the two weakest axes', () => {
    expect(buildTriadPlan(STRONG_STIFF, 'block').map((b) => b.kind)).toEqual(['warmup', 'mobility', 'balance']);
    expect(buildTriadPlan(FLEXIBLE_WEAK, 'block').map((b) => b.kind)).toEqual(['warmup', 'strength', 'balance']);
  });
});

describe('3 profiles get different, safe sessions', () => {
  it('flexible-weak: hard stretches, easy strength, nothing above S4', () => {
    const blocks = fillTriadPlan(buildTriadPlan(FLEXIBLE_WEAK), CATALOG, FLEXIBLE_WEAK);
    const ids = idsOf(blocks);
    expect(ids.warmup).toEqual(['wrist_warmup']);
    expect(ids.cooldown).toEqual(['upper_stretch']);
    expect(ids.mobility[0]).toBe('hanging_cobra'); // M10 + S4: open to flexible-weak
    expect(ids.strength).toEqual(['pike_stance', 'scap_pushups']); // weakest axis → 2 exercises
    expect(blocks.find((b) => b.kind === 'strength')?.emphasis).toBe('weakest');
    const all = blocks.flatMap((b) => b.exercises);
    expect(all.every((e) => getTriadScores(e)!.strength <= FLEXIBLE_WEAK.strength + 1)).toBe(true);
  });
  it('strong-stiff: mobility doubled with the easy stretches (M ≤ 4+1), no wall/free handstand work', () => {
    const blocks = fillTriadPlan(buildTriadPlan(STRONG_STIFF), CATALOG, STRONG_STIFF);
    const ids = idsOf(blocks);
    expect(ids.mobility).toEqual(['butcher_block', 'rail_opening']);
    expect(ids.mobility).not.toContain('hanging_cobra');
    expect(ids.strength).toEqual(['wall_walk']);
    expect(ids.line).toEqual(['hollow_body']);
    const all = blocks.flatMap((b) => b.exercises.map((e) => e.id));
    expect(all).not.toContain('chest_to_wall');
    expect(all).not.toContain('free_handstand');
  });
  it('balanced 8/8/8: balance block reaches crow / fall practice, never free handstand', () => {
    const blocks = fillTriadPlan(buildTriadPlan(BALANCED), CATALOG, BALANCED);
    const ids = idsOf(blocks);
    expect(ids.balance).toEqual(['crow']);
    expect(ids.mobility).toEqual(['prone_ytl']); // M8, hardest within 8+1; cobra (M10) not yet
    expect(ids.strength).toEqual(['wall_walk']);
    expect(ids.line).toEqual(['hollow_body']);
  });
  it('no exercise twice in a session', () => {
    for (const lv of [FLEXIBLE_WEAK, STRONG_STIFF, BALANCED]) {
      const all = fillTriadPlan(buildTriadPlan(lv), CATALOG, lv).flatMap((b) => b.exercises.map((e) => e.id));
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe('pool gate (ContextualEngine hook)', () => {
  const base = {
    enabled: true,
    resolvedDomain: 'handstand',
    userProgramLevels: new Map([['handstand', 8]]),
    baseUserLevel: 1,
    levelTolerance: 3,
  };
  const find = (id: string) => CATALOG.find((e) => e.id === id)!;
  it('flag off, exercise resolved to another domain, or unscored → not applicable (legacy path)', () => {
    expect(triadPoolGate({ ...base, enabled: false, exercise: find('crow') })).toBeNull();
    expect(triadPoolGate({ ...base, resolvedDomain: 'push', exercise: find('crow') })).toBeNull();
    expect(triadPoolGate({ ...base, resolvedDomain: null, exercise: find('crow') })).toBeNull();
    expect(triadPoolGate({ ...base, exercise: { id: 'x', targetPrograms: [] } as unknown as Exercise })).toBeNull();
  });
  it('drops above-level on any axis, keeps in-window, drops too easy on the primary axis', () => {
    expect(triadPoolGate({ ...base, exercise: find('chest_to_wall') })).toBe(false); // S9 > 8
    expect(triadPoolGate({ ...base, exercise: find('crow') })).toBe(true); // B7 within 8−3..8
    expect(triadPoolGate({ ...base, exercise: find('frog') })).toBe(true); // B5 = 8−3
    expect(triadPoolGate({ ...base, exercise: find('wall_walk') })).toBe(true); // primary S7 within 8−3..8 → keep
    expect(triadPoolGate({ ...base, exercise: find('hollow_body') })).toBe(true); // primary S5 = 8−3
  });
  it('too easy on the primary axis is dropped', () => {
    expect(triadPoolGate({ ...base, userProgramLevels: new Map([['handstand', 10]]), exercise: find('pike_stance') })).toBe(false); // primary S4 < 10−3
  });
  it('HSPU session uses the HSPU level, not the base level', () => {
    const hspuRow = { id: 'c2w', exerciseRole: 'main', targetPrograms: [{ programId: 'hspu', level: 7, strengthScore: 9, balanceScore: 3, mobilityScore: 8 }] } as unknown as Exercise;
    expect(triadPoolGate({ ...base, resolvedDomain: 'hspu', userProgramLevels: new Map([['hspu', 9]]), baseUserLevel: 3, exercise: hspuRow })).toBe(true);
  });
  it('warmup/cooldown rows skip the too-easy floor', () => {
    expect(triadPoolGate({ ...base, exercise: find('wrist_warmup') })).toBe(true);
  });
});
