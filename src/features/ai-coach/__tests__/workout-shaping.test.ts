import { describe, it, expect } from 'vitest';
import { baseDomainOf, minMainExercisesFor, shapeAiWorkout, CIRCUIT_REST_SEC } from '../services/workout-shaping.pure';
import { compactWorkout, hasLevelCeiling } from '../services/workout-tool.pure';

const ex = (id: string, mg: string, role: 'main' | 'warmup' | 'cooldown' = 'main', loc = 'home', extra: Record<string, unknown> = {}) =>
  ({
    exercise: { id, name: { he: id }, movementGroup: mg },
    method: { location: loc, methodName: { he: `${id} בבית` }, gearIds: [], media: { mainVideoUrl: 'v.mp4' } },
    exerciseRole: role,
    sets: 4,
    reps: 8,
    restSeconds: 90,
    isTimeBased: false,
    reasoning: [],
    score: 1,
    ...extra,
  }) as any;

const nameOf = (e: any) => e.exercise.name.he;
const est = (list: any[]) => list.filter((e) => e.exerciseRole === 'main').reduce((s, e) => s + e.sets, 0) + 2;

describe('shapeAiWorkout', () => {
  it('case 5: "אימון בטן" drops off-area mains and refills from the on-area reserve', () => {
    const w: any = {
      title: 'כוח מתפרץ לפני היציאה הביתה',
      structure: 'standard',
      estimatedDuration: 20,
      exercises: [ex('w1', 'vertical_pull', 'warmup'), ex('triceps', 'vertical_push'), ex('rdl', 'hinge'), ex('dragon', 'core'), ex('cd', 'flexibility', 'cooldown')],
      reserveExercises: [ex('pushup', 'horizontal_push'), ex('lsit', 'core'), ex('hollow', 'anti_extension')],
    };
    const { report } = shapeAiWorkout(w, { durationMin: 20, location: 'home', domains: ['core'], title: 'אימון בטן בבית', nameOf, estimateMinutes: est });
    const mains = w.exercises.filter((e: any) => e.exerciseRole === 'main');
    expect(mains.map((e: any) => e.exercise.id)).toEqual(['dragon', 'lsit', 'hollow']);
    expect(mains.every((e: any) => baseDomainOf(e) === 'core')).toBe(true);
    expect(report.removedOffDomain).toEqual(['triceps', 'rdl']);
    expect(w.title).toBe('אימון בטן בבית');
    expect(w.exercises.at(-1).exercise.id).toBe('cd'); // cooldown stays last
  });

  it('case 3/4: a 10-minute request with 1-2 mains becomes a 3-station short circuit from home-only reserve', () => {
    const w: any = {
      title: 'שחרור גב אחרי שמירה',
      structure: 'standard',
      estimatedDuration: 13,
      exercises: [ex('w1', 'horizontal_pull', 'warmup'), ex('archer_row', 'horizontal_pull'), ex('planche_pu', 'horizontal_push')],
      reserveExercises: [
        ex('park_dips', 'vertical_push', 'main', 'park'), // park method → never at home
        ex('tabata', 'core', 'main', 'home', { protocolBlock: 'tabata' }),
        ex('squat', 'squat'),
        ex('lunge', 'lunge'),
      ],
    };
    const { report } = shapeAiWorkout(w, { durationMin: 10, location: 'home', domains: [], title: 'אימון גוף מלא בבית', nameOf, estimateMinutes: est });
    const mains = w.exercises.filter((e: any) => e.exerciseRole === 'main');
    expect(mains.map((e: any) => e.exercise.id)).toEqual(['archer_row', 'planche_pu', 'squat']);
    expect(mains.every((e: any) => e.sets === 2 && e.restSeconds === CIRCUIT_REST_SEC)).toBe(true);
    expect(w.structure).toBe('circuit');
    expect(report).toMatchObject({ shortCircuit: true, shortOfMinimum: false, addedFromReserve: ['squat'], titleReplaced: true });
    expect(w.estimatedDuration).toBe(8);
    expect(w.title).toBe('אימון גוף מלא בבית');
  });

  it('reports an honest shortfall when the reserve has nothing that fits', () => {
    const w: any = { title: 't', structure: 'standard', estimatedDuration: 10, exercises: [ex('a', 'core')], reserveExercises: [ex('b', 'squat')] };
    const { report } = shapeAiWorkout(w, { durationMin: 10, location: 'home', domains: ['core'], title: 'אימון בטן בבית', nameOf, estimateMinutes: est });
    expect(report.shortOfMinimum).toBe(true);
    expect(w.exercises.filter((e: any) => e.exerciseRole === 'main')).toHaveLength(1);
  });

  it('minimum mains by length', () => {
    expect(minMainExercisesFor(10)).toBe(3);
    expect(minMainExercisesFor(15)).toBe(4);
    expect(minMainExercisesFor(20)).toBe(0);
  });
});

describe('compactWorkout with details', () => {
  it('carries method, method location, gear, video, area + the request and the level-ceiling flag', () => {
    const w: any = {
      title: 'אימון בטן בבית',
      estimatedDuration: 11,
      structure: 'circuit',
      exercises: [ex('w', 'core', 'warmup'), ex('dragon', 'core'), ex('cd', 'flexibility', 'cooldown')],
      decisionRecord: { v: 1, seed: 1, reasons: [{ code: 'LEVEL_CEILING' }], expect: {} },
    };
    expect(hasLevelCeiling(w)).toBe(true);
    const c = compactWorkout('ai-x-123456', 'home', w, nameOf, {
      methodName: (e: any) => e.method.methodName.he,
      gearLabels: () => ['ספה'],
      area: (e: any) => baseDomainOf(e),
      requestedMinutes: 10,
      domains: ['core'],
      difficulty: 2,
    });
    expect(c.exercises).toEqual([{ name: 'dragon', sets: 4, reps: 8, seconds: null, method: 'dragon בבית', methodLocation: 'home', gear: ['ספה'], video: true, area: 'core' }]);
    expect(c).toMatchObject({ minutes: 11, requestedMinutes: 10, domains: ['core'], difficulty: 2, structure: 'circuit', warmupCount: 1, cooldownCount: 1, levelCeiling: true });
  });
});
