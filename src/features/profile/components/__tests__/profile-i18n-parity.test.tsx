// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `profile`, keys `profile.*` / `widgets.*`): the profile screen's own
 * components (history sheet + cards, workout / public activity grids, header, partners row,
 * progress link, neighborhood picker, programs section) move their copy to
 * src/messages/he/profile.json. The snapshots below were recorded from the components BEFORE
 * the extraction; the extracted components must render the same Hebrew markup in every state
 * that shows text — v1 and v2 (enable_home_v2) wherever the component has both looks.
 *
 * Rendered with react-dom/client in jsdom: the neighborhood picker loads its list in an effect,
 * and ProgramsSection resolves program metadata in effects. Services / data hooks are mocked
 * (no Firestore). Only Date is faked (pinned "now").
 * Normalised (not text): `<!-- -->` (react-dom/server's text separator — never present in
 * client markup, stripped for symmetry with the static-markup parity tests), React useId values
 * and framer-motion animation state (style / opacity / stroke-dash attributes), which depend on
 * frame timing.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import type { FeedPost } from '@/features/social/services/feed.service';
import type { Authority } from '@/types/admin-types';

const H = vi.hoisted(() => {
  const flags = { enableHomeV2: false };
  const userState: { profile: unknown } = { profile: null };
  return {
    ROUTER: { back() {}, push() {}, replace() {}, prefetch() {} },
    flags,
    FLAGS_RESULT: { flags, loading: false },
    userState,
    useUserStoreFake: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
    neighborhoods: { mode: 'list', list: [] } as { mode: 'list' | 'empty' | 'error' | 'pending'; list: unknown[] },
    programProgress: { value: null } as { value: unknown },
  };
});
const { flags, userState, neighborhoods, programProgress } = H;

vi.mock('next/navigation', () => ({ useRouter: () => H.ROUTER }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => H.FLAGS_RESULT }));
// User store: a selector-hook fake (the real module pulls in Firebase).
vi.mock('@/features/user', () => ({ useUserStore: H.useUserStoreFake }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({ useUserStore: H.useUserStoreFake }));
// Neighborhood picker service.
vi.mock('@/features/admin/services/authority.service', () => ({
  getChildrenByParent: () => {
    if (H.neighborhoods.mode === 'pending') return new Promise(() => {});
    if (H.neighborhoods.mode === 'error') return Promise.reject(new Error('x'));
    return Promise.resolve(H.neighborhoods.mode === 'empty' ? [] : H.neighborhoods.list);
  },
}));
// ProgramsSection data.
vi.mock('@/features/home/hooks/useProgramProgress', () => ({
  useProgramProgress: () => H.programProgress.value,
  MASTER_LEVEL_CAP: 25,
}));
vi.mock('@/features/content/programs/core/program.service', () => ({
  getProgramByTemplateId: async () => null,
}));
// ParentProgramSheet is another batch's file (busy) and renders nothing while closed.
vi.mock('../widgets/ParentProgramSheet', () => ({ default: () => null }));

import { MotionGlobalConfig } from 'framer-motion';
import HistorySheet from '../HistorySheet';
import WorkoutGrid from '../WorkoutGrid';
import PublicActivityGrid from '../PublicActivityGrid';
import ProfileHeader from '../ProfileHeader';
import PartnersHighlightsRow from '../PartnersHighlightsRow';
import ProgressLinkRow from '../ProgressLinkRow';
import NeighborhoodPickerSheet from '../NeighborhoodPickerSheet';
import ProgramsSection from '../widgets/ProgramsSection';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
MotionGlobalConfig.skipAnimations = true;

// Wed 15.10.2026 12:00 local.
const NOW = new Date(2026, 9, 15, 12, 0, 0).getTime();
const DAY = 86_400_000;

let root: Root | null = null;
let host: HTMLElement | null = null;
const clean = (h: string) =>
  h
    .replaceAll('<!-- -->', '')
    .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»/g, ':r:')
    .replace(/ (style|opacity|stroke-dasharray|stroke-dashoffset)="[^"]*"/g, '');
async function mount(el: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
const body = () => clean(document.body.innerHTML);
async function tapText(text: string): Promise<void> {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  if (!el) throw new Error(`no button "${text}"`);
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}
const snap = (name: string) => `./__snapshots__/profile-i18n/${name}.html`;
const V = (v2: boolean) => (v2 ? 'v2' : 'v1');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = '';
  flags.enableHomeV2 = false;
  userState.profile = null;
  programProgress.value = null;
  neighborhoods.mode = 'list';
});

// ── Fixtures ──
const w = (id: string, workoutType: WorkoutHistoryEntry['workoutType'], daysAgo: number, extra: Partial<WorkoutHistoryEntry> = {}): WorkoutHistoryEntry => ({
  id,
  userId: 'u1',
  date: new Date(NOW - daysAgo * DAY - 3 * 3600_000),
  activityType: workoutType === 'recovery' ? 'strength' : (workoutType as WorkoutHistoryEntry['activityType']),
  workoutType,
  category: 'cardio',
  displayIcon: 'x',
  distance: 0,
  duration: 0,
  calories: 0,
  pace: 0,
  earnedCoins: 0,
  ...extra,
});
const WORKOUTS: WorkoutHistoryEntry[] = [
  w('run', 'running', 0, { distance: 5.234, pace: 5.5, duration: 1730 }),
  w('str', 'strength', 1, { duration: 2400, calories: 1234 }),
  w('walk', 'walking', 3, { distance: 2.1, duration: 1500, calories: 120 }),
  w('bike', 'cycling', 5, { distance: 12.4, duration: 2900 }),
  w('hyb', 'hybrid', 9, { duration: 3000 }),
  w('rec', 'recovery', 40, { duration: 900 }),
  w('run0', 'running', 60, {}),
];
const POSTS = [
  { id: 'p1', activityCategory: 'strength', durationMinutes: 42, title: 'אימון גב' },
  { id: 'p2', activityCategory: 'cardio', durationMinutes: 30, distanceKm: 5.25 },
  { id: 'p3', activityCategory: 'maintenance', durationMinutes: 15 },
  { id: 'p4', activityCategory: 'strength', durationMinutes: 1200 },
] as unknown as FeedPost[];
const HOODS = [
  { id: 'n1', name: 'נווה שאנן' },
  { id: 'n2', name: 'הדר' },
] as unknown as Authority[];

const noop = () => {};

describe('history sheet + cards', () => {
  it.each([false, true])('full list, %s', async (v2) => {
    await mount(<HistorySheet isOpen onClose={noop} onWorkoutClick={noop} workouts={WORKOUTS} isLoading={false} removeWorkout={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`history-full-${V(v2)}`));
  });
  it.each([false, true])('loading, %s', async (v2) => {
    await mount(<HistorySheet isOpen onClose={noop} onWorkoutClick={noop} workouts={[]} isLoading removeWorkout={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`history-loading-${V(v2)}`));
  });
  it('empty', async () => {
    await mount(<HistorySheet isOpen onClose={noop} onWorkoutClick={noop} workouts={[]} isLoading={false} removeWorkout={noop} v2 />);
    await expect(body()).toMatchFileSnapshot(snap('history-empty'));
  });
  it.each(['ריצה', 'כוח'])('filter %s', async (label) => {
    await mount(<HistorySheet isOpen onClose={noop} onWorkoutClick={noop} workouts={WORKOUTS} isLoading={false} removeWorkout={noop} v2 />);
    await tapText(label);
    await expect(body()).toMatchFileSnapshot(snap(`history-filter-${label === 'כוח' ? 'strength' : 'running'}`));
  });
});

describe('activity grids', () => {
  it.each([false, true])('workout grid, %s', async (v2) => {
    await mount(<WorkoutGrid workouts={WORKOUTS} isLoading={false} onOpen={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`workout-grid-${V(v2)}`));
  });
  it.each([false, true])('workout grid empty, %s', async (v2) => {
    await mount(<WorkoutGrid workouts={[]} isLoading={false} onOpen={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`workout-grid-empty-${V(v2)}`));
  });
  it.each([false, true])('public grid, %s', async (v2) => {
    await mount(<PublicActivityGrid posts={POSTS} isLoading={false} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`public-grid-${V(v2)}`));
  });
  it.each([false, true])('public grid empty, %s', async (v2) => {
    await mount(<PublicActivityGrid posts={[]} isLoading={false} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`public-grid-empty-${V(v2)}`));
  });
});

describe('header, partners row, progress link', () => {
  it.each([false, true])('header with a photo and no name, %s', async (v2) => {
    await mount(
      <ProfileHeader photoURL="/p.png" name={null} stats={[{ key: 'w', value: 3, label: 'אימונים' }]} bio={null} bioPlaceholder="ביו" tagIds={[]} v2={v2} />,
    );
    await expect(body()).toMatchFileSnapshot(snap(`header-photo-${V(v2)}`));
  });
  it('partners row, default add label', async () => {
    await mount(<PartnersHighlightsRow partners={[{ uid: 'a', name: 'דנה' }]} onAddClick={noop} />);
    await expect(body()).toMatchFileSnapshot(snap('partners-add'));
  });
  it('progress link', async () => {
    await mount(<ProgressLinkRow />);
    await expect(body()).toMatchFileSnapshot(snap('progress-link'));
  });
});

describe('neighborhood picker', () => {
  const sheet = (cityName: string | null) => (
    <NeighborhoodPickerSheet isOpen onClose={noop} cityAuthorityId="c1" cityName={cityName} currentNeighborhoodId="n2" onSelect={noop} />
  );
  it.each([false, true])('loading, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    neighborhoods.mode = 'pending';
    await mount(sheet('חיפה'));
    await expect(body()).toMatchFileSnapshot(snap(`hood-loading-${V(v2)}`));
  });
  it.each([false, true])('list, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    neighborhoods.mode = 'list';
    neighborhoods.list = HOODS;
    await mount(sheet('חיפה'));
    await expect(body()).toMatchFileSnapshot(snap(`hood-list-${V(v2)}`));
  });
  it.each([false, true])('error, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    neighborhoods.mode = 'error';
    await mount(sheet('חיפה'));
    await expect(body()).toMatchFileSnapshot(snap(`hood-error-${V(v2)}`));
  });
  it.each([false, true])('empty with a city, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    neighborhoods.mode = 'empty';
    await mount(sheet('חיפה'));
    await expect(body()).toMatchFileSnapshot(snap(`hood-empty-city-${V(v2)}`));
  });
  it('empty without a city', async () => {
    flags.enableHomeV2 = true;
    neighborhoods.mode = 'empty';
    await mount(sheet(null));
    await expect(body()).toMatchFileSnapshot(snap('hood-empty-nocity'));
  });
});

describe('programs section', () => {
  const PROFILE_FULL = {
    id: 'u1',
    core: {},
    progression: {
      activePrograms: [{ templateId: 'full_body' }, { templateId: 'planche' }],
      tracks: {
        push: { currentLevel: 6, percent: 40 },
        pull: { currentLevel: 4, percent: 72.6 },
        planche: { currentLevel: 2, percent: 10 },
      },
      domains: {},
      skillFocusIds: [],
    },
  };
  const PROGRESS = { programName: 'פול באדי', iconKey: 'full_body', currentLevel: 5, maxLevel: 15, progressPercent: 47.4, programNameLoading: false };

  it.each([false, true])('no program, %s', async (v2) => {
    userState.profile = { id: 'u1', core: {}, progression: { activePrograms: [] } };
    await mount(<ProgramsSection v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`programs-empty-${V(v2)}`));
  });
  it.each([false, true])('master + children + additional, %s', async (v2) => {
    userState.profile = PROFILE_FULL;
    programProgress.value = PROGRESS;
    await mount(<ProgramsSection v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`programs-full-${V(v2)}`));
  });
  it.each([false, true])('master name fallback (no progress name), %s', async (v2) => {
    userState.profile = { ...PROFILE_FULL, progression: { ...PROFILE_FULL.progression, activePrograms: [{}, { templateId: 'planche' }] } };
    programProgress.value = PROGRESS;
    await mount(<ProgramsSection v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`programs-no-master-${V(v2)}`));
  });
});
