// @vitest-environment jsdom
/**
 * i18n wave 2 batch aj (namespace `home`): UserWorkoutAdjuster, NextRunWorkoutCard, SmartWeeklySchedule, StatsOverview.
 *
 * The snapshots below were recorded from the components BEFORE the extraction; the extracted components must
 * render the same Hebrew markup in every state reached here (v1 and v2 = enable_home_v2, male / female / other).
 * Rendered with react-dom/client inside act() (src/features/user/onboarding/components/steps/__tests__/i18n-dom-harness):
 * framer-motion is replaced by plain elements, stores / services are mocked, `<!-- -->` is stripped and React
 * `:rN:` ids are normalised. What a render can't reach is pinned key by key in
 * src/lib/i18n/__tests__/home-aj-he.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  hydrated: true,
  flags: { enableHomeV2: false },
  generateFails: true,
  generatePending: false,
  rebuildOk: false,
  rebuildPending: false,
  stuck: false,
  canRebuild: false,
  dayState: { isRunDay: true, nextEntry: null as Record<string, unknown> | null, nextEntryDaysAway: null as number | null },
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {}, storage: {} }));
vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {} };
  return { useRouter: () => router };
});
vi.mock('@/features/user', () => {
  const state = () => ({ profile: h.profile, _hasHydrated: h.hydrated, refreshProfile: async () => {} });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: h.flags }) }));
vi.mock('@/features/workout-engine/services/home-workout.service', () => ({
  generateHomeWorkout: () => (h.generatePending ? new Promise(() => {}) : Promise.reject(new Error('nope'))),
}));
vi.mock('@/features/workout-engine/services/workout-context-resolver', () => ({ resolveWorkoutContext: async () => ({ availableGear: [] }) }));
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => ({
  useWeeklyVolumeStore: { getState: () => ({}) },
}));
vi.mock('@/features/workout-engine/players/running/components/RunBriefingDrawer', () => ({ default: () => null }));
vi.mock('@/features/workout-engine/players/running/components/overview-v2/RunOverviewHomeSheet', () => ({ default: () => null }));
vi.mock('@/components/ui/v2/Sheet', () => ({
  default: (p: { open: boolean; title?: string; closeLabel?: string; footer?: unknown; children?: unknown }) =>
    p.open ? (
      <section data-sheet="">
        <h2 data-close={p.closeLabel}>{p.title}</h2>
        {p.children as never}
        <footer>{p.footer as never}</footer>
      </section>
    ) : null,
}));
vi.mock('@/features/home/hooks/usePlannedRunWorkout', () => ({ usePlannedRunWorkout: () => ({ workout: null, loading: false }) }));
vi.mock('@/features/workout-engine/core/services/running-schedule-write.service', () => ({
  isRunningPlanBuildStuck: () => h.stuck,
  hasRunningRebuildInputs: () => h.canRebuild,
  buildActiveRunningProgram: () => (h.rebuildPending ? new Promise(() => {}) : Promise.resolve({ ok: h.rebuildOk })),
}));
vi.mock('@/lib/running-day-resolution', () => ({ resolveRunningDayState: () => h.dayState }));
vi.mock('@/features/home/components/widgets/run-week-v2/RunWeekListV2', () => ({
  default: (p: { programLabel: string }) => <div data-run-week="">{p.programLabel}</div>,
}));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import UserWorkoutAdjuster from '../UserWorkoutAdjuster';
import NextRunWorkoutCard from '../widgets/NextRunWorkoutCard';

const snap = (name: string) => `./__snapshots__/home-aj-i18n/${name}.html`;
let m: Mounted | null = null;
const noop = () => {};
const settle = async () => {
  for (let i = 0; i < 4; i++) await m!.advance(0);
};

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.profile = null;
  h.hydrated = true;
  h.flags.enableHomeV2 = false;
  h.generatePending = false;
  h.rebuildOk = false;
  h.rebuildPending = false;
  h.stuck = false;
  h.canRebuild = false;
  h.dayState = { isRunDay: true, nextEntry: null, nextEntryDaysAway: null };
  useLocaleStore.setState({ gender: 'male' });
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

// ── UserWorkoutAdjuster ─────────────────────────────────────────────────────

const adjusterProfile = (skills: string[]) => ({ id: 'u1', core: { gender: 'male' }, progression: { skillFocusIds: skills } });

describe('UserWorkoutAdjuster', () => {
  it.each([
    [false, 'male'],
    [true, 'male'],
    [false, 'female'],
    [true, 'female'],
    [false, 'other'],
    [true, 'other'],
  ] as const)('open, skill picked, bodyweight, intensity, slider, failed generation (v2=%s, %s)', async (v2, gender) => {
    h.flags.enableHomeV2 = v2;
    useLocaleStore.setState({ gender });
    const profile = adjusterProfile(['handstand', 'planche', 'l_sit', 'front_lever', 'back_lever', 'oap', 'muscle_up', 'pull_up_pro']) as never;
    m = await mount(<UserWorkoutAdjuster isOpen onClose={noop} userProfile={profile} onApplyAndStart={noop} initialLocation="home" />);
    await settle();
    const parts = [m.html()];
    await m.clickText('עמידת ידיים');
    parts.push(m.html());
    await m.clickText('בבית');
    await m.click('[class*="cursor-pointer"]');
    await m.clickText('עצים');
    await m.type('input[type="range"]', '45');
    parts.push(m.html());
    await m.clickText('עדכן אימון');
    await settle();
    parts.push(m.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`adjuster-${gender}-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('loading CTA while the generation runs, every skill label (v2=%s)', async (v2) => {
    h.flags.enableHomeV2 = v2;
    h.generatePending = true;
    const ids = ['handstand', 'front_lever', 'back_lever', 'oap', 'muscle_up', 'planche', 'pull_up_pro', 'l_sit'];
    m = await mount(<UserWorkoutAdjuster isOpen onClose={noop} userProfile={adjusterProfile(ids) as never} onApplyAndStart={noop} />);
    await settle();
    const parts: string[] = [];
    for (const id of ['front_lever', 'back_lever', 'oap', 'muscle_up', 'planche', 'pull_up_pro', 'l_sit']) {
      const labels: Record<string, string> = { front_lever: 'פרונט לבר', back_lever: 'בק לבר', oap: 'משיכה חד ידנית', muscle_up: 'מוסל אפ', planche: 'פלאנש', pull_up_pro: 'מתח מתקדם', l_sit: 'L-Sit' };
      await m.clickText(labels[id]);
      parts.push(document.body.textContent?.match(/האימון יתמקד ב-[^\n]*?(?=עוצמה)/)?.[0] ?? 'none');
    }
    await m.clickText('עדכן אימון');
    await settle();
    parts.push(m.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`adjuster-loading-v${v2 ? 2 : 1}`));
  });
});

// ── NextRunWorkoutCard ──────────────────────────────────────────────────────

const runProfile = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  core: { gender: 'male' },
  running: {
    scheduleDays: ['ב', 'ד'],
    paceProfile: { basePace: 360 },
    generatedProgramTemplate: { targetDistance: '5k', canonicalWeeks: 8 },
    activeProgram: {
      currentWeek: 1,
      schedule: [
        { week: 1, day: 1, category: 'easy_run', status: 'pending', workoutId: 'w1', workoutName: '' },
        { week: 1, day: 2, category: 'tempo', status: 'pending', workoutId: 'w2', workoutName: '' },
      ],
    },
    ...over,
  },
});
const withSchedule = (category: string, workoutName = '', dist = '5k', pace = 360) => {
  const p = runProfile();
  (p.running as Record<string, any>).generatedProgramTemplate.targetDistance = dist;
  (p.running as Record<string, any>).paceProfile.basePace = pace;
  (p.running as Record<string, any>).activeProgram.schedule = [
    { week: 1, day: 1, category, status: 'pending', workoutId: 'w1', workoutName },
    { week: 1, day: 2, category, status: 'pending', workoutId: 'w2', workoutName },
  ];
  // Wed 2026-10-21: scheduleDays Tue/Thu → no run today unless it includes Wed ('ד' is Wed in this app: index 3).
  (p.running as Record<string, any>).scheduleDays = ['ב', 'ד'];
  return p;
};

describe('NextRunWorkoutCard', () => {
  it('not hydrated, no plan (with / without template), stuck plans (rebuild / missing inputs / failed / building)', async () => {
    const parts: string[] = [];
    const render = async (el: ReactElement) => {
      m?.unmount();
      m = await mount(el);
      await settle();
      return m;
    };
    h.hydrated = false;
    await render(<NextRunWorkoutCard />);
    parts.push(m!.html());
    h.hydrated = true;
    h.profile = { id: 'u1', running: {} };
    await render(<NextRunWorkoutCard />);
    parts.push(m!.html());
    h.profile = { id: 'u1', running: { generatedProgramTemplate: { targetDistance: '5k' } } };
    await render(<NextRunWorkoutCard />);
    parts.push(m!.html());
    h.stuck = true;
    h.canRebuild = false;
    await render(<NextRunWorkoutCard />);
    parts.push(m!.html());
    h.canRebuild = true;
    await render(<NextRunWorkoutCard />);
    parts.push(m!.html());
    await m!.clickText('בנה את התוכנית');
    await settle();
    parts.push(m!.html());
    h.rebuildPending = true;
    await render(<NextRunWorkoutCard />);
    await m!.clickText('בנה את התוכנית');
    parts.push(m!.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('nextrun-placeholders'));
  });

  it.each([false, true])('rest day: next run tomorrow / in N days / unknown / unnamed, skipped today (v2=%s)', async (v2) => {
    h.flags.enableHomeV2 = v2;
    h.profile = withSchedule('easy_run');
    const parts: string[] = [];
    const render = async () => {
      m?.unmount();
      m = await mount(<HomeV2Context.Provider value={v2}><NextRunWorkoutCard /></HomeV2Context.Provider>);
      await settle();
      parts.push(m.html());
    };
    h.dayState = { isRunDay: false, nextEntry: { workoutName: 'ריצת טמפו' }, nextEntryDaysAway: 1 };
    await render();
    h.dayState = { isRunDay: false, nextEntry: { workoutName: 'ריצה ארוכה' }, nextEntryDaysAway: 3 };
    await render();
    h.dayState = { isRunDay: false, nextEntry: { workoutName: '' }, nextEntryDaysAway: null };
    await render();
    h.dayState = { isRunDay: false, nextEntry: { workoutName: '' }, nextEntryDaysAway: 1 };
    await render();
    h.dayState = { isRunDay: true, nextEntry: null, nextEntryDaysAway: null };
    await render();
    if (!v2) {
      await m!.clickText('אין לי כוח היום');
      parts.push(m!.html());
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`nextrun-rest-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('run day: every distance and workout type, calm return (v2=%s)', async (v2) => {
    h.flags.enableHomeV2 = v2;
    const parts: string[] = [];
    const render = async (profile: unknown, props: Record<string, unknown> = {}) => {
      h.profile = profile as never;
      m?.unmount();
      m = await mount(<HomeV2Context.Provider value={v2}><NextRunWorkoutCard {...props} /></HomeV2Context.Provider>);
      await settle();
      parts.push(m.html());
    };
    for (const dist of ['2k', '3k', '5k', '10k', 'maintenance', 'weird']) await render(withSchedule('easy_run', '', dist));
    for (const cat of ['short_intervals', 'tempo', 'long_run', 'hill_long']) await render(withSchedule(cat));
    await render(withSchedule('tempo', 'ריצת טמפו 4×5'));
    await render(withSchedule('easy_run', '', '5k', 0));
    await render(withSchedule('tempo'), { calmReturn: { isLightened: true, load: { runEasyOnly: true } } });
    await render(withSchedule('tempo'), { calmWelcomeBack: true });
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`nextrun-runday-v${v2 ? 2 : 1}`));
  });
});
