// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, keys `location.*`): the location step's sheets — snapshots
 * recorded BEFORE the extraction, from unmodified origin/main. The extraction commit must render
 * the same Hebrew markup.
 *
 * Covers the legacy sub-components (InitialCard, LocatingCard, SearchOverlay, ConfirmationCard —
 * v1 and v2 / enable_home_v2) and the entry-globe drawers (enable_entry_globe_v1: initial,
 * dive pill, drag chip, confirm, grouped search). Text that needs sessionStorage (name, gender,
 * persona, sport), a timer (the manual-search escape) or a tap (search chips, clear) is driven in
 * jsdom (react-dom/client); framer-motion is replaced by plain elements (i18n-dom-harness).
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text
 * nodes; react-dom/client emits none — stripped anyway, same rule as the static parity tests).
 *
 * Not covered here: EntryGlobeHeadline / EntryGlobeLayer / EntryLogoSlot / UnifiedLocationStep
 * (owner's design agents are editing them — not part of this extraction).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('framer-motion', async () => (await import('../../__tests__/i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/admin/services/authority.service', () => ({
  getAllAuthorities: async () => [],
  getChildrenByParent: async () => [],
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ InventoryService: {} }));

import { mount, type Mounted } from '../../__tests__/i18n-dom-harness';
import { InitialCard } from '../sub-components/InitialCard';
import { LocatingCard } from '../sub-components/LocatingCard';
import { SearchOverlay } from '../sub-components/SearchOverlay';
import { ConfirmationCard } from '../sub-components/ConfirmationCard';
import { EntryInitialDrawer } from '../entry-globe/EntryInitialDrawer';
import { DivePill } from '../entry-globe/DivePill';
import { DragHintChip } from '../entry-globe/DragHintChip';
import { EntryConfirmDrawer } from '../entry-globe/EntryConfirmDrawer';
import { EntrySearchOverlay } from '../entry-globe/EntrySearchOverlay';
import type { CityData, ConfirmationCardProps, NearbyFacility, SportContext } from '../location-types';

const snap = (name: string) => `./__snapshots__/location-i18n/${name}.html`;
const noop = () => {};
let m: Mounted | null = null;

async function render(el: ReactElement): Promise<Mounted> {
  m?.unmount();
  m = await mount(el);
  return m;
}
async function htmlOf(el: ReactElement): Promise<string> {
  return (await render(el)).html();
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  m?.unmount();
  m = null;
});

const city = (over: Partial<CityData>): CityData => ({
  id: 'x', name: 'x', displayName: 'x', type: 'city', lat: 32, lng: 34.8,
  trainers: 0, gyms: 0, isMapped: false, population: 1, ...over,
});
const CITIES: CityData[] = [
  city({ id: 'a', name: 'רמת אביב', parentName: 'תל אביב-יפו', type: 'neighborhood' as CityData['type'] }),
  city({ id: 'b', name: 'רמת גן', type: 'city' }),
  city({ id: 'c', name: 'גלבוע', type: 'regional_council' as CityData['type'] }),
  city({ id: 'd', name: 'כפר שמריהו', type: 'local_council' as CityData['type'] }),
  city({ id: 'e', name: 'רמות', type: 'settlement' as CityData['type'] }),
];

const park = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    kind: 'park', id, name: `גינת ${id}`, distanceMeters: 400, formattedDistance: '400 מ׳', distance: 0.4,
    location: { lat: 32, lng: 34.8 }, ...extra,
  }) as unknown as NearbyFacility;
const route = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    kind: 'route', id, name: `מסלול ${id}`, distanceMeters: 1200, formattedDistance: '1.2 ק״מ', distance: 1.2,
    activityType: 'running', ...extra,
  }) as unknown as NearbyFacility;

const SPORT: SportContext = {
  activities: [], prefersHybrid: false, isSpotFocus: false, isScenicFocus: false, showBenches: false, climbingFallback: false,
};

describe('InitialCard', () => {
  for (const v2 of [false, true]) {
    it(`every headline / subtitle branch, v${v2 ? 2 : 1}`, async () => {
      const out: string[] = [];
      for (const gender of ['male', 'female'] as const)
        for (const purpose of ['running', 'strength', undefined] as const)
          for (const mode of ['onboarding', 'explorer', 'bridge'] as const)
            for (const [hood, cityName] of [['הצפון הישן', 'תל אביב-יפו'], [null, 'חיפה'], [null, null]] as const)
              out.push(
                await htmlOf(
                  <InitialCard
                    gender={gender}
                    t={(a, b) => (gender === 'female' ? b : a)}
                    locationError={purpose === 'strength' ? 'לא הצלחנו לאתר מיקום' : null}
                    onFindLocation={noop}
                    onSearchManually={noop}
                    mode={mode}
                    detectedNeighborhood={hood}
                    detectedCity={cityName}
                    purpose={purpose}
                    v2={v2}
                  />,
                ),
              );
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`initial-card-v${v2 ? 2 : 1}`));
    });
  }
});

describe('LocatingCard', () => {
  it('v1', async () => {
    await expect(await htmlOf(<LocatingCard />)).toMatchFileSnapshot(snap('locating-v1'));
  });
  it('v2, before and after the manual-search escape', async () => {
    const r = await render(<LocatingCard v2 onSearchManually={noop} />);
    const before = r.html();
    await r.advance(4100);
    await expect([before, r.html()].join('\n')).toMatchFileSnapshot(snap('locating-v2'));
  });
});

describe('SearchOverlay', () => {
  for (const v2 of [false, true]) {
    it(`results / no results / empty, v${v2 ? 2 : 1}`, async () => {
      const out = [
        await htmlOf(<SearchOverlay searchQuery="רמ" onSearchChange={noop} filteredCities={CITIES} onCitySelect={noop} onBack={noop} v2={v2} />),
        await htmlOf(<SearchOverlay searchQuery="זזז" onSearchChange={noop} filteredCities={[]} onCitySelect={noop} onBack={noop} v2={v2} />),
        await htmlOf(<SearchOverlay searchQuery="" onSearchChange={noop} filteredCities={[]} onCitySelect={noop} onBack={noop} v2={v2} />),
      ];
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`search-overlay-v${v2 ? 2 : 1}`));
    });
  }
});

const confirmBase = (over: Partial<ConfirmationCardProps>): ConfirmationCardProps => ({
  displayName: 'רחוב הרצל 1',
  detectedNeighborhood: 'הצפון הישן',
  detectedCity: 'תל אביב-יפו',
  nearbyFacilities: [park('א', { rating: 4.5 }), route('ב', { rating: 3 })],
  isLoadingParks: false,
  isLoadingCurated: false,
  isUpdatingLocation: false,
  onConfirm: noop,
  onSearchOther: noop,
  brandingConfig: null,
  infraStats: { totalKm: 12, segmentCount: 40 },
  cityAssetCounts: { gyms: 5, courts: 3, nature: 2 },
  settlementNaming: null,
  curatedRouteCount: 2,
  heroRoute: null,
  sportContext: SPORT,
  bestMatchIndex: 0,
  trainingContext: null,
  ...over,
});

describe('ConfirmationCard', () => {
  for (const v2 of [false, true]) {
    it(`greeting / explorer / plain / updating / loading / pioneer, v${v2 ? 2 : 1}`, async () => {
      const out: string[] = [];
      for (const gender of ['male', 'female'] as const) {
        for (const name of ['דנה', '']) {
          sessionStorage.clear();
          sessionStorage.setItem('onboarding_personal_gender', gender);
          if (name) sessionStorage.setItem('onboarding_personal_name', name);
          sessionStorage.setItem('onboarding_selected_persona_ids', JSON.stringify(['student']));
          for (const mode of ['onboarding', 'explorer'] as const) {
            out.push(await htmlOf(<ConfirmationCard {...confirmBase({ mode, v2 })} />));
            out.push(await htmlOf(<ConfirmationCard {...confirmBase({ mode, v2, detectedCity: null, detectedNeighborhood: null })} />));
            out.push(await htmlOf(<ConfirmationCard {...confirmBase({ mode, v2, isUpdatingLocation: true })} />));
            out.push(await htmlOf(<ConfirmationCard {...confirmBase({ mode, v2, isLoadingParks: true, cityAssetCounts: null, infraStats: null })} />));
            // explorer + zero parks → the pioneer box without a fallback asset (gendered line)
            out.push(await htmlOf(<ConfirmationCard {...confirmBase({ mode, v2, nearbyFacilities: [] })} />));
          }
          // a sport with no matching facility → pioneer + plan B (fallback asset)
          sessionStorage.setItem('onboarding_selected_sports', JSON.stringify(['basketball']));
          out.push(await htmlOf(<ConfirmationCard {...confirmBase({ v2 })} />));
          out.push(
            await htmlOf(
              <ConfirmationCard {...confirmBase({ v2, nearbyFacilities: [park('ה', { facilityType: 'gym_park', rating: 4.2 }), route('ו')] })} />,
            ),
          );
          sessionStorage.removeItem('onboarding_selected_sports');
        }
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`confirmation-card-v${v2 ? 2 : 1}`));
    });
  }
});

describe('entry globe drawers (enable_entry_globe_v1)', () => {
  it('initial drawer, with and without an error', async () => {
    const out = [
      await htmlOf(<EntryInitialDrawer locationError={null} onFindLocation={noop} onSearchManually={noop} />),
      await htmlOf(<EntryInitialDrawer locationError="לא הצלחנו לאתר מיקום" onFindLocation={noop} onSearchManually={noop} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('entry-initial'));
  });

  it('drag chip + dive pill (before / after the manual escape, no escape)', async () => {
    const out = [await htmlOf(<DragHintChip />)];
    const r = await render(<DivePill onSearchManually={noop} />);
    out.push(r.html());
    await r.advance(4100);
    out.push(r.html());
    out.push(await htmlOf(<DivePill />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('entry-dive'));
  });

  it('confirm drawer: loading / park meta / pioneer × gender / no place', async () => {
    const out: string[] = [];
    const base = {
      displayName: 'רחוב הרצל 1',
      detectedNeighborhood: 'הצפון הישן' as string | null,
      detectedCity: 'תל אביב-יפו' as string | null,
      sportContext: SPORT,
      trainingContext: null,
      onConfirm: noop,
      onSearchOther: noop,
    };
    for (const gender of ['male', 'female'] as const) {
      out.push(await htmlOf(<EntryConfirmDrawer {...base} gender={gender} nearbyFacilities={[]} isLoadingParks />));
      out.push(await htmlOf(<EntryConfirmDrawer {...base} gender={gender} nearbyFacilities={[]} isLoadingParks={false} />));
      out.push(
        await htmlOf(
          <EntryConfirmDrawer
            {...base}
            gender={gender}
            isLoadingParks={false}
            nearbyFacilities={[park('א', { rating: 4.7, gymEquipment: new Array(6).fill({}) })]}
          />,
        ),
      );
      out.push(
        await htmlOf(
          <EntryConfirmDrawer
            {...base}
            gender={gender}
            isLoadingParks={false}
            nearbyFacilities={[park('ב', { rating: 0, gymEquipment: [{}] }), route('ג')]}
          />,
        ),
      );
      out.push(
        await htmlOf(
          <EntryConfirmDrawer
            {...base}
            gender={gender}
            isLoadingParks={false}
            detectedNeighborhood={null}
            detectedCity={null}
            displayName=""
            nearbyFacilities={[park('ד', { formattedDistance: '' })]}
          />,
        ),
      );
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('entry-confirm'));
  });

  it('grouped search: every chip, clear, no results, empty query', async () => {
    const out: string[] = [];
    const r = await render(
      <EntrySearchOverlay searchQuery="רמ" onSearchChange={noop} filteredCities={CITIES} onCitySelect={noop} onBack={noop} />,
    );
    out.push(r.html());
    const tabs = () => Array.from(document.querySelectorAll('[role="tab"]'));
    await r.click(tabs()[1]);
    out.push(r.html());
    await r.click(tabs()[2]);
    out.push(r.html());
    out.push(await htmlOf(<EntrySearchOverlay searchQuery="זזז" onSearchChange={noop} filteredCities={[]} onCitySelect={noop} onBack={noop} />));
    out.push(await htmlOf(<EntrySearchOverlay searchQuery="" onSearchChange={noop} filteredCities={[]} onCitySelect={noop} onBack={noop} />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('entry-search'));
  });
});
