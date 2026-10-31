import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseRole } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../workout-generator.types';
import { addTriadTrackLevels } from '../triad-track';
import { applyTriadSkeleton, type TriadWorkoutOptions } from '../triad-workout';

const parkMethod = { location: 'park', locationMapping: ['park'], requiredGearType: 'user_gear', gearIds: [], equipmentIds: [], methodName: { he: 'x' } };
const ex = (id: string, s: number, b: number, m: number, primaryMuscle = 'shoulders', type: 'time' | 'reps' = 'time', role: ExerciseRole = 'main'): Exercise =>
  ({
    id, type, exerciseRole: role, primaryMuscle, name: { he: id },
    execution_methods: [parkMethod],
    targetPrograms: [{ programId: 'handstand', level: Math.round((s + b + m) / 3), strengthScore: s, balanceScore: b, mobilityScore: m }],
  }) as unknown as Exercise;

const POOL: Exercise[] = [
  ex('prayer', 1, 1, 2), ex('rail', 1, 1, 3), ex('butcher', 1, 1, 5), ex('hang', 2, 1, 6), ex('prone_raises', 2, 1, 8, 'shoulders', 'reps'), ex('cobra', 4, 1, 10),
  ex('frog', 4, 5, 2), ex('crow', 4, 7, 2), ex('toe_taps', 9, 10, 10), ex('free_hs', 8, 14, 11),
  ex('scap_pushup', 3, 1, 2, 'shoulders', 'reps'), ex('pike_stance', 4, 1, 3), ex('pike_pushup', 6, 1, 5, 'shoulders', 'reps'), ex('wall_walk', 7, 2, 4, 'shoulders', 'reps'),
  ex('hollow', 5, 1, 1, 'core'), ex('plank', 5, 1, 2, 'core'),
];

const generated = (): GeneratedWorkout =>
  ({
    difficulty: 2,
    pipelineLog: [],
    exercises: [
      { exercise: ex('wrist_warmup', 1, 1, 1, 'shoulders', 'time', 'warmup'), exerciseRole: 'warmup' },
      { exercise: ex('generic_push', 1, 1, 1), exerciseRole: 'main' },
      { exercise: ex('stretch', 1, 1, 1, 'shoulders', 'time', 'cooldown'), exerciseRole: 'cooldown' },
    ] as unknown as WorkoutExercise[],
  }) as unknown as GeneratedWorkout;

const opts = (triad: Record<string, number>, over: Partial<TriadWorkoutOptions> = {}): TriadWorkoutOptions => {
  const levels = new Map([['handstand', 6]]);
  addTriadTrackLevels(levels, { handstand: { triad } }, true);
  return { enabled: true, activeProgramId: 'handstand', pool: POOL, location: 'park', availableEquipment: [], userProgramLevels: levels, difficulty: 2, ...over };
};
const mainIds = (w: GeneratedWorkout) => w.exercises.filter((e) => e.exerciseRole === 'main').map((e) => e.exercise.id);

describe('applyTriadSkeleton', () => {
  it('flag off, or not a handstand session → workout untouched', () => {
    const w = generated();
    expect(applyTriadSkeleton(w, opts({ strength: 8, balance: 8, mobility: 8 }, { enabled: false }))).toBeNull();
    expect(applyTriadSkeleton(w, opts({ strength: 8, balance: 8, mobility: 8 }, { activeProgramId: 'push' }))).toBeNull();
    expect(mainIds(w)).toEqual(['generic_push']);
  });
  it('keeps warm-up first and cool-down last; main block in skeleton order', () => {
    const w = generated();
    expect(applyTriadSkeleton(w, opts({ strength: 8, balance: 8, mobility: 8 }))).toMatch(/^handstand_triad:/);
    expect(w.exercises[0].exercise.id).toBe('wrist_warmup');
    expect(w.exercises[w.exercises.length - 1].exercise.id).toBe('stretch');
    expect(mainIds(w)).toEqual(['prone_raises', 'crow', 'wall_walk', 'hollow']);
    expect(w.exercises.find((e) => e.exercise.id === 'crow')?.sets).toBe(3);
  });
  it('strong-stiff: mobility doubled with easy stretches, strength on maintenance', () => {
    const w = generated();
    applyTriadSkeleton(w, opts({ strength: 12, balance: 6, mobility: 4 }));
    const byId = Object.fromEntries(w.exercises.map((e) => [e.exercise.id, e]));
    expect(mainIds(w).slice(0, 2)).toEqual(['butcher', 'rail']);
    expect(byId.butcher.sets).toBe(4);
    expect(byId.wall_walk.sets).toBe(2);
    expect(mainIds(w)).not.toContain('free_hs');
  });
  it('flexible-weak: strength doubled, hard stretch, nothing above the user on any axis (+1 on block axis)', () => {
    const w = generated();
    applyTriadSkeleton(w, opts({ strength: 4, balance: 6, mobility: 12 }));
    expect(mainIds(w)).toContain('cobra');
    const strengthBlock = w.exercises.filter((e) => e.reasoning?.[0]?.startsWith('handstand_triad:strength'));
    expect(strengthBlock.map((e) => e.exercise.id)).toEqual(['pike_stance', 'scap_pushup']);
    expect(strengthBlock.every((e) => e.sets === 4)).toBe(true);
  });
  it('too few triad exercises → generator block kept (never worse than today)', () => {
    const w = generated();
    expect(applyTriadSkeleton(w, opts({ strength: 8, balance: 8, mobility: 8 }, { pool: [POOL[0]] }))).toBeNull();
    expect(mainIds(w)).toEqual(['generic_push']);
  });
});

describe('applyTriadSkeleton: review fixes', () => {
  it('Firestore program id resolves like the slug; reserve cleared; triad scores high', () => {
    const w = { ...generated(), reserveExercises: [{ exercise: ex('generic_reserve', 1, 1, 1) }] } as unknown as GeneratedWorkout;
    expect(applyTriadSkeleton(w, opts({ strength: 8, balance: 8, mobility: 8 }, { activeProgramId: 'handstand' }))).not.toBeNull();
    expect(w.reserveExercises).toEqual([]);
    expect(w.exercises.filter((e) => e.exerciseRole === 'main').every((e) => e.score > 100)).toBe(true);
  });
  it('avoidIds lose ties, so a second trio option differs', () => {
    const pool = [...POOL, ex('crow_twin', 4, 7, 2)];
    const a = generated();
    applyTriadSkeleton(a, opts({ strength: 8, balance: 8, mobility: 8 }, { pool }));
    const b = generated();
    applyTriadSkeleton(b, opts({ strength: 8, balance: 8, mobility: 8 }, { pool, avoidIds: new Set(mainIds(a)) }));
    expect(mainIds(b)).toContain('crow_twin');
    expect(mainIds(b)).not.toContain('crow');
  });
});
