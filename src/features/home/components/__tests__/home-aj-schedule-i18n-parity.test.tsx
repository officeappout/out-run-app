// @vitest-environment jsdom
/**
 * i18n wave 2 batch aj (namespace `home`): SmartWeeklySchedule (the weekly strip: header, sync / edit row, journey
 * overlay, day-cell aria-labels, the running workout cards below it).
 *
 * Snapshots recorded BEFORE the extraction; the extracted component must render the same Hebrew markup in every
 * state reached here (v1 and v2 = enable_home_v2, strength / running, male / female). jsdom + react-dom/client, same
 * harness as home-aj-i18n-parity.test.tsx. What a render can't reach (the day peek bubble, behind a tap on a flame
 * day) is pinned key by key in src/lib/i18n/__tests__/home-aj-he.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  status: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { authStateReady: async () => {}, currentUser: null },
  app: {},
  storage: {},
}));
vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {} };
  return { useRouter: () => router };
});
vi.mock('@/features/activity', () => {
  const empty = { hasActivity: false, isCompleted: false, workoutDone: false, isRecoveryCompletion: false, totalMinutes: 0, categories: { strength: 0, cardio: 0, maintenance: 0 }, dominantCategory: null, sessions: [] };
  const today = { steps: 0, calories: 0 };
  const daily = { todayActivity: today, dominantColor: '#06B6D4', streak: { current: 0 }, isLoading: false, userProgram: null };
  const weekly = { summary: {}, daysWithActivity: [] };
  const getter = (iso: string) => ({ ...empty, ...(h.status[iso] ?? {}) });
  const past = { completedMap: new Map<string, boolean>(), recoveryMap: new Map<string, boolean>() };
  return {
    useDailyActivity: () => daily,
    useWeeklyProgress: () => weekly,
    useDayStatus: () => getter,
    useDateKey: () => '2026-10-21',
    usePastWorkoutCompleted: () => past,
  };
});
vi.mock('@/features/home/hooks/useTrackRingColors', () => ({ useTrackRingColors: () => ({}) }));
vi.mock('@/features/user/scheduling/services/userSchedule.service', () => ({ getWeekEntries: async () => [] }));
vi.mock('../calendar/MonthlyCalendarGrid', () => ({ default: () => <div data-month-grid="" /> }));
vi.mock('@lottiefiles/dotlottie-react', async () => {
  const { createElement } = await import('react');
  return { DotLottieReact: (p: { src: string }) => createElement('i', { 'data-src': p.src }), setWasmUrl: () => {} };
});

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import SmartWeeklySchedule, { type RunningScheduleEntry } from '../SmartWeeklySchedule';

const snap = (name: string) => `./__snapshots__/home-aj-schedule-i18n/${name}.html`;
let m: Mounted | null = null;
const noop = () => {};
const settle = async () => {
  for (let i = 0; i < 5; i++) await m!.advance(0);
};

const week = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((day, i) => ({ day, date: 18 + i, status: 'scheduled' as const }));
const run = (day: number, category: string, status: string, workoutName = ''): RunningScheduleEntry =>
  ({ week: 1, day, category, status, workoutId: `w${day}`, workoutName }) as unknown as RunningScheduleEntry;

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 401 }));
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.status = {};
  useLocaleStore.setState({ gender: 'male' });
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SmartWeeklySchedule', () => {
  it.each([false, true])('loading, strip with header, hidden header, overlays and the month toggle (v2=%s)', async (v2) => {
    const parts: string[] = [];
    const render = async (el: React.ReactElement, tap?: string) => {
      m?.unmount();
      m = await mount(el);
      await settle();
      if (tap) await m.clickText(tap);
      parts.push(m.html());
    };
    await render(<SmartWeeklySchedule schedule={[]} v2={v2} />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={['ב', 'ד', 'ו']} userId="u1" v2={v2} />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={['ב', 'ד', 'ו']} userId="u1" v2={v2} hideHeader />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={['ב', 'ד']} userId="u1" v2={v2} hideMonthToggle />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={[]} userId="u1" v2={v2} hasCompletedAssessment={false} hasSchedule={false} onStartAssessment={noop} onSetSchedule={noop} />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={[]} userId="u1" v2={v2} hasCompletedAssessment hasSchedule={false} onStartAssessment={noop} onSetSchedule={noop} />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={[]} userId="u1" v2={v2} hasSchedule={false} overlayHint="בחר תוכנית למטה" />);
    await render(<SmartWeeklySchedule schedule={week} scheduleDays={['ב']} userId="u1" v2={v2} calendarMode="month" />);
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`strip-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('running track: today card, rest day, completed list, every category (v2=%s)', async (v2) => {
    const parts: string[] = [];
    const render = async (entries: RunningScheduleEntry[], days: string[]) => {
      m?.unmount();
      m = await mount(
        <SmartWeeklySchedule
          schedule={week}
          currentTrack="running"
          scheduleDays={days}
          userId="u1"
          v2={v2}
          runningSchedule={entries}
          runningCurrentWeek={1}
          runningBasePace={360}
          runPlacement={v2 ? { byType: true, level: 1, targetDistance: '5k' } as never : undefined}
        />,
      );
      await settle();
      parts.push(m.html());
    };
    // 2026-10-21 is a Wednesday: scheduleDays ד = a run day, ג = a rest day.
    await render([run(1, 'easy_run', 'completed'), run(2, 'tempo', 'pending'), run(3, 'long_run', 'pending')], ['ב', 'ד', 'ו']);
    await render([run(1, 'easy_run', 'completed'), run(2, 'tempo', 'pending')], ['ב', 'ג']);
    await render([run(1, 'zzz_unknown', 'completed'), run(2, '', 'completed'), run(3, 'hill_long', 'pending', 'גבעות ארוכות')], ['ב', 'ד', 'ו']);
    for (const cat of ['recovery', 'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured', 'hill_short', 'hill_sprints', 'strides']) {
      await render([run(1, cat, 'completed'), run(2, cat, 'pending')], ['ב', 'ד']);
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`running-v${v2 ? 2 : 1}`));
  });
});
