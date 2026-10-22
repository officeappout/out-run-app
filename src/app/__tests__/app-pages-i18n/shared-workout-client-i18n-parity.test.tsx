// @vitest-environment jsdom
/**
 * i18n wave 2 batch ab (namespace `library`, prefix `sharedWorkout.*`): Hebrew markup parity of the
 * shared-workout web page's client UI (src/app/workouts/[id]/WorkoutPreviewClient.tsx).
 * Snapshots recorded BEFORE the extraction, from unmodified origin/main.
 *
 * jsdom + react-dom/client (shared harness: src/features/user/onboarding/components/steps/__tests__/
 * i18n-dom-harness.tsx): the page's copy appears only after its mount effects (sessionStorage hydrate,
 * share service, exercise cache), so every service is mocked and driven by hand. Heavy children are
 * stubs that print the props this page builds (header title / description, card title / reps line) —
 * only this file's own copy is under test. `<!-- -->` is stripped (react-dom/client emits none anyway).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({
  shared: null as unknown,
  sharedPending: false,
  exercises: [] as unknown[],
}));

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }; // stable
  return { useRouter: () => router };
});
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: { currentUser: null } }));
vi.mock('@/features/workout-engine/services/share.service', () => ({
  getSharedWorkout: () => (S.sharedPending ? new Promise(() => {}) : Promise.resolve(S.shared)),
}));
vi.mock('@/features/content/exercises', () => ({
  getAllExercisesCached: async () => S.exercises,
  getLocalizedText: (v: unknown) => (typeof v === 'string' ? v : (v as { he?: string })?.he ?? ''),
}));
vi.mock('@/features/content/exercises/core/exercise.types', () => ({ resolvePreviewForLang: () => null }));
vi.mock('@/lib/bunny/bunny.config', () => ({ buildBunnyThumbnailUrl: () => '' }));
vi.mock('@/features/workout-engine/components/WorkoutPreviewHeader', () => ({
  default: (p: { title?: string; description?: string; difficulty?: number; estimatedDuration?: number }) =>
    createElement('header', { 'data-difficulty': p.difficulty, 'data-duration': p.estimatedDuration },
      `title:${p.title ?? ''}|description:${p.description ?? ''}`),
}));
vi.mock('@/features/workout-engine/components/CoachNoteBlock', () => ({
  default: () => null,
  useCoachNote: () => null,
}));
vi.mock('@/features/workout-engine/components/cards/StrengthExerciseCard', () => ({
  default: (p: { title: string; repsOrDuration?: string; isInSuperset?: boolean }) =>
    createElement('article', { 'data-superset': p.isInSuperset ? '1' : '0' }, `${p.title}|${p.repsOrDuration ?? ''}`),
}));
vi.mock('@/features/workout-engine/components/cards/RunningSegmentCard', () => ({
  default: (p: { title: string }) => createElement('article', null, `run:${p.title}`),
}));

import WorkoutPreviewClient from '@/app/workouts/[id]/WorkoutPreviewClient';

const snap = (name: string) => `./__snapshots__/shared-workout/${name}.html`;
const flush = async (m: Mounted) => {
  for (let i = 0; i < 6; i++) await m.advance(0);
};

let mounted: Mounted | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  S.shared = null;
  S.sharedPending = false;
  S.exercises = [];
  sessionStorage.clear();
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const SHARED = {
  id: 'w1',
  title: 'אימון שיתוף',
  description: 'תיאור מהשיתוף',
  difficulty: 3,
  estimatedDuration: 40,
  exercises: [
    { exerciseId: 'a', name: 'מתיחת יד', exerciseRole: 'warmup', sets: 1, reps: 30, isTimeBased: true },
    { exerciseId: 'b', name: 'סיבובי כתף', exerciseRole: 'warmup', sets: 1, reps: 10, isTimeBased: false },
    { exerciseId: 'c', name: 'שכיבות סמיכה', exerciseRole: 'main', sets: 3, reps: 12, repsRange: { min: 8, max: 12 }, isTimeBased: false, pairedWith: 'd' },
    { exerciseId: 'd', name: 'מתח', exerciseRole: 'main', sets: 3, reps: 6, isTimeBased: false },
    { exerciseId: 'e', name: 'פלאנק', exerciseRole: 'main', sets: 3, reps: 45, repsRange: { min: 30, max: 45 }, isTimeBased: true },
    { exerciseId: 'f', name: 'דיפס', exerciseRole: 'main', sets: 3, reps: 1000, isTimeBased: false },
    { exerciseId: 'g', name: 'מתיחת גב', exerciseRole: 'cooldown', sets: 1, reps: 20, repsRange: { min: 20, max: 20 }, isTimeBased: true },
  ],
};

describe('/workouts/[id] — client', () => {
  it('loading (no server title, share service pending)', async () => {
    S.sharedPending = true;
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('loading'));
  });

  it('error (no share doc, no exercises)', async () => {
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('error'));
  });

  it('server-prefilled title while the share doc is still loading', async () => {
    S.sharedPending = true;
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" serverTitle="כותרת מהשרת" serverDifficulty="easy" serverDuration={25} />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('server-prefill'));
  });

  it('shared workout: warmup / superset / singles / cooldown, ranges and time-based', async () => {
    S.shared = SHARED;
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('shared'));
  });

  it('sessionStorage plan: section titles, superset by title, goal ranges, defaults, fallback title', async () => {
    sessionStorage.setItem('active_workout_data', JSON.stringify({
      totalDuration: 30,
      segments: [
        { id: 's1', title: 'חימום', exercises: [
          { id: 'x1', name: 'קפיצות', reps: '30 שניות' },
          { id: 'x2', name: 'החזקה', type: 'hold' },
        ] },
        { id: 's2', title: 'סופרסט', exercises: [
          { id: 'x3', name: 'סקוואט', repsRange: { min: 10, max: 15 }, isGoalExercise: true, rampedTarget: 14 },
        ] },
        { id: 's3', title: 'תחנה', exercises: [
          { id: 'x4', name: 'לאנג׳', repsRange: { min: 1000, max: 1200 } },
          { id: 'x5', name: 'גשר', repsRange: { min: 20, max: 20 }, isTimeBased: true, isGoalExercise: true, rampedTarget: 25 },
        ] },
        { id: 's4', exercises: [
          { id: 'x6', name: 'עליות', type: 'reps' },
          { id: 'x7', name: 'הליכה', repsRange: { min: 40, max: 60 }, isTimeBased: true },
        ] },
        { id: 's5', title: 'שחרור', exercises: [
          { id: 'x8', name: 'מתיחה', repsRange: { min: 30, max: 30 }, isTimeBased: true, isGoalExercise: true },
        ] },
      ],
    }));
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('session-plan'));
  });

  it('sessionStorage plan with its own name and description (no segments)', async () => {
    sessionStorage.setItem('active_workout_data', JSON.stringify({ name: 'תוכנית שלי', description: 'תיאור שלי', totalDuration: 20 }));
    S.sharedPending = true;
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('session-named'));
  });

  it('exercise-cache fallback: unilateral, generated ranges, goals, reps / hold defaults', async () => {
    sessionStorage.setItem('generatedExerciseRanges', JSON.stringify({
      e1: { repsRange: { min: 8, max: 12 } },
      e2: { repsRange: { min: 30, max: 30 }, isTimeBased: true, isGoalExercise: true, rampedTarget: 35 },
      e3: { repsRange: { min: 6, max: 10 }, isGoalExercise: true, rampedTarget: 9 },
      e4: { repsRange: { min: 1000, max: 1500 } },
    }));
    S.exercises = [
      { id: 'e1', name: { he: 'חתירה' }, type: 'reps', symmetry: 'unilateral' },
      { id: 'e2', name: { he: 'פלאנק צד' }, type: 'time', symmetry: 'unilateral' },
      { id: 'e3', name: { he: 'מתח' }, type: 'reps' },
      { id: 'e4', name: { he: 'קפיצות' }, type: 'reps' },
      { id: 'e5', name: { he: 'לאנג׳ הליכה' }, type: 'reps', symmetry: 'unilateral' },
      { id: 'e6', name: { he: 'החזקת קיר' }, type: 'time', symmetry: 'unilateral' },
      { id: 'e7', name: { he: 'שכיבות' }, type: 'reps' },
    ];
    mounted = await mount(<WorkoutPreviewClient workoutId="w1" />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('exercise-fallback'));
  });
});
