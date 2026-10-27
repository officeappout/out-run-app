// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `profile`): GoalCard, GoalCarousel, PrioritiesSection, ExerciseWishlistStrip,
 * DashboardModeWidgets (strength + running, v1 + v2) and the v1 ExerciseAnalyticsPage (loaded, first session,
 * empty range, error, goal picker open / closed). Snapshots recorded BEFORE the extraction from unmodified
 * origin/main; `<!-- -->` stripped, React ids normalised (jsdom mount).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  goals: [] as unknown[],
  goalsLoading: false,
  analytics: {} as Record<string, unknown>,
  weekly: {} as Record<string, unknown>,
  activity: {} as Record<string, unknown>,
  progress: null as Record<string, unknown> | null,
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div data-chart="">{children}</div>;
  return {
    AreaChart: () => null, Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
    Tooltip: () => null, ResponsiveContainer: Box, ReferenceLine: () => null,
  };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('next/navigation', () => {
  const router = { push: () => {}, back: () => {}, replace: () => {} };
  return { useRouter: () => router };
});
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: h.profile });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  return { useUserStore };
});
vi.mock('@/features/user/progression/hooks/useActiveProgramGoals', () => ({
  useActiveProgramGoals: () => ({ goals: h.goals, loading: h.goalsLoading }),
}));
vi.mock('@/features/workout-engine/services/exercise-history.service', () => ({
  getExerciseTrend: async () => [],
  getRecentExerciseIds: async () => [],
}));
vi.mock('@/features/content/exercises/core/exercise.service', () => ({ getExercise: async () => null }));
vi.mock('../../hooks/useExerciseAnalytics', () => ({ useExerciseAnalytics: () => h.analytics }));
vi.mock('@/features/workout-engine/players/strength/playlist/VerticalWheelPicker', () => ({ default: () => <i data-wheel="" /> }));
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => ({
  useWeeklyVolumeStore: (sel: (s: unknown) => unknown) => sel(h.weekly),
}));
vi.mock('@/features/activity', () => ({ useDailyActivity: () => h.activity }));
vi.mock('@/features/home/hooks/useProgramProgress', () => ({ useProgramProgress: () => h.progress }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import GoalCard from '../widgets/GoalCard';
import GoalCarousel from '../widgets/GoalCarousel';
import PrioritiesSection from '../widgets/PrioritiesSection';
import ExerciseWishlistStrip from '../widgets/ExerciseWishlistStrip';
import { StrengthWidgets, RunningWidgets } from '../widgets/DashboardModeWidgets';
import ExerciseAnalyticsPage from '../ExerciseAnalyticsPage';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/profile-aq-i18n/${name}.html`;
const GENDERS = ['male', 'female', 'other'] as const;
let m: Mounted | null = null;

const goal = { exerciseId: 'pushup', exerciseName: 'שכיבות סמיכה', targetValue: 20, unit: 'reps' } as never;
const session = (dateMs: number, maxReps: number, totalVolume: number, reps: number[]) =>
  ({ dateMs, maxReps, totalVolume, reps, exerciseName: 'מתח' });
const S1 = session(Date.UTC(2026, 8, 1, 12), 5, 15, [5, 5, 5]);
const S2 = session(Date.UTC(2026, 8, 8, 12), 7, 21, [7, 7, 7]);
const S3 = session(Date.UTC(2026, 8, 15, 12), 6, 1500, [6, 6, 6]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.profile = null;
  h.goals = [];
  h.goalsLoading = false;
  h.weekly = {
    strength: { domainSetsCompleted: { push: 3, weird_thing: 1, LEGS: 2 }, totalSetsCompleted: 6 },
    activeMinutes: { weeklyGoal: 150, totalMinutes: 45 },
    sessionLogs: [{ completedAt: Date.UTC(2026, 9, 14, 8), setsCompleted: 4 }],
    running: { totalDistance: 12.34, totalDuration: 70, weeklyTargetDistance: 30 },
  };
  h.activity = { stepsToday: 4321, todayActivity: { stepsGoal: 10000 } };
  h.progress = null;
  useLocaleStore.setState({ gender: 'other' });
});
afterEach(() => {
  vi.useRealTimers();
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
});

describe('GoalCard', () => {
  it.each([false, true])('goal / fallback, empty graph hint per gender, v2=%s', async (v2) => {
    const parts: string[] = [];
    for (const gender of GENDERS) {
      useLocaleStore.setState({ gender });
      parts.push(html(<GoalCard goal={goal} userId="" v2={v2} onClick={() => {}} />));
      parts.push(html(<GoalCard goal={goal} userId="" v2={v2} isFallback />));
      parts.push(html(<GoalCard goal={{ ...(goal as object), unit: 'seconds' } as never} userId="" v2={v2} />));
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`goal-card-v${v2 ? 2 : 1}`));
  });
});

describe('GoalCarousel', () => {
  it.each([false, true])('empty per gender, v2=%s', async (v2) => {
    const parts: string[] = [];
    for (const gender of GENDERS) {
      useLocaleStore.setState({ gender });
      m = await mount(<GoalCarousel v2={v2} />);
      for (let i = 0; i < 5; i++) await m.advance(0);
      parts.push(m.html());
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`goal-carousel-empty-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('with goals, v2=%s', async (v2) => {
    h.goals = [goal];
    m = await mount(<GoalCarousel v2={v2} />);
    for (let i = 0; i < 5; i++) await m.advance(0);
    await expect(m.html()).toMatchFileSnapshot(snap(`goal-carousel-goals-v${v2 ? 2 : 1}`));
  });
});

describe('PrioritiesSection', () => {
  it.each([false, true])('two cards chosen, v2=%s', async (v2) => {
    h.profile = { progression: { cardFocusOrder: ['strength', 'running'], muscleFocusIds: ['chest', 'back'], skillFocusIds: [] } };
    await expect(html(<PrioritiesSection v2={v2} />)).toMatchFileSnapshot(snap(`priorities-v${v2 ? 2 : 1}`));
  });
});

describe('ExerciseWishlistStrip', () => {
  it.each([false, true])('empty, v2=%s', async (v2) => {
    h.profile = { progression: { exerciseWishlist: [] } };
    await expect(html(<ExerciseWishlistStrip v2={v2} />)).toMatchFileSnapshot(snap(`wishlist-empty-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('with entries (unresolved), v2=%s', async (v2) => {
    h.profile = { progression: { exerciseWishlist: [{ exerciseId: 'planche' }] } };
    await expect(html(<ExerciseWishlistStrip v2={v2} />)).toMatchFileSnapshot(snap(`wishlist-entries-v${v2 ? 2 : 1}`));
  });
});

describe('DashboardModeWidgets', () => {
  it.each([false, true])('strength, no PR / PR, v2=%s', async (v2) => {
    const parts = [html(<StrengthWidgets workouts={[]} v2={v2} />)];
    h.progress = { programName: 'שליטה בגוף', programNameLoading: false, currentLevel: 4 };
    parts.push(html(<StrengthWidgets workouts={[]} v2={v2} />));
    h.weekly = { ...h.weekly, strength: { domainSetsCompleted: {}, totalSetsCompleted: 0 } };
    parts.push(html(<StrengthWidgets workouts={[]} v2={v2} />));
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`strength-widgets-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('running, with / without a long run, v2=%s', async (v2) => {
    const run = { workoutType: 'running', distance: 8.5 } as never;
    const parts = [html(<RunningWidgets workouts={[run]} v2={v2} />), html(<RunningWidgets workouts={[]} v2={v2} />)];
    h.weekly = { ...h.weekly, running: { totalDistance: 0, totalDuration: 0, weeklyTargetDistance: 0 } };
    parts.push(html(<RunningWidgets workouts={[]} v2={v2} />));
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`running-widgets-v${v2 ? 2 : 1}`));
  });
});

describe('ExerciseAnalyticsPage', () => {
  const base = {
    loading: false,
    error: null,
    customGoal: null,
    saveGoal: async () => {},
    savingGoal: false,
  };
  const render = async (analytics: Record<string, unknown>, then?: (mm: Mounted) => Promise<void>) => {
    h.analytics = { ...base, ...analytics };
    m = await mount(<ExerciseAnalyticsPage exerciseId="pullup" userId="u1" exerciseNameHint="מתח" />);
    for (let i = 0; i < 5; i++) await m.advance(0);
    if (then) await then(m);
    const out = m.html();
    m.unmount();
    m = null;
    return out;
  };
  const loaded = (extra: Record<string, unknown> = {}) => ({
    analytics: { sessions: [S1, S2, S3], personalBest: 7, cumulativeVolume: 1536, improvementPct: 20 },
    filteredSessions: [S1, S2, S3],
    effectiveTarget: 10,
    ...extra,
  });

  it('loaded, with a goal, both metrics', async () => {
    const parts = [await render(loaded())];
    parts.push(await render(loaded(), async (mm) => mm.clickText('נפח כולל')));
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('analytics-loaded'));
  });
  it('loaded, no goal, negative / zero improvement, small volume', async () => {
    const parts = [
      await render(loaded({ effectiveTarget: null, analytics: { sessions: [S1, S2], personalBest: 0, cumulativeVolume: 36, improvementPct: -10 } })),
      await render(loaded({ analytics: { sessions: [S1, S2], personalBest: 7, cumulativeVolume: 0, improvementPct: null } })),
    ];
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('analytics-nogoal'));
  });
  it('loading / first session / empty range / error', async () => {
    const parts = [
      await render({ loading: true, analytics: null, filteredSessions: [], effectiveTarget: null }),
      await render({ analytics: { sessions: [S1], personalBest: 5, cumulativeVolume: 15, improvementPct: null }, filteredSessions: [S1], effectiveTarget: null }),
      await render({ analytics: { sessions: [S1, S2], personalBest: 7, cumulativeVolume: 36, improvementPct: 40 }, filteredSessions: [], effectiveTarget: null }),
    ];
    for (const gender of GENDERS) {
      useLocaleStore.setState({ gender });
      parts.push(await render({ error: 'x', analytics: { sessions: [S1, S2], personalBest: 7, cumulativeVolume: 36, improvementPct: 40 }, filteredSessions: [S1, S2], effectiveTarget: null }));
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('analytics-states'));
  });
  it('goal picker, with and without a goal', async () => {
    const parts = [
      await render(loaded(), async (mm) => mm.clickText('יעד: 10 חז׳')),
      await render(loaded({ effectiveTarget: null }), async (mm) => mm.clickText('הוסף יעד')),
    ];
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('analytics-picker'));
  });
});
