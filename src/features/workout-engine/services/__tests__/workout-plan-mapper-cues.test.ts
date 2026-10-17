import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildWorkoutPlanFromGenerated } from '../workout-plan.mapper';
import { buildRunnerWorkoutPlanFromGenerated } from '../../logic/buildRunnerWorkoutPlanFromGenerated';
import type { GeneratedWorkout } from '../../logic/workout-generator.types';

/**
 * Live player showed no דגשים: the plan builders' resolveHighlights only read
 * strings / { male, female }, but normalizeExercise had already turned every
 * method cue into { he, en } → all resolved to '' and were filtered out. The
 * method's specificCues were never read, and the prep note came from the first
 * method that had one. Both builders now share resolveExerciseCues and carry
 * the selected method's notificationText as `prepNote`.
 */

const gwWith = (exercise: Record<string, unknown>, method: Record<string, unknown>): GeneratedWorkout =>
  ({
    title: 't', description: '', estimatedDuration: 15, structure: 'standard', difficulty: 2,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: false, totalPlannedSets: 3,
    exercises: [{
      exercise: { id: 'x', name: { he: 'x' }, type: 'reps', exerciseRole: 'main', execution_methods: [], ...exercise },
      method,
      sets: 3, reps: 8, restSeconds: 90, isTimeBased: false, score: 50, reasoning: [],
      priority: 'compound', mechanicalType: 'bent_arm',
    }],
  } as never);

type PlanLike = { segments: Array<{ exercises?: Array<Record<string, unknown>> }> };
const firstEx = (plan: unknown) => (plan as PlanLike).segments.flatMap((s) => s.exercises ?? [])[0];

const builders = [
  ['buildWorkoutPlanFromGenerated', (gw: GeneratedWorkout) => buildWorkoutPlanFromGenerated(gw, 'id')],
  ['buildRunnerWorkoutPlanFromGenerated', (gw: GeneratedWorkout) => buildRunnerWorkoutPlanFromGenerated(gw, { id: 'id' })],
] as const;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each(builders)('%s — cues + prep note', (_name, build) => {
  it('{ he, en } method specificCues become highlights; method highlights become tips', () => {
    const ex = firstEx(build(gwWith({}, {
      specificCues: [{ he: 'גב ישר', en: '' }, { he: 'בטן אסופה', en: '' }],
      highlights: [{ he: 'מצוין לגב', en: '' }],
      notificationText: { he: 'הכינו ספסל', en: '' },
    })));
    expect(ex.highlights).toEqual(['גב ישר', 'בטן אסופה']);
    expect(ex.tips).toEqual(['מצוין לגב']);
    expect(ex.prepNote).toEqual({ he: 'הכינו ספסל', en: '' });
  });

  it('plain string[] method highlights still work', () => {
    const ex = firstEx(build(gwWith({}, { highlights: ['גב ישר'] })));
    expect(ex.highlights).toEqual(['גב ישר']);
  });

  it('splits a jammed single cue', () => {
    const ex = firstEx(build(gwWith({}, { specificCues: [{ he: '- עמדו עם רגל אחת - התחילו מהעקב', en: '' }] })));
    expect(ex.highlights).toEqual(['עמדו עם רגל אחת', 'התחילו מהעקב']);
  });

  it('empty method → exercise content fallback, never instructions sentences', () => {
    const withContent = firstEx(build(gwWith({ content: { highlights: ['דגש תרגיל'] } }, { specificCues: [] })));
    expect(withContent.highlights).toEqual(['דגש תרגיל']);
    const onlyInstr = firstEx(build(gwWith({ content: { instructions: { he: 'משפט. עוד משפט.', en: '' } } }, {})));
    expect(onlyInstr.highlights).toEqual([]);
    expect(onlyInstr.prepNote).toBeNull();
  });
});
