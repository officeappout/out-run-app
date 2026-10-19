// @vitest-environment jsdom
/**
 * ParkDetailSheet split (no-monster-files refactor) — the safety net.
 *
 * The committed snapshot was recorded from the single-file component BEFORE
 * it was split into park-detail/sections/* + hooks + utils. Every case must
 * stay byte-identical in BOTH flag states (enable_home_v2 off/on), including
 * after interactions (state lives in the parent; sections only render), and
 * the data-access log (which reads/listeners fire, with which args, in which
 * order, plus cleanup on unmount) must match too.
 */
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: string[] = [];
const log = (name: string, ...args: unknown[]) => calls.push(`${name}(${JSON.stringify(args)})`);

const flags = { enableHomeV2: false };
const profile = {
  id: 'u1',
  core: { isSuperAdmin: false, name: 'דנה' },
  social: { groupIds: ['g1'] },
  progression: { activePrograms: [{ name: 'כוח', templateId: 'push' }], tracks: { push: { currentLevel: 3 } } },
};
const mapState: { selectedPark: Record<string, unknown> | null } = { selectedPark: null };
const scenario: {
  park: Record<string, unknown> | null;
  events: unknown[];
  eventsLoading: boolean;
  reviews: unknown[];
  equipment: Record<string, unknown>;
  registered: string[];
} = { park: null, events: [], eventsLoading: false, reviews: [], equipment: {}, registered: [] };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: Object.assign(
    (sel?: (s: { profile: typeof profile }) => unknown) => (sel ? sel({ profile }) : { profile }),
    { getState: () => ({ profile }) },
  ),
}));
vi.mock('@/lib/firebase', () => ({
  db: {},
  app: {},
  auth: { currentUser: { uid: 'u1', displayName: 'דנה', photoURL: null } },
}));
vi.mock('@/features/parks/core/store/useMapStore', () => ({ useMapStore: () => mapState }));
vi.mock('@/features/parks/core/services/parks.service', () => ({
  getPark: (id: string) => {
    log('getPark', id);
    return Promise.resolve(scenario.park);
  },
}));
vi.mock('@/features/parks/core/services/park-detail-completeness', () => ({
  logParkDetailTripwireIfIncomplete: (p: { id: string }, why: string) => log('tripwire', p.id, why),
}));
vi.mock('@/features/parks/core/services/contribution.service', () => ({
  getReviewsForPark: (id: string) => {
    log('getReviewsForPark', id);
    return Promise.resolve(scenario.reviews);
  },
  getReviewerNames: (uids: string[]) => {
    log('getReviewerNames', uids);
    return Promise.resolve(Object.fromEntries(uids.map((u) => [u, `שם-${u}`])));
  },
  createContribution: async (c: unknown) => log('createContribution', c),
  recomputeAndSaveParkRating: async (id: string) => log('recompute', id),
}));
vi.mock('@/features/parks/core/hooks/useCommunityEnrichment', () => ({
  useParkEvents: (parkId: string | null, groupIds: string[]) => {
    log('useParkEvents', parkId, groupIds);
    return { events: scenario.events, loading: scenario.eventsLoading };
  },
  matchesDayFilter: (nextStartTime: string, filter: string) => {
    if (filter === 'week') return true;
    const d = new Date(nextStartTime);
    if (isNaN(d.getTime())) return true;
    const now = new Date();
    if (filter === 'today') return d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.toDateString() === tomorrow.toDateString();
  },
}));
vi.mock('@/features/parks/core/hooks/useMyRegistrations', () => ({
  useMyRegistrations: (ids: string[]) => {
    log('useMyRegistrations', ids);
    return new Set(scenario.registered);
  },
}));
vi.mock('@/features/admin/services/community.service', () => ({
  joinEvent: async (...a: unknown[]) => log('joinEvent', ...a),
  materializeVirtualSession: async (...a: unknown[]) => log('materialize', ...a),
}));
vi.mock('@/features/admin/services/planned-sessions.service', () => ({
  createPlannedSession: async (s: unknown) => log('createPlannedSession', s),
}));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getGymEquipment: (id: string) => {
    log('getGymEquipment', id);
    return Promise.resolve(scenario.equipment[id] ?? null);
  },
}));
vi.mock('@/features/parks/client/components/UserProfileSheet', () => ({
  default: ({ isOpen, user }: { isOpen: boolean; user: { uid: string } | null }) => (
    <div data-stub="profile" data-open={String(isOpen)} data-uid={user?.uid ?? ''} />
  ),
}));
vi.mock('@/features/parks/client/components/equipment-detail/EquipmentDetailDrawer', () => ({
  default: (p: { isOpen: boolean; equipmentId: string | null; brandName: string | null; pinnedToPark?: boolean }) => (
    <div data-stub="equipment-drawer" data-open={String(p.isOpen)} data-id={p.equipmentId ?? ''} data-brand={p.brandName ?? ''} data-pinned={String(!!p.pinnedToPark)} />
  ),
}));
vi.mock('@/features/parks/client/components/equipment-detail/EquipmentCard', () => ({
  default: (p: { equipment: { id: string; name?: string }; brandName: string; layout: string; onClick: () => void }) => (
    <button data-stub="equipment-card" data-id={p.equipment.id} data-brand={p.brandName} data-layout={p.layout} onClick={p.onClick}>
      {p.equipment.name}
    </button>
  ),
}));
vi.mock('@/features/parks/client/components/contribution-wizard/SuggestEditSheet', () => ({
  default: ({ isOpen, park }: { isOpen: boolean; park: { id: string } }) => (
    <div data-stub="suggest-edit" data-open={String(isOpen)} data-park={park.id} />
  ),
}));

import { MotionGlobalConfig } from 'framer-motion';
import ParkDetailSheet from '@/features/parks/client/components/park-detail/ParkDetailSheet';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
// Deterministic markup: framer animations jump straight to their targets.
MotionGlobalConfig.skipAnimations = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date('2026-10-19T09:00:00Z');
const at = (days: number, hh: number, mm = 0) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hh, mm, 0, 0);
  return d.toISOString();
};

const FULL_PARK = {
  id: 'p1',
  name: 'פארק הירקון — גינת כושר צפונית עם שם ארוך',
  imageUrl: 'https://cdn.example/park.jpg',
  facilityType: 'gym_park',
  city: 'תל אביב',
  status: 'under_repair',
  rating: 4.2,
  location: { lat: 32.1, lng: 34.8 },
  featureTags: ['night_lighting', 'shaded', 'water_fountain'],
  description: 'גינה גדולה ליד הנהר.',
  primaryBrand: 'Ludos',
  gymEquipment: [
    { equipmentId: 'e1', brandName: 'Urbanics' },
    { equipmentId: 'e2', brandName: '' },
    { equipmentId: 'e3', brandName: '' },
    { equipmentId: 'missing', brandName: '' },
  ],
};
const MIN_PARK = { id: 'p2', name: 'פינה קטנה' };

const EQUIPMENT = {
  e1: { id: 'e1', name: 'מתח', isFunctional: true },
  e2: { id: 'e2', name: 'אופניים', isCardio: true },
  e3: { id: 'e3', name: 'לחיצת חזה', isCardio: false },
};

const EVENTS = [
  {
    eventId: 'g1_x_2026-10-19', eventLabel: 'קבוצת בוקר', nextStartTime: at(0, 17), currentRegistrations: 4,
    plannedCount: 4, isRecurring: true, groupId: 'g1',
    avatars: [{ uid: 'a', name: 'אבי', photoURL: 'https://cdn.example/a.jpg' }, { uid: 'b', name: 'בתיה' }, { uid: 'c', name: 'גיל' }],
  },
  { eventId: 'ev2', eventLabel: 'אימון פתוח', nextStartTime: at(0, 18), currentRegistrations: 0, plannedCount: 0, avatars: [] },
  { eventId: 'ev3', eventLabel: 'אימון מלא', nextStartTime: at(0, 19), currentRegistrations: 10, plannedCount: 10, spotsLeft: 0, avatars: [{ uid: 'u1', name: 'דנה' }] },
  { eventId: 'ev4', eventLabel: 'רשום', nextStartTime: at(0, 20), currentRegistrations: 2, plannedCount: 2, avatars: [] },
  { eventId: 'arr1', eventLabel: 'דנה', nextStartTime: at(0, 21), currentRegistrations: 1, plannedCount: 1, isPersonalArrival: true, privacyMode: 'squad', avatars: [{ uid: 'u1', name: 'דנה' }] },
  { eventId: 'arr2', eventLabel: 'יוסי', nextStartTime: at(0, 21, 30), currentRegistrations: 1, plannedCount: 1, isPersonalArrival: true, privacyMode: 'verified_global', avatars: [{ uid: 'y', name: 'יוסי' }] },
  { eventId: 'arr3', eventLabel: 'סוד', nextStartTime: at(0, 22), currentRegistrations: 1, plannedCount: 1, isPersonalArrival: true, privacyMode: 'squad', avatars: [{ uid: 'z', name: 'סוד' }] },
  { eventId: 'ev5', eventLabel: 'מחר', nextStartTime: at(1, 7, 15), currentRegistrations: 3, plannedCount: 3, avatars: [] },
  { eventId: 'ev6', eventLabel: 'בעוד 3 ימים', nextStartTime: at(3, 6), currentRegistrations: 1, plannedCount: 1, avatars: [] },
];

const REVIEWS = [
  { id: 'r1', userId: 'ua', rating: 5, comment: 'מעולה', createdAt: new Date('2026-10-01T10:00:00Z'), photoUrl: 'https://cdn.example/r1.jpg' },
  { id: 'r2', userId: 'ub', rating: 3, createdAt: new Date('2026-09-20T10:00:00Z') },
  { id: 'r3', userId: 'uc', rating: 4, comment: 'נחמד', createdAt: { toDate: () => new Date('2026-08-02T10:00:00Z') } },
  { id: 'r4', userId: 'ud', rating: 2, createdAt: '2026-07-07T10:00:00Z', photoUrl: 'https://cdn.example/r4.jpg' },
  { id: 'r5', userId: 'ue', comment: 'בלי דירוג' },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

async function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  await flush();
}
/**
 * The markup is snapshotted as sha256 + length (the full dumps are ~800 KB).
 * To see the actual markup / diff it, run with PARITY_DUMP=<dir> — every
 * snapshot is also written there as <test>--<name>.html.
 */
function markup(name: string) {
  const html = document.body.innerHTML;
  const dir = process.env.PARITY_DUMP;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const file = `${expect.getState().currentTestName}--${name}`.replace(/[^\w\u0590-\u05ff-]+/g, '_');
    writeFileSync(join(dir, `park--${file}.html`), html);
  }
  return { sha256: createHash('sha256').update(html).digest('hex'), length: html.length };
}

function byText(text: string, tag = 'button'): HTMLElement {
  const el = Array.from(document.body.querySelectorAll<HTMLElement>(tag)).find((n) => n.textContent?.includes(text));
  if (!el) throw new Error(`no <${tag}> with text "${text}"`);
  return el;
}
async function click(el: Element | null) {
  if (!el) throw new Error('missing element');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.6);
  calls.length = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  root = null;
  host = null;
  flags.enableHomeV2 = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const noop = () => {};

function setFull() {
  scenario.park = FULL_PARK;
  mapState.selectedPark = { id: 'p1', name: 'שם מקדים מהמפה', location: { lat: 32.1, lng: 34.8 } };
  scenario.events = EVENTS;
  scenario.eventsLoading = false;
  scenario.reviews = REVIEWS;
  scenario.equipment = EQUIPMENT;
  scenario.registered = ['ev4'];
}

for (const v2 of [false, true]) {
  describe(`ParkDetailSheet — flag ${v2 ? 'on' : 'off'}`, () => {
    beforeEach(() => {
      flags.enableHomeV2 = v2;
    });

    it('full park: initial render + data access', async () => {
      setFull();
      await mount(<ParkDetailSheet isOpen onClose={noop} onStartWorkout={noop} userLocation={{ lat: 32.0, lng: 34.75 }} />);
      expect(markup('markup')).toMatchSnapshot('markup');
      expect(document.body.style.overflow).toBe('hidden');
      await act(async () => root?.unmount());
      root = null;
      expect(document.body.style.overflow).toBe('');
      expect(calls).toMatchSnapshot('calls');
    });

    it('full park: interactions (picker, week, rating, reviews, photo, profile, equipment, suggest-edit)', async () => {
      setFull();
      await mount(<ParkDetailSheet isOpen onClose={noop} onStartWorkout={noop} userLocation={null} />);
      await click(byText(v2 ? 'אני מגיע…' : 'אני מגיע ב...'));
      expect(markup('time picker (today)')).toMatchSnapshot('time picker (today)');
      await click(byText('השבוע'));
      expect(markup('week + date input')).toMatchSnapshot('week + date input');
      await click(byText('מחר'));
      expect(markup('tomorrow')).toMatchSnapshot('tomorrow');
      await click(byText('דרג את המקום'));
      expect(markup('rating open')).toMatchSnapshot('rating open');
      const stars = Array.from(document.body.querySelectorAll('button')).filter((b) => b.className.includes('p-0.5 transition-transform'));
      await click(stars[3] ?? null);
      expect(markup('rating with stars')).toMatchSnapshot('rating with stars');
      await click(byText('צפה בעוד ביקורות'));
      await click(document.body.querySelector('button img[src="https://cdn.example/r1.jpg"]')?.parentElement ?? null);
      expect(markup('reviews expanded + lightbox')).toMatchSnapshot('reviews expanded + lightbox');
      await click(document.body.querySelector('[data-stub="equipment-card"][data-id="e1"]'));
      expect(markup('equipment drawer')).toMatchSnapshot('equipment drawer');
      await click(document.body.querySelector('button[title="עדכן פרטים"]'));
      expect(markup('suggest edit')).toMatchSnapshot('suggest edit');
    });

    it('full park: publish arrival + join + rating submit (handlers unchanged)', async () => {
      setFull();
      await mount(<ParkDetailSheet isOpen onClose={noop} onStartWorkout={noop} userLocation={null} />);
      calls.length = 0;
      await click(byText(v2 ? 'אני מגיע…' : 'אני מגיע ב...'));
      await click(byText('פרסם'));
      expect(markup('after publish')).toMatchSnapshot('after publish');
      await click(byText('הצטרף'));
      await click(byText('דרג את המקום'));
      const starBtns = Array.from(document.body.querySelectorAll('button')).filter((b) => b.className.includes('p-0.5 transition-transform'));
      await click(starBtns[4]);
      const input = document.body.querySelector<HTMLInputElement>('input[type="text"]')!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, '  נהדר  ');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click(byText('שלח'));
      expect(markup('after rating submit')).toMatchSnapshot('after rating submit');
      expect(calls).toMatchSnapshot('handler calls');
    });

    it('minimal park, events loading, sheet closed→open', async () => {
      scenario.park = MIN_PARK;
      mapState.selectedPark = MIN_PARK;
      scenario.events = [];
      scenario.eventsLoading = true;
      scenario.reviews = [];
      scenario.equipment = {};
      scenario.registered = [];
      await mount(<ParkDetailSheet isOpen={false} onClose={noop} />);
      expect(markup('closed')).toMatchSnapshot('closed');
      await act(async () => root!.render(<ParkDetailSheet isOpen onClose={noop} />));
      await flush();
      expect(markup('open')).toMatchSnapshot('open');
      expect(calls).toMatchSnapshot('calls');
    });

    it('no selected park renders nothing', async () => {
      mapState.selectedPark = null;
      await mount(<ParkDetailSheet isOpen onClose={noop} />);
      expect(markup('empty')).toMatchSnapshot();
    });
  });
}
