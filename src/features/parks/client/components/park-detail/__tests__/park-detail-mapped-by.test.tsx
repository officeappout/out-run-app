/**
 * enable_park_mapped_by_credit — flag-off parity of the park sheet.
 *
 * The flag-off snapshots below were recorded from the UNMODIFIED
 * ParkDetailSheet (origin/main, before the "mapped by" line existed). With the
 * flag off the sheet must render byte-identical markup, classic and v2 shells,
 * for a team park, a community park and a park with no mappedBy at all.
 *
 * Static markup (react-dom/server, node env): effects never run, so the
 * data hooks that would hit Firestore are replaced by fixed values.
 * `<!-- -->` is stripped (react-dom/server's text-node separator).
 */
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Park } from '@/features/parks/core/types/park.types';

const flags: Record<string, boolean> = { enableHomeV2: false, enableMapPolishV1: false, enableParkMappedByCredit: false };
const mapState: { selectedPark: Park | null } = { selectedPark: null };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags, loading: false }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/user', () => {
  const state = { profile: null };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const useMapStore = (sel?: (s: typeof mapState) => unknown) => (sel ? sel(mapState) : mapState);
  return { useMapStore };
});
vi.mock('@/features/parks/core/map-polish', () => ({
  useMapPolishV1: () => false,
  useNavigateTo: () => () => false,
  parkTarget: () => null,
}));
vi.mock('../hooks/useParkDetailData', () => ({
  usePointFetchedPark: (_open: boolean, p: Park | null) => p,
  useParkReviews: () => ({
    reviews: [], setReviews: () => {}, reviewerNames: {}, reviewsExpanded: false, setReviewsExpanded: () => {},
  }),
  useParkEquipment: () => ({ parkEquipment: [], equipmentSections: [] }),
}));
vi.mock('../hooks/useParkSessions', () => ({
  useParkSessions: () => ({
    parkEvents: [], eventsLoading: false, filteredParkEvents: [], currentUid: null, isUserRegistered: () => false,
  }),
}));
vi.mock('../../contribution-wizard/SuggestEditSheet', () => ({ default: () => null }));
vi.mock('../../UserProfileSheet', () => ({ default: () => null }));
vi.mock('../../equipment-detail/EquipmentDetailDrawer', () => ({ default: () => null }));

import ParkDetailSheet from '../ParkDetailSheet';

const html = () =>
  renderToStaticMarkup(<ParkDetailSheet isOpen onClose={() => {}} />).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/park-detail-mapped-by/${name}.html`;

const BASE: Park = {
  id: 'park-1',
  name: 'גינת הכושר בפארק',
  city: 'שדרות',
  location: { lat: 31.52, lng: 34.6 },
  description: 'גינה מוצלת ליד המגרש',
  facilityType: 'gym_park',
  featureTags: [],
  status: 'open',
} as unknown as Park;

const PARKS: Record<string, Park> = {
  none: BASE,
  team: { ...BASE, mappedBy: { kind: 'team' } } as unknown as Park,
  community: { ...BASE, mappedBy: { kind: 'community', uid: 'u-adult', contributionId: 'c1' } } as unknown as Park,
};

beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => {
  flags.enableHomeV2 = false;
  flags.enableParkMappedByCredit = false;
});

for (const v2 of [false, true]) {
  for (const kind of Object.keys(PARKS)) {
    it(`flag off — ${kind} park, v2=${v2}: markup unchanged`, async () => {
      flags.enableHomeV2 = v2;
      mapState.selectedPark = PARKS[kind];
      await expect(html()).toMatchFileSnapshot(snap(`flag-off-${kind}-v${v2 ? 2 : 1}`));
    });
  }
}

// ── Flag on ────────────────────────────────────────────────────────────────
// The person case (a userPublic read in an effect) is covered by the jsdom
// tests in src/features/parks/core/mapped-by/__tests__.

it('flag on — park with no mappedBy (every pre-22.10.2026 park): no line, markup equals flag off', async () => {
  for (const v2 of [false, true]) {
    flags.enableHomeV2 = v2;
    flags.enableParkMappedByCredit = true;
    mapState.selectedPark = PARKS.none;
    await expect(html()).toMatchFileSnapshot(snap(`flag-off-none-v${v2 ? 2 : 1}`));
  }
});

it('flag on — team park: "מופה על ידי צוות OUT", the only difference from flag off', async () => {
  flags.enableParkMappedByCredit = true;
  mapState.selectedPark = PARKS.team;
  const on = html();
  expect(on).toContain('מופה על ידי צוות OUT');
  expect(on).toContain('data-kind="team"');
  flags.enableParkMappedByCredit = false;
  const off = html();
  const lineStart = on.indexOf('<p class="mb-4 flex items-center gap-1.5');
  const lineEnd = on.indexOf('</p>', lineStart) + '</p>'.length;
  expect(lineStart).toBeGreaterThan(0);
  expect(on.slice(0, lineStart) + on.slice(lineEnd)).toBe(off);
});

it('flag on — anonymous community park (no uid stored): "מופה על ידי קהילת OUT", no name', async () => {
  flags.enableParkMappedByCredit = true;
  mapState.selectedPark = { ...BASE, mappedBy: { kind: 'community', contributionId: 'c9' } } as unknown as Park;
  const on = html();
  expect(on).toContain('מופה על ידי קהילת OUT');
  expect(on).not.toContain('<button type="button" aria-label="מופה על ידי');
});

it('flag on — community park with a uid: nothing until the public profile resolves (no name flicker)', () => {
  flags.enableParkMappedByCredit = true;
  mapState.selectedPark = PARKS.community;
  expect(html()).not.toContain('data-testid="mapped-by-credit"');
});
