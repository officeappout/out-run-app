// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `library`, `exercises.*` keys): the exercise library's UI frame copy
 * (/library → /search?tab=exercises → ExerciseLibraryContent) moves to src/messages/he/library.json.
 * The snapshots below were recorded from the components BEFORE the extraction; the extracted
 * components must render the same Hebrew markup in every state that shows text:
 *   - the library body: loading, load error, empty corpus, no results, results (counter with a
 *     4-digit count, active-filter chips for every chip kind, the level pill), v1 and v2;
 *   - the funnel sheet (SecondaryFiltersSheet in FilterSheet): muscles + associated hint, tracks
 *     (master expanded / collapsed, standalone, unknown), locations, gear sections; loading states;
 *   - FilterSheet's own default footer (clear / apply);
 *   - the exercise detail sheet (ExerciseDetailSheet → MasterExerciseView), v1 and v2: progression
 *     chain, performance card (every relative-day branch, with / without sets), programs chip and
 *     its open dropdown, equipment column (0 / 1 / 3 items, bodyweight placeholder), the open
 *     location dropdown, anatomy, cues, description, goal, instructions, tips;
 *   - LocationVariantSwitcher's label for every known location + an unknown one.
 *
 * Rendered with react-dom/client in jsdom: the sheets portal to document.body after mount and the
 * dropdowns position themselves in an effect, which static markup can't reach.
 * Before comparing: React's `<!-- -->` text separators are dropped, `style` attributes are removed
 * and React `:rN:` ids are normalised (layout noise, not text).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const st = vi.hoisted(() => ({
  v2: false,
  filters: {
    paginated: [] as unknown[],
    visibleCount: 0,
    hasMore: false,
    loadMore: () => {},
    isLoading: false,
    loadError: null as string | null,
    totalCount: 0,
  },
  programs: [] as unknown[],
  gear: [] as unknown[],
  master: null as unknown,
  mapHref: '/progression-map/p-push' as string | null,
}));

const router = { push: () => {}, replace: () => {}, back: () => {} };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: st.v2 }, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'u1', core: { isSuperAdmin: false } } };
  return { useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state) };
});
vi.mock('@/features/workout-engine/services/user-profile.utils', () => ({ hasPersona: () => false }));
vi.mock('../hooks/useExerciseLibraryFilters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useExerciseLibraryFilters')>()),
  useExerciseLibraryFilters: () => st.filters,
}));
vi.mock('../hooks/useExerciseMasterData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useExerciseMasterData')>()),
  useExerciseMasterData: () => st.master,
}));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: async () => st.programs }));
vi.mock('@/features/content/equipment/gear/core/gear-definition.service', () => ({ getAllGearDefinitions: async () => st.gear }));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({
  ensureEquipmentCachesLoaded: async () => {},
  getMuscleGroupLabel: (m: string) => `שריר-${m}`,
  resolveEquipmentLabel: (id: string) => (id === 'g-unknown' ? 'ציוד לא מזוהה' : `ציוד-${id}`),
  resolveEquipmentSvgPathList: (id: string) => (id === 'g-bar' ? ['/icons/bar.svg'] : []),
}));
vi.mock('@/lib/progression-map-config', () => ({
  resolveTreeProgramId: () => null,
  resolveExerciseProgressionMapHref: () => st.mapHref,
}));
vi.mock('../components/ExerciseVideoPlayer', () => ({ default: () => <div data-testid="video" /> }));
vi.mock('recharts', () => ({
  AreaChart: () => <div data-testid="chart" />,
  Area: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MotionGlobalConfig } from 'framer-motion';
import { ExerciseLibraryContent } from '../ExerciseLibraryPage';
import FilterSheet from '../components/FilterSheet';
import MasterExerciseView from '../components/MasterExerciseView';
import LocationVariantSwitcher from '../components/LocationVariantSwitcher';
import { useExerciseLibraryStore, BODYWEIGHT_SENTINEL } from '../store/useExerciseLibraryStore';
import type { Exercise } from '../../core/exercise.types';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
MotionGlobalConfig.skipAnimations = true;

const NOW = new Date('2026-10-15T12:00:00');
const DAY = 86_400_000;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

let root: Root | null = null;
let host: HTMLElement | null = null;
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};
async function mount(el: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  await flush();
}
const html = () =>
  document.body.innerHTML
    .replaceAll('<!-- -->', '')
    .replace(/ style="[^"]*"/g, '')
    .replace(/:r[0-9a-z]+:/g, ':r:');
async function click(selector: string) {
  const el = document.body.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`no element ${selector}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await flush();
}
const snap = (name: string) => `./__snapshots__/library-i18n/${name}.html`;

const DEFAULT_STORE = { ...useExerciseLibraryStore.getState() };
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  st.v2 = false;
  st.filters = { paginated: [], visibleCount: 0, hasMore: false, loadMore: () => {}, isLoading: false, loadError: null, totalCount: 0 };
  st.programs = [];
  st.gear = [];
  st.master = null;
  st.mapHref = '/progression-map/p-push';
  useExerciseLibraryStore.setState(DEFAULT_STORE, true);
});

// ── Fixtures ───────────────────────────────────────────────────────────────
const method = (location: string, gearIds: string[], idx: number) => ({
  location,
  gearIds,
  media: { mainVideoUrl: `https://cdn.example.com/0000000${idx}-0000-0000-0000-000000000000/play_360p.mp4` },
});
const ex = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    name: { he: `תרגיל ${id}` },
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    targetPrograms: [{ programId: 'p-push', level: 4 }, { programId: 'p-core', level: 2 }],
    execution_methods: [method('park', ['g-bar'], 1), method('home', [], 2), method('service', [], 3)],
    ...over,
  }) as unknown as Exercise;

const PROGRAMS = [
  { id: 'm-upper', name: 'קליסטניקס עליון', isMaster: true, subPrograms: ['p-push', 'p-pull'] },
  { id: 'p-push', name: 'דחיפה', maxLevels: 6 },
  { id: 'p-pull', name: 'משיכה', maxLevels: 6 },
  { id: 'p-core', name: 'ליבה', maxLevels: 5 },
  { id: 'p-flag', name: 'דגל אנושי' },
];
const GEAR = [
  { id: 'g-bar', name: { he: 'מתח' }, category: 'stationary' },
  { id: 'g-chair', name: { he: 'כיסא' }, category: 'improvised' },
  { id: 'g-band', name: { en: 'Band' }, category: 'personal' },
];

// ── Library body ──────────────────────────────────────────────────────────
describe('ExerciseLibraryContent — Hebrew markup unchanged by the i18n extraction', () => {
  for (const v2 of [false, true]) {
    const v = v2 ? 'v2' : 'v1';
    it(`loading · ${v}`, async () => {
      st.v2 = v2;
      st.filters = { ...st.filters, isLoading: true };
      await mount(<ExerciseLibraryContent />);
      await expect(html()).toMatchFileSnapshot(snap(`body-loading-${v}`));
    });
    it(`load error · ${v}`, async () => {
      st.v2 = v2;
      st.filters = { ...st.filters, loadError: 'permission-denied' };
      await mount(<ExerciseLibraryContent />);
      await expect(html()).toMatchFileSnapshot(snap(`body-error-${v}`));
    });
    it(`empty corpus · ${v}`, async () => {
      st.v2 = v2;
      await mount(<ExerciseLibraryContent />);
      await expect(html()).toMatchFileSnapshot(snap(`body-empty-corpus-${v}`));
    });
    it(`no results · ${v}`, async () => {
      st.v2 = v2;
      st.filters = { ...st.filters, totalCount: 40 };
      await mount(<ExerciseLibraryContent />);
      await expect(html()).toMatchFileSnapshot(snap(`body-no-results-${v}`));
    });
    for (const location of ['park', 'home'] as const) {
      it(`results + every chip kind · ${location} · ${v}`, async () => {
        st.v2 = v2;
        st.programs = PROGRAMS;
        st.gear = GEAR;
        st.filters = { ...st.filters, paginated: [ex('a'), ex('b', { primaryMuscle: undefined, muscleGroups: [] })], visibleCount: 1234, totalCount: 2000, hasMore: true };
        await mount(<ExerciseLibraryContent />);
        act(() =>
          useExerciseLibraryStore.setState({
            filters: {
              query: '',
              muscles: ['chest', 'glutes'],
              levelsByProgram: { 'p-push': [2, 3], 'p-missing': [] },
              equipmentIds: [BODYWEIGHT_SENTINEL, 'g-bar', 'g-band', 'g-gone'],
              location,
            },
          }),
        );
        await flush();
        await expect(html()).toMatchFileSnapshot(snap(`body-results-${location}-${v}`));
      });
    }
  }
});

// ── Funnel sheet ──────────────────────────────────────────────────────────
describe('SecondaryFiltersSheet — Hebrew markup unchanged by the i18n extraction', () => {
  for (const v2 of [false, true]) {
    const v = v2 ? 'v2' : 'v1';
    it(`loading programs + gear · ${v}`, async () => {
      st.v2 = v2;
      await mount(<ExerciseLibraryContent />);
      act(() => useExerciseLibraryStore.getState().setSecondaryFiltersOpen(true));
      await flush();
      await expect(html()).toMatchFileSnapshot(snap(`filters-loading-${v}`));
    });
    it(`full, master expanded, track + location drafted · ${v}`, async () => {
      st.v2 = v2;
      st.programs = PROGRAMS;
      st.gear = GEAR;
      st.filters = { ...st.filters, paginated: [ex('a')], visibleCount: 1, totalCount: 1 };
      await mount(<ExerciseLibraryContent />);
      act(() => {
        useExerciseLibraryStore.setState({
          allExercises: Array.from({ length: 1200 }, (_, i) => ex(`x${i}`)),
          filters: { query: '', muscles: ['chest'], levelsByProgram: { 'm-upper': [], 'p-core': [1, 3] }, equipmentIds: [], location: 'home' },
        });
        useExerciseLibraryStore.getState().setSecondaryFiltersOpen(true);
      });
      await flush();
      await expect(html()).toMatchFileSnapshot(snap(`filters-full-collapsed-${v}`));
      await click('button[aria-expanded="false"][aria-label]');
      await expect(html()).toMatchFileSnapshot(snap(`filters-full-expanded-${v}`));
    });
  }

  it('FilterSheet default footer (clear / apply)', async () => {
    await mount(
      <FilterSheet isOpen title="כותרת" onClose={() => {}} onClear={() => {}} onApply={() => {}}>
        <p>גוף</p>
      </FilterSheet>,
    );
    await expect(html()).toMatchFileSnapshot(snap('filter-sheet-default-footer'));
  });
});

// ── Detail sheet / MasterExerciseView ─────────────────────────────────────
type Trend = Array<{ maxReps: number; reps: number[]; date: Date }>;
const trend = (count: number, daysAgo: number, sets: number): Trend =>
  Array.from({ length: count }, (_, i) => ({
    maxReps: 10 + i,
    reps: i === 0 ? Array.from({ length: sets }, () => 8) : [5],
    date: new Date(NOW.getTime() - (daysAgo + i) * DAY),
  }));
const masterData = (over: Record<string, unknown> = {}) => ({
  sheetData: {
    name: 'שכיבות סמיכה',
    tutorial: undefined,
    legacy: null,
    posterUrl: null,
    primaryKey: 'chest',
    secondaryKeys: ['triceps'],
    equipmentIds: ['g-bar', 'g-unknown'],
    description: 'תיאור התרגיל',
    goal: 'חיזוק החזה',
    instructions: 'שלב ראשון\nשלב שני',
    cues: ['גב ישר', 'מרפקים צמודים'],
    tips: ['נשימה'],
  },
  trend: trend(3, 0, 4),
  isLoadingTrend: false,
  progressionChain: { prev: ex('prev'), current: ex('cur'), next: ex('next', { targetPrograms: [{ programId: 'p-push', level: 9 }] }) },
  userLevelInTrack: 5,
  programs: [
    { programId: 'p-push', label: 'דחיפה', level: 4, iconKey: 'push' },
    { programId: 'p-core', label: 'ליבה', level: 2 },
  ],
  ...over,
});

describe('MasterExerciseView — Hebrew markup unchanged by the i18n extraction', () => {
  for (const v2 of [false, true]) {
    const v = v2 ? 'v2' : 'v1';
    it(`detail sheet from the library (global store) · ${v}`, async () => {
      st.v2 = v2;
      st.master = masterData();
      await mount(<ExerciseLibraryContent />);
      act(() => useExerciseLibraryStore.getState().openDetail(ex('cur')));
      await flush();
      await expect(html()).toMatchFileSnapshot(snap(`detail-sheet-${v}`));
    });

    const perfCases: Array<[string, number, number, number]> = [
      ['today', 3, 0, 4],
      ['yesterday', 1, 1, 0],
      ['days', 2, 4, 3],
      ['weeks', 2, 15, 0],
      ['months', 2, 95, 2],
      ['many-sessions', 1200, 0, 1],
    ];
    for (const [name, count, daysAgo, sets] of perfCases) {
      it(`performance card · ${name} · ${v}`, async () => {
        st.v2 = v2;
        st.master = masterData({ trend: trend(count, daysAgo, sets) });
        await mount(<MasterExerciseView exercise={ex('cur')} />);
        const card = document.body.querySelector('button[aria-label]')?.outerHTML ?? '';
        await expect(card.replaceAll('<!-- -->', '').replace(/ style="[^"]*"/g, '')).toMatchFileSnapshot(snap(`perf-${name}-${v}`));
      });
    }

    it(`full view, programs dropdown open · ${v}`, async () => {
      st.v2 = v2;
      st.master = masterData();
      await mount(<MasterExerciseView exercise={ex('cur')} notice="מעל הרמה שלך" />);
      await click('button[aria-haspopup="listbox"]');
      await expect(html()).toMatchFileSnapshot(snap(`mev-programs-open-${v}`));
    });

    it(`full view, location dropdown open · ${v}`, async () => {
      st.v2 = v2;
      st.master = masterData();
      await mount(<MasterExerciseView exercise={ex('cur')} filterLocation="park" />);
      const triggers = document.body.querySelectorAll('button[aria-haspopup="listbox"]');
      const last = triggers[triggers.length - 1] as HTMLElement;
      await act(async () => { last.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
      await expect(html()).toMatchFileSnapshot(snap(`mev-location-open-${v}`));
    });

    it(`bodyweight variant, single program, no map, loading trend · ${v}`, async () => {
      st.v2 = v2;
      st.mapHref = null;
      st.master = masterData({
        sheetData: { ...(masterData().sheetData), equipmentIds: [], instructions: 'צעד יחיד', cues: [], tips: [], goal: '', description: '' },
        isLoadingTrend: true,
        trend: [],
        programs: [{ programId: 'p-push', label: 'דחיפה', level: 4 }],
        progressionChain: { prev: null, current: ex('cur'), next: ex('next') },
        userLevelInTrack: null,
      });
      await mount(<MasterExerciseView exercise={ex('cur', { execution_methods: [method('home', [], 1), method('park', [], 2)] })} />);
      await expect(html()).toMatchFileSnapshot(snap(`mev-bodyweight-${v}`));
    });

    it(`three gear items, no programs, primary only · ${v}`, async () => {
      st.v2 = v2;
      st.master = masterData({
        sheetData: { ...(masterData().sheetData), equipmentIds: ['g-bar', 'g-chair', 'g-band'] },
        trend: null,
        programs: [],
        progressionChain: { prev: null, current: null, next: null },
      });
      await mount(<MasterExerciseView exercise={ex('cur', { secondaryMuscles: [] })} />);
      await expect(html()).toMatchFileSnapshot(snap(`mev-three-gear-${v}`));
    });

    it(`secondary muscles only · ${v}`, async () => {
      st.v2 = v2;
      st.master = masterData({ trend: null });
      await mount(<MasterExerciseView exercise={ex('cur', { primaryMuscle: undefined })} />);
      await expect(html()).toMatchFileSnapshot(snap(`mev-secondary-only-${v}`));
    });
  }
});

// ── Location labels ───────────────────────────────────────────────────────
describe('LocationVariantSwitcher — every location label', () => {
  it('trigger label per location (incl. an unknown value)', async () => {
    const locs = ['home', 'park', 'gym', 'street', 'office', 'school', 'airport', 'library', 'desk', 'service', 'beach'];
    await mount(
      <div>
        {locs.map((l) => (
          <LocationVariantSwitcher
            key={l}
            activeLocation={l}
            canSwitch={false}
            options={[]}
            open={false}
            onToggleOpen={() => {}}
            onClose={() => {}}
            onSelect={() => {}}
          />
        ))}
      </div>,
    );
    await expect(html()).toMatchFileSnapshot(snap('location-labels'));
  });
});
