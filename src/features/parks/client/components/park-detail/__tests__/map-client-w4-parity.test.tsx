// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 4: Hebrew DOM recorded from UNMODIFIED main for the park
 * components the wave-4 map PR (#914) skipped for lack of coverage: UserProfileSheet, FacilityCard, ParkItem,
 * ParkCardCompact (floating + inline), ParkPreview (classic and polish cards) and TrainingHereSheet.
 * The converted components must render the same Hebrew DOM apart from class tokens and `dir="rtl"`
 * (checked by scripts/i18n/wave4-snapshot-proof.ts).
 *
 * framer-motion is replaced by plain elements; stores, services and flags are fakes. Inline `style` attributes
 * are stripped and React `:rN:` ids normalised before comparing - neither is text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const hoisted = vi.hoisted(() => ({
  polish: { on: false },
  park: {
    id: 'p1', name: 'גינת כושר הירקון', city: 'תל אביב', location: { lat: 32.1, lng: 34.8 }, imageUrl: '',
    ratingAvg: 4.5, reviewCount: 12, gymEquipment: [{ id: 'e1' }, { id: 'e2' }], featureTags: ['night_lighting', 'water_fountain', 'shaded'],
  } as Record<string, unknown>,
}));

vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'drag', 'dragControls', 'dragListener',
    'dragConstraints', 'dragElastic', 'onDragEnd', 'onDragStart', 'onDrag', 'whileTap', 'whileHover', 'layout',
    'dragMomentum', 'onAnimationComplete', 'onPanEnd', 'layoutId',
  ]);
  const cache = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        const Plain = React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
          const rest: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
          return React.createElement(tag, { ...rest, ref });
        });
        Plain.displayName = `motion.${tag}`;
        cache.set(tag, Plain);
      }
      return cache.get(tag);
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useDragControls: () => ({ start: () => {} }),
    useAnimation: () => ({ start: async () => {} }),
    useMotionValue: (v: unknown) => ({ get: () => v, set: () => {} }),
    useTransform: () => ({ get: () => 0, set: () => {} }),
    useReducedMotion: () => false,
    useAnimationControls: () => ({ start: async () => {}, set: () => {} }),
    MotionGlobalConfig: {},
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/map' }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig<typeof import('firebase/firestore')>()),
  doc: () => ({}), getDoc: async () => ({ exists: () => false, data: () => ({}) }),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: { enableHomeV2: true, enableMapPolishV1: hoisted.polish.on, enableTrainingHereReminders: true },
    loading: false,
  }),
}));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'me', core: { gender: 'male', weight: 70, ageGroup: 'adult' } } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/social/store/useChatStore', () => ({
  useChatStore: (sel?: (s: Record<string, unknown>) => unknown) => {
    const s = { openDm: () => {}, startDirectChat: async () => null, createChat: async () => null };
    return sel ? sel(s) : s;
  },
}));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({
    liveUsersVisible: true, selectedPark: hoisted.park, setSelectedPark: noop, setPendingCommute: noop,
    setPendingParkWorkoutStart: noop,
  });
  const useMapStore = (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(state()) : state());
  (useMapStore as unknown as { getState: () => unknown }).getState = state;
  return { useMapStore };
});
vi.mock('@/features/parks/core/hooks/useShelterProximity', () => ({ useShelterProximity: () => ({ show: false, proximity: null }) }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ getPark: async () => hoisted.park, fetchRealParks: async () => [] }));
vi.mock('@/features/parks/core/map-polish', async (orig) => ({
  ...(await orig<typeof import('@/features/parks/core/map-polish')>()),
  useMapPolishV1: () => hoisted.polish.on,
  useNavigateTo: () => () => true,
}));
vi.mock('../ParkDetailSheet', () => ({ default: () => null }));
vi.mock('../../training-here/useTrainingHerePublish', () => ({
  useTrainingHerePublish: () => ({ publish: async () => null, saving: false, failed: false, resetFailed: () => {} }),
}));
vi.mock('@/features/parks/core/hooks/useGroupPresence', async (orig) => ({
  ...(await orig<typeof import('@/features/parks/core/hooks/useGroupPresence')>()),
  resolvePersonaImage: () => '/persona.png',
}));

import UserProfileSheet from '../../UserProfileSheet';
import FacilityCard, { FACILITY_TAGS } from '../FacilityCard';
import ParkItem from '../../park-item';
import ParkCardCompact from '../../park-preview/ParkCardCompact';
import { ParkPreview } from '../../park-preview';
import TrainingHereSheet from '../../training-here/TrainingHereSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}

let root: Root | null = null;
let host: HTMLElement | null = null;
const noop = () => {};

function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}
const dump = () =>
  document.body.innerHTML
    .replace(/ style="[^"]*"/g, '')
    .replace(/:r[0-9a-z]+:/g, ':r:')
    .replace(/«r[0-9a-z]+»/g, ':r:')
    .replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/map-client-w4/${name}.html`;
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T12:00:00'));
  hoisted.polish.on = false;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('UserProfileSheet', () => {
  const user = { uid: 'u2', name: 'דנה', personaId: 'p1', lemurStage: 2, activity: { status: 'running' }, liveLocation: { lat: 32, lng: 34.8 } };
  it('open, other user, with activity', async () => {
    mount(<UserProfileSheet isOpen onClose={noop} user={user} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('user-profile-open'));
  });
  it('open, polish (navigate button)', async () => {
    hoisted.polish.on = true;
    mount(<UserProfileSheet isOpen onClose={noop} user={user} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('user-profile-polish'));
  });
});

describe('FacilityCard', () => {
  it('mobile active / inactive', async () => {
    mount(<div><FacilityCard tag={FACILITY_TAGS[0]} isActive /><FacilityCard tag={FACILITY_TAGS[1]} isActive={false} /></div>);
    await expect(dump()).toMatchFileSnapshot(snap('facility-card-mobile'));
  });
});

describe('ParkItem', () => {
  it('row', async () => {
    mount(<ParkItem park={{ ...(hoisted.park as object), distance: 850 } as never} />);
    await expect(dump()).toMatchFileSnapshot(snap('park-item'));
  });
});

describe('ParkCardCompact', () => {
  const props = {
    name: 'גינת כושר הירקון', heroSrc: null, rating: { avg: 4.5, count: 12 }, metaParts: ['תל אביב', '1.2 ק״מ', '2 מכשירים'],
    amenityTags: ['night_lighting', 'water_fountain'] as never, onOpen: noop,
  };
  it('floating with close and navigate', async () => {
    mount(<ParkCardCompact {...props} onClose={noop} onNavigate={noop} />);
    await expect(dump()).toMatchFileSnapshot(snap('park-card-compact-floating'));
  });
  it('inline, selected, no buttons', async () => {
    mount(<ParkCardCompact {...props} layout="inline" selected />);
    await expect(dump()).toMatchFileSnapshot(snap('park-card-compact-inline'));
  });
});

describe('ParkPreview', () => {
  it('classic card', async () => {
    mount(<ParkPreview userLocation={{ lat: 32.0, lng: 34.7 }} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('park-preview-classic'));
  });
  it('polish card', async () => {
    hoisted.polish.on = true;
    mount(<ParkPreview userLocation={{ lat: 32.0, lng: 34.7 }} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('park-preview-polish'));
  });
});

describe('TrainingHereSheet', () => {
  const place = { kind: 'park' as const, id: 'p1', name: 'גינת כושר הירקון', lat: 32.1, lng: 34.8, distanceM: 850 };
  it('open, workout', async () => {
    mount(<TrainingHereSheet open onClose={noop} activity="workout" workoutLabel="אימון עליון · 45 דק׳" place={place} alternatives={[place, { ...place, id: 'p2', name: 'פארק הירקון' }]} onStartNow={noop} onPickOnly={noop} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('training-here-open'));
  });
});
