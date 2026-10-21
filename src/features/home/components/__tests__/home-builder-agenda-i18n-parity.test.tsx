// @vitest-environment jsdom
/**
 * i18n wave 2 batch y (namespace `home`): the workout builder sheet (+ the anchor location chip that reuses its
 * location options), the planner's agenda day card and rolling agenda, the future-day preview and the nearby
 * parks / routes carousel.
 *
 * The snapshots below were recorded from the components BEFORE the extraction; the extracted components must
 * render the same Hebrew markup in every state reached here (v1 and v2 = enable_home_v2, male / female). Rendered
 * with react-dom/client inside act() (src/features/user/onboarding/components/steps/__tests__/i18n-dom-harness):
 * framer-motion is replaced by plain elements, stores / services are mocked, `<!-- -->` is stripped and React
 * `:rN:` ids are normalised. What a render can't reach (a drag, a failed generation) is pinned key by key in
 * src/lib/i18n/__tests__/home-builder-agenda-he.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  flags: { enableHomeV2: false, stubAgendaCard: false },
  programs: [] as unknown[],
  gps: null as { lat: number; lng: number } | null,
  parks: [] as unknown[],
  routes: [] as unknown[],
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  const { createElement, Fragment } = await import('react');
  const value = (v: number) => ({ get: () => v, set: () => {}, on: () => () => {} });
  return {
    ...harness.motionStub,
    Reorder: {
      Group: ({ children }: { children?: unknown }) => createElement('div', null, children as never),
      Item: ({ children }: { children?: unknown }) => createElement('div', null, children as never),
    },
    useDragControls: () => ({ start: () => {} }),
    useMotionValue: (v: number) => value(v),
    animate: () => ({ stop: () => {} }),
    LayoutGroup: ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never),
  };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {}, storage: {} }));
vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig<typeof import('firebase/firestore')>()),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: h.routes.map((r) => ({ id: (r as { id: string }).id, data: () => r })) }),
}));
vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {} };
  return { useRouter: () => router };
});
vi.mock('next/image', () => ({ default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} /> }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: unknown) => unknown) => {
    const s = { profile: h.profile, refreshProfile: async () => {} };
    return sel ? sel(s) : s;
  };
  (useUserStore as unknown as { getState: () => unknown }).getState = () => ({ profile: h.profile });
  return { useUserStore };
});
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: h.flags }) }));
vi.mock('@/features/content/equipment/gear', () => ({ getAllGearDefinitions: async () => [] }));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: async () => h.programs }));
vi.mock('@/features/workout-engine/services/home-workout.service', () => ({
  generateHomeWorkout: async () => { throw new Error('nope'); },
}));
vi.mock('@/features/workout-engine/services/workout-context-resolver', () => ({ resolveWorkoutContext: () => ({}) }));
vi.mock('@/features/workouts/components/WorkoutPreviewDrawer', () => ({ default: () => null }));
vi.mock('@/features/content/exercises/client/components/EquipmentFilterSheet', () => ({ default: () => null }));
vi.mock('@/features/user/scheduling/services/userSchedule.service', () => ({
  upsertScheduleEntry: async () => { throw new Error('nope'); },
  getScheduleEntries: async () => [],
  hydrateFromTemplate: async () => [],
  moveScheduleEntry: async () => true,
  removeScheduleEntry: async () => true,
  removeCommunityEntriesForGroup: async () => {},
  updateScheduleDays: async () => {},
  getScheduleEntry: async () => null,
  getScheduleEntriesForDates: async () => ({}),
}));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({
  startMiniDomainAssessment: () => {},
  resolveBaseCategoryForProgramId: () => 'push',
}));
vi.mock('@/features/workout-engine/core/services/storage.service', () => ({ getWorkoutsInDateRange: async () => [] }));
vi.mock('@/features/workout-engine/shared/utils/running-current-week.utils', () => ({ resolveRunningCurrentWeek: () => 3 }));
vi.mock('@/lib/running-plan-date-range', () => ({ isDateWithinRunningPlan: () => true }));
vi.mock('@/features/schedule/walking/startWalk', () => ({ startWalkEntry: () => {} }));
vi.mock('@/lib/haptics', () => ({ hapticLight: () => {}, hapticMedium: () => {} }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => h.parks }));
vi.mock('@/features/parks/core/store/useGPSStore', () => ({
  useGPSStore: { getState: () => ({ requestPermissionIfAllowed: async () => h.gps, requestPermissionNow: async () => null }) },
}));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const s = { setDeepLink: () => {}, openGlobalParkSheet: () => {}, openGlobalRouteSheet: () => {} };
  return { useMapStore: (sel: (x: typeof s) => unknown) => sel(s) };
});
vi.mock('@/lib/park-image', () => ({ resolveParkImage: () => null }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import WorkoutBuilderSheet from '../WorkoutBuilderSheet';
import AnchorLocationChip from '../AnchorLocationChip';
import AgendaDayCard from '../agenda/AgendaDayCard';
import RollingAgenda from '../agenda/RollingAgenda';
import PlannedDayPreview from '../day-preview/PlannedDayPreview';
import WorkoutLocationSuggestions from '../WorkoutLocationSuggestions';

const snap = (name: string) => `./__snapshots__/home-builder-agenda-i18n/${name}.html`;
let m: Mounted | null = null;
const noop = () => {};
const settle = async () => {
  for (let i = 0; i < 4; i++) await m!.advance(0);
};

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.profile = null;
  h.flags.enableHomeV2 = false;
  h.programs = [];
  h.gps = null;
  h.parks = [];
  h.routes = [];
  useLocaleStore.setState({ gender: 'male' });
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const v2Wrap = (v2: boolean, el: ReactElement) => <HomeV2Context.Provider value={v2}>{el}</HomeV2Context.Provider>;

// ── WorkoutBuilderSheet ─────────────────────────────────────────────────────

const builderProfile = (gender: 'male' | 'female', equipment = false) => ({
  id: 'u1',
  core: { gender },
  equipment: equipment ? { home: ['dumbbells'] } : {},
  progression: {
    activePrograms: [{ templateId: 'full_body' }],
    tracks: { push: { currentLevel: 4 }, pull: { currentLevel: 3 }, legs: { currentLevel: 2 }, core: { currentLevel: 2 } },
    domains: {},
  },
});

describe('WorkoutBuilderSheet', () => {
  it.each([
    [false, 'male'],
    [true, 'male'],
    [false, 'female'],
    [true, 'female'],
  ] as const)('generate mode (v2=%s, %s): open, 45 min, other + slider, muscles open, intensity, error', async (v2, gender) => {
    h.flags.enableHomeV2 = v2;
    h.profile = builderProfile(gender);
    useLocaleStore.setState({ gender });
    h.programs = [
      { id: 'full_body', isMaster: true, subPrograms: ['push', 'pull', 'legs', 'core'] },
      { id: 'push' },
      { id: 'planche' },
    ];
    m = await mount(<WorkoutBuilderSheet onClose={noop} />);
    await settle();
    const open = m.html();
    await m.click(`button[aria-pressed]:not([aria-pressed="true"])`);
    const parts = [open];
    const timeButtons = Array.from(document.querySelectorAll('button')).filter((b) => /^45/.test((b.textContent ?? '').trim()));
    await m.click(timeButtons[0]);
    parts.push(m.html());
    await m.clickText('אחר');
    parts.push(m.html());
    await m.type('input[type="range"]', '15');
    await m.clickText('עצים');
    parts.push(m.html());
    await m.clickText('כל הגוף');
    parts.push(m.html());
    await m.clickText('צור אימון');
    await settle();
    parts.push(m.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`builder-generate-${gender}-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('schedule mode + unenrolled program unlock modal + save error (v2=%s)', async (v2) => {
    h.flags.enableHomeV2 = v2;
    h.profile = builderProfile('male', true);
    h.programs = [{ id: 'push' }, { id: 'planche' }];
    m = await mount(<WorkoutBuilderSheet mode="schedule" date="2026-10-23" onClose={noop} />);
    await settle();
    const open = m.html();
    const pills = Array.from(document.querySelectorAll('button')).filter((b) => (b.textContent ?? '').includes('רמה 0'));
    await m.click(pills[0]);
    const unlock = m.html();
    await m.clickText('אולי מאוחר יותר');
    await m.clickText(v2 ? 'שמירה בלו״ז' : 'שמור ללוז');
    await settle();
    await expect([open, unlock, m.html()].join('\n')).toMatchFileSnapshot(snap(`builder-schedule-v${v2 ? 2 : 1}`));
  });
});

// ── AnchorLocationChip ──────────────────────────────────────────────────────

describe('AnchorLocationChip', () => {
  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])('closed + open (v2=%s, military=%s)', async (v2, military) => {
    h.profile = { id: 'u1', personas: military ? [{ id: 'military' }] : [], core: {} };
    m = await mount(v2Wrap(v2, <AnchorLocationChip value="home" onSelect={noop} />));
    const closed = m.html();
    await m.click('button[aria-label]');
    await expect([closed, m.html()].join('\n')).toMatchFileSnapshot(snap(`anchor-chip-v${v2 ? 2 : 1}${military ? '-military' : ''}`));
  });
});

// ── PlannedDayPreview ───────────────────────────────────────────────────────

describe('PlannedDayPreview', () => {
  it('loading, items, rest day, nothing planned', async () => {
    const parts: string[] = [];
    for (const plan of [
      null,
      { isRestDay: false, items: [{ kind: 'strength', title: 'כוח', subtitle: '30 דק׳', completed: true }, { kind: 'run', title: 'ריצה', subtitle: '5 ק״מ', completed: false }] },
      { isRestDay: true, items: [] },
      { isRestDay: false, items: [] },
    ]) {
      m = await mount(<PlannedDayPreview dateISO="2026-10-22" plan={plan as never} />);
      parts.push(m.html());
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('planned-day-preview'));
  });
});

// ── WorkoutLocationSuggestions ──────────────────────────────────────────────

describe('WorkoutLocationSuggestions', () => {
  it.each(['strength', 'running'] as const)('skeleton, GPS fallback prompt, loaded (%s)', async (workoutType) => {
    h.parks = [
      { id: 'p1', name: 'גינה א', facilityType: 'gym_park', location: { lat: 32.0855, lng: 34.782 } },
      { id: 'p2', name: 'מגרש ב', facilityType: 'court', location: { lat: 32.09, lng: 34.79 } },
      { id: 'p3', name: 'מתקן ג', facilityType: 'other', location: { lat: 32.1, lng: 34.8 } },
    ];
    h.routes = [
      { id: 'r1', name: 'מסלול ים', distance: 4.25, path: [[34.782, 32.0855]] },
      { id: 'r2', name: 'מסלול פארק', path: [[34.79, 32.09]] },
    ];
    const parts: string[] = [];
    for (const v2 of [false, true]) {
      h.gps = null;
      h.profile = { id: 'u1', core: { city: 'תל אביב' } };
      m = await mount(v2Wrap(v2, <WorkoutLocationSuggestions workoutType={workoutType} />));
      parts.push(m.html());
      await settle();
      parts.push(m.html());
      m.unmount();
      h.gps = { lat: 32.0853, lng: 34.7818 };
      m = await mount(v2Wrap(v2, <WorkoutLocationSuggestions workoutType={workoutType} />));
      await settle();
      parts.push(m.html());
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`location-suggestions-${workoutType}`));
  });
});

// ── AgendaDayCard ───────────────────────────────────────────────────────────

const TODAY = '2026-10-21';
const FUTURE = '2026-10-23';
const PAST = '2026-10-19';

const entry = (over: Partial<UserScheduleEntry>): UserScheduleEntry => ({
  userId: 'u1',
  date: TODAY,
  programIds: [],
  type: 'training',
  source: 'manual',
  completed: false,
  ...over,
} as UserScheduleEntry);

describe('AgendaDayCard', () => {
  it.each([false, true])('empty / rest / strength titles / community / reconstructed / running (v2=%s)', async (v2) => {
    h.profile = { id: 'u1' };
    const cases: Array<[string, Record<string, unknown>]> = [
      ['future empty, no add', { date: FUTURE, scheduleMap: {} }],
      ['future empty, add', { date: FUTURE, scheduleMap: {}, onAddWorkout: noop }],
      ['past rest', { date: PAST, scheduleMap: {} }],
      ['future rest, add', { date: FUTURE, scheduleMap: { [FUTURE]: [entry({ date: FUTURE, type: 'rest' })] }, onAddWorkout: noop }],
      ['today strength titles', {
        date: TODAY,
        onAddWorkout: noop,
        onDeleteEntry: noop,
        onEditEntry: noop,
        scheduleMap: {
          [TODAY]: [
            entry({ entryId: 'e1', programIds: ['UPPER_CALISTHENICS'] }),
            entry({ entryId: 'e2', programIds: ['PLANCHE'] }),
            entry({ entryId: 'e3', scheduledCategories: ['cardio'] }),
            entry({ entryId: 'e4', scheduledCategories: ['walking'] }),
            entry({ entryId: 'e5', startTime: '7:5' }),
            entry({ entryId: 'e6', title: 'האימון שלי' }),
          ],
        },
      }],
      ['future community', {
        date: FUTURE,
        scheduleMap: {
          [FUTURE]: [
            entry({ date: FUTURE, entryId: 'c1', source: 'community', groupId: 'g1', groupName: 'רצים בפארק', scheduledCategories: ['running' as never] }),
            entry({ date: FUTURE, entryId: 'c2', source: 'community', scheduledCategories: ['yoga' as never] }),
            entry({ date: FUTURE, entryId: 'c3', source: 'community', scheduledCategories: ['calisthenics' as never] }),
            entry({ date: FUTURE, entryId: 'c4', source: 'community', scheduledCategories: ['cycling' as never] }),
            entry({ date: FUTURE, entryId: 'c5', source: 'community', scheduledCategories: ['walking'] }),
            entry({ date: FUTURE, entryId: 'c6', source: 'community', scheduledCategories: ['other' as never] }),
            entry({ date: FUTURE, entryId: 'c7', source: 'community', scheduledCategories: ['boxing' as never] }),
            entry({ date: FUTURE, entryId: 'c8', source: 'community' }),
          ],
        },
      }],
      ['today reconstructed', {
        date: TODAY,
        scheduleMap: {},
        actualWorkoutsMap: {
          [TODAY]: ['walking', 'running', 'cycling', 'hybrid', 'recovery', 'strength'].map((workoutType, i) => ({ id: `w${i}`, workoutType })),
        },
      }],
      ['today run pending', { date: TODAY, scheduleMap: {}, runningOverride: { name: 'ריצה קלה', category: 'easy_run', status: 'pending' } }],
      ['future run', { date: FUTURE, scheduleMap: {}, runningOverride: { name: 'אינטרוולים', category: 'short_intervals', status: 'pending' } }],
      ['past run done', { date: PAST, scheduleMap: {}, runningOverride: { name: 'ריצה ארוכה', category: 'long_run', status: 'completed' } }],
    ];
    const parts: string[] = [];
    for (const [name, props] of cases) {
      m = await mount(
        <AgendaDayCard
          date={props.date as string}
          isSelected={false}
          onSelect={noop}
          userId="u1"
          v2={v2}
          {...(props as object)}
        />,
      );
      await settle();
      parts.push(`<!-- ${name} -->\n${m.html()}`);
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`agenda-day-card-v${v2 ? 2 : 1}`));
  });
});

// ── RollingAgenda ───────────────────────────────────────────────────────────

vi.mock('../agenda/AgendaDayCard', async (orig) => {
  const real = await orig<typeof import('../agenda/AgendaDayCard')>();
  const Stub = (p: { date: string } & Record<string, unknown>) =>
    h.flags.stubAgendaCard ? <div data-agenda-day={p.date} /> : <real.default {...(p as unknown as Parameters<typeof real.default>[0])} />;
  return { ...real, default: Stub };
});

describe('RollingAgenda', () => {
  it.each([
    [false, 'all'],
    [true, 'planner'],
    [false, 'planner'],
  ] as const)('header + week labels (v2=%s, %s)', async (v2, filterMode) => {
    h.flags.stubAgendaCard = true;
    h.profile = { id: 'u1', running: { scheduleDays: ['א'], activeProgram: { startDate: '2026-10-01' } } };
    m = await mount(v2Wrap(v2, <RollingAgenda selectedDate={TODAY} onDaySelect={noop} userId="u1" filterMode={filterMode} />));
    await settle();
    h.flags.stubAgendaCard = false;
    await expect(m.html()).toMatchFileSnapshot(snap(`rolling-agenda-${filterMode}-v${v2 ? 2 : 1}`));
  });
});
