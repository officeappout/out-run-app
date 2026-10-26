/**
 * Cool-down stretch videos follow the workout's body focus (owner 26.10, same rule as the
 * warm-up guides): upper → upper, lower → lower, full body → both (upper, then lower).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));

import { pickCooldownGuides } from '../cooldown-guide.utils';
import { appendCooldownExercises } from '../cooldown.service';
import { applyDomainPrioritySort } from '../../logic/workout-sorting.utils';
import { planLocationSwap } from '@/features/workouts/components/workout-preview-drawer/location-gate/plan-location-swap';
import type { GeneratedWorkout } from '../../logic/workout-generator.types';

const media = (s: number) => ({ mainVideoUrl: `https://cdn/${s}.mp4`, videoDurationSeconds: s });
const park = (s: number) => ({ location: 'park', locationMapping: ['park', 'street'], gearIds: [], equipmentIds: [], media: media(s) });
const home = (s: number) => ({ location: 'home', locationMapping: [], gearIds: [], equipmentIds: [], media: media(s) });
// Real ids: the upper doc's id sorts AFTER the lower one's, so order must come from focus, not id.
const upper = { id: 'ETMVVSpt0lIpeF3mkEn6', name: { he: 'מתיחות פלג גוף עליון' }, isFollowAlong: true, exerciseRole: 'cooldown', movementGroup: 'flexibility', tags: ['cooldown_upper', 'stretching'], execution_methods: [park(333), home(333)] } as any;
const lower = { id: 'cooldown-stretch-lower', name: { he: 'מתיחות פלג גוף תחתון' }, isFollowAlong: true, exerciseRole: 'cooldown', movementGroup: 'flexibility', tags: ['cooldown_lower', 'stretching'], execution_methods: [park(260), home(260)] } as any;
const pool = [lower, upper];
const mainEx = (id: string, movementGroup: string) => ({ id, name: { he: id }, movementGroup, execution_methods: [park(10)] }) as any;
const mainWE = (id: string, mg: string): any => ({
  exercise: mainEx(id, mg), method: park(10), mechanicalType: 'none', sets: 3, reps: 10, isTimeBased: false,
  restSeconds: 60, priority: 'compound', score: 1, reasoning: [], exerciseRole: 'main',
});

describe('pickCooldownGuides — by body focus', () => {
  const ids = (mains: any[], loc = 'park') => pickCooldownGuides(pool, loc as any, mains).map((g) => g.exercise.id);
  it('upper → upper', () => expect(ids([mainEx('a', 'vertical_pull')])).toEqual([upper.id]));
  it('lower → lower', () => expect(ids([mainEx('a', 'squat')])).toEqual([lower.id]));
  it('full → upper then lower', () => expect(ids([mainEx('a', 'squat'), mainEx('b', 'horizontal_push')])).toEqual([upper.id, lower.id]));
  it('no focus → one video (first by id, as before)', () => expect(ids([mainEx('a', 'core')])).toHaveLength(1));
  it('wanted side not filmed → one video of what exists', () => {
    expect(pickCooldownGuides([upper], 'park', [mainEx('a', 'squat')]).map((g) => g.exercise.id)).toEqual([upper.id]);
  });
  it('home picks the home method', () => {
    const [g] = pickCooldownGuides(pool, 'home', [mainEx('a', 'squat')]);
    expect(g.method.location).toBe('home');
  });
});

describe('appendCooldownExercises — focus videos', () => {
  const run = (loc: string, ...mains: any[]) => {
    const w = { exercises: mains } as unknown as GeneratedWorkout;
    appendCooldownExercises(w, pool, { availableEquipment: [] } as any, loc as any, 15);
    return applyDomainPrioritySort(w.exercises).filter((e) => e.exerciseRole === 'cooldown');
  };
  it('full body at the park → both videos, upper first, each lasting its clip; mains kept', () => {
    const cool = run('park', mainWE('m1', 'squat'), mainWE('m2', 'vertical_pull'));
    expect(cool.map((e) => [e.exercise.id, e.reps])).toEqual([[upper.id, 333], [lower.id, 260]]);
  });
  it('home workout now gets the follow-along video (real home method)', () => {
    const cool = run('home', mainWE('m1', 'hinge'));
    expect(cool.map((e) => e.exercise.id)).toEqual([lower.id]);
    expect(cool[0].method.location).toBe('home');
  });
});

describe('planLocationSwap — cool-down videos by focus', () => {
  it('home → park, full body: the stretch slots become both videos', async () => {
    const stretch = (id: string) => ({ ...mainWE(id, 'flexibility'), exerciseRole: 'cooldown', isTimeBased: true, reps: 30 });
    const plan = await planLocationSwap(
      [mainWE('m1', 'squat'), mainWE('m2', 'vertical_push'), stretch('s1'), stretch('s2'), stretch('s3')],
      'park',
      { pool, hasLocation: () => true, selectMethod: (ex: any) => ex.execution_methods[0], findCandidates: async () => [] } as any,
    );
    const cool = plan.entries.filter((e) => e.exerciseRole === 'cooldown');
    expect(cool.map((e) => [e.exercise.id, e.reps, e.method.location])).toEqual([[upper.id, 333, 'park'], [lower.id, 260, 'park']]);
  });
});
