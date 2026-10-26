/**
 * Park cool-down = the follow-along cool-down video (owner 26.10), not the home-filmed stretches.
 */
import { describe, it, expect } from 'vitest';
import { cooldownGuideSeconds, isCooldownGuide, pickCooldownGuide } from '../cooldown-guide.utils';
import { appendCooldownExercises } from '../cooldown.service';
import type { GeneratedWorkout } from '../../logic/workout-generator.types';

const parkVideo = { location: 'park', locationMapping: ['park', 'street'], gearIds: [], equipmentIds: [], media: { mainVideoUrl: 'https://youtu.be/x', videoDurationSeconds: 210 } };
const guide = (id: string, he = 'שחרור פלג גוף עליון', extra: Record<string, unknown> = {}) =>
  ({ id, name: { he, en: '' }, isFollowAlong: true, exerciseRole: 'cooldown', type: 'time', execution_methods: [parkVideo], ...extra }) as any;
// The real stretches: a media-less park method + a filmed home method.
const stretch = (id: string, he: string) => ({
  id, name: { he, en: '' }, exerciseRole: 'main',
  execution_methods: [
    { location: 'park', locationMapping: ['park'], gearIds: [], equipmentIds: [], media: {} },
    { location: 'home', locationMapping: ['home'], gearIds: [], equipmentIds: [], media: { mainVideoUrl: 'https://cdn/home.mp4' } },
  ],
}) as any;
const workout = (): GeneratedWorkout => ({ exercises: [] } as unknown as GeneratedWorkout);

describe('pickCooldownGuide', () => {
  it('picks a follow-along cool-down video tagged for the location', () => {
    expect(pickCooldownGuide([guide('g1')], 'park')?.exercise.id).toBe('g1');
    expect(pickCooldownGuide([guide('g1')], 'street')?.exercise.id).toBe('g1'); // via locationMapping
  });
  it('none at a location it is not filmed for', () => {
    expect(pickCooldownGuide([guide('g1')], 'home')).toBeNull();
  });
  it('skips test docs, other roles, non-follow-along docs, media-less methods and excluded ids', () => {
    const pool = [
      guide('ETMVVSpt0lIpeF3mkEn6', 'מתיחות פלג גוף עליון לבדיקה'),
      guide('rec', 'סשן התאוששות', { exerciseRole: 'recovery' }),
      guide('nf', 'מתיחה', { isFollowAlong: false }),
      guide('nomedia', 'שחרור', { execution_methods: [{ ...parkVideo, media: {} }] }),
      guide('used'),
    ];
    expect(pickCooldownGuide(pool, 'park', new Set(['used']))).toBeNull();
    expect(isCooldownGuide(pool[0])).toBe(false);
  });
  it('is deterministic (first by id)', () => {
    expect(pickCooldownGuide([guide('b'), guide('a')], 'park')?.exercise.id).toBe('a');
  });
  it('slot length is the clip length, else 30s', () => {
    expect(cooldownGuideSeconds(parkVideo as any)).toBe(210);
    expect(cooldownGuideSeconds({ media: {} } as any)).toBe(30);
  });
});

describe('appendCooldownExercises — park cool-down video', () => {
  it('at the park the cool-down is the one video, not stretches', () => {
    const w = workout();
    appendCooldownExercises(w, [stretch('s1', 'מתיחת כתף'), stretch('s2', 'מתיחת פרפר'), guide('cv')], { availableEquipment: [] } as any, 'park', 45);
    expect(w.exercises.map((e) => e.exercise.id)).toEqual(['cv']);
    expect(w.exercises[0]).toMatchObject({ exerciseRole: 'cooldown', isTimeBased: true, reps: 210, sets: 1 });
  });
  it('at home (no home video filmed) the stretches stay', () => {
    const w = workout();
    appendCooldownExercises(w, [stretch('s1', 'מתיחת כתף'), guide('cv')], { availableEquipment: [] } as any, 'home', 15);
    expect(w.exercises.map((e) => e.exercise.id)).toEqual(['s1']);
  });
  it('the current catalog doc (test-named, blocklisted) is NOT used yet', () => {
    const w = workout();
    appendCooldownExercises(w, [guide('ETMVVSpt0lIpeF3mkEn6', 'מתיחות פלג גוף עליון לבדיקה')], { availableEquipment: [] } as any, 'park', 15);
    expect(w.exercises.map((e) => e.exercise.id)).not.toContain('ETMVVSpt0lIpeF3mkEn6');
  });
});
