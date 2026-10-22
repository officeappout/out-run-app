/**
 * i18n wave 2 (namespace `map`, `parkDetail.*` keys): the park page's section
 * copy (who's coming, arrival publish row, rating, reviews, meta row, action
 * bar, amenities, equipment, photos, hero category badge) moves to
 * src/messages/he/map.json. These snapshots were recorded from the components
 * BEFORE the extraction; the extracted components must render the same Hebrew
 * markup in every state that shows text — v1 and v2 (enable_home_v2) shells,
 * empty / loading / filled, every session-row badge, every day filter.
 *
 * Static markup (react-dom/server), node environment — every section is a
 * presentational component driven by props.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between
 * adjacent text nodes; not rendered text).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { motionValue } from 'framer-motion';
import type { Park } from '@/features/parks/core/types/park.types';
import type { SessionEnrichment, DayFilter } from '@/features/parks/core/hooks/useCommunityEnrichment';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { UserContribution } from '@/types/contribution.types';
import { useLocaleStore } from '@/store/useLocaleStore';
import ParkPulseSection from '../sections/ParkPulseSection';
import ParkSessionRow from '../sections/ParkSessionRow';
import ArrivalPublishPanel from '../sections/ArrivalPublishPanel';
import ParkRatingSection from '../sections/ParkRatingSection';
import ParkReviewsSection from '../sections/ParkReviewsSection';
import ParkMetaRow from '../sections/ParkMetaRow';
import ParkActionBar from '../sections/ParkActionBar';
import ParkAmenitiesSection from '../sections/ParkAmenitiesSection';
import ParkEquipmentSection from '../sections/ParkEquipmentSection';
import ParkPhotosSection from '../sections/ParkPhotosSection';
import ParkHero from '../sections/ParkHero';
import { categorizeParkEquipment } from '../utils/park-detail-logic';

const NOW = new Date('2026-10-22T12:00:00');
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/park-detail-i18n/${name}.html`;
const noop = () => {};
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS); });

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const ev = (over: Partial<SessionEnrichment>): SessionEnrichment => ({
  eventId: 'e', eventLabel: 'אימון קבוצתי בפארק', nextStartTime: at(22, 18), currentRegistrations: 3,
  plannedCount: 0, avatars: [{ uid: 'u1', name: 'דנה' }], ...over,
});
const SESSIONS: SessionEnrichment[] = [
  ev({ eventId: 'rec', isRecurring: true, groupId: 'g1', nextStartTime: at(22, 7, 5) }),
  ev({ eventId: 'evt', nextStartTime: at(23, 18), currentRegistrations: 0, spotsLeft: 4 }),
  ev({ eventId: 'full', nextStartTime: at(25, 6), spotsLeft: 0 }),
  ev({ eventId: 'mine', isPersonalArrival: true, eventLabel: 'דנה מגיעה', avatars: [{ uid: 'me', name: 'אני' }] }),
  ev({ eventId: 'other', isPersonalArrival: true, eventLabel: 'יוסי מגיע', avatars: [{ uid: 'u2', name: 'יוסי' }] }),
  ev({ eventId: 'joined', nextStartTime: at(22, 19, 30) }),
];

describe('ParkPulseSection + rows', () => {
  for (const v2 of [false, true]) {
    for (const dayFilter of ['today', 'tomorrow', 'week'] as DayFilter[]) {
      it(`pulse filled v2=${v2} ${dayFilter}`, async () => {
        await expect(html(
          <ParkPulseSection
            v2={v2} parkEvents={SESSIONS} sessions={SESSIONS} loading={false} dayFilter={dayFilter}
            onDayFilterChange={noop} currentUid="me" joiningEventId="full"
            isUserRegistered={(e) => e.eventId === 'joined'} onJoin={noop} onOpenProfile={noop}
            publishPanel={<div>panel</div>}
          />,
        )).toMatchFileSnapshot(snap(`pulse-filled-${dayFilter}-v${v2 ? 2 : 1}`));
      });
    }
    it(`pulse loading + empty v2=${v2}`, async () => {
      const common = { v2, parkEvents: [], dayFilter: 'today' as DayFilter, onDayFilterChange: noop, currentUid: undefined,
        joiningEventId: null, isUserRegistered: () => false, onJoin: noop, onOpenProfile: noop, publishPanel: null };
      await expect(html(<ParkPulseSection {...common} sessions={[]} loading />)).toMatchFileSnapshot(snap(`pulse-loading-v${v2 ? 2 : 1}`));
      await expect(html(<ParkPulseSection {...common} sessions={[]} loading={false} />)).toMatchFileSnapshot(snap(`pulse-empty-v${v2 ? 2 : 1}`));
    });
  }
  it('session row joining', async () => {
    await expect(html(
      <ParkSessionRow ev={SESSIONS[1]} v2 isJoining alreadyJoined={false} isOwnArrival={false} onJoin={noop} onOpenProfile={noop} />,
    )).toMatchFileSnapshot(snap('row-joining'));
  });
});

describe('ArrivalPublishPanel', () => {
  const base = {
    dayFilter: 'today' as DayFilter, showTimePicker: false, onToggleTimePicker: noop, pickedDate: '2026-10-22',
    onPickDate: noop, timeRangeMinutes: [1020, 1140] as [number, number], onTimeRangeChange: noop,
    publishing: false, onPublish: noop,
  };
  for (const v2 of [false, true]) {
    for (const hasSessions of [false, true]) {
      it(`closed v2=${v2} hasSessions=${hasSessions}`, async () => {
        await expect(html(<ArrivalPublishPanel {...base} v2={v2} hasSessions={hasSessions} />))
          .toMatchFileSnapshot(snap(`arrival-closed-${hasSessions ? 'sessions' : 'empty'}-v${v2 ? 2 : 1}`));
      });
    }
  }
  it('open, week mode, publishing / idle', async () => {
    await expect(html(<ArrivalPublishPanel {...base} v2={false} hasSessions showTimePicker dayFilter="week" />))
      .toMatchFileSnapshot(snap('arrival-open-week'));
    await expect(html(<ArrivalPublishPanel {...base} v2 hasSessions={false} showTimePicker publishing />))
      .toMatchFileSnapshot(snap('arrival-open-publishing'));
  });
  it('wheel CTA (female)', async () => {
    Object.assign(useLocaleStore.getInitialState(), { gender: 'female' });
    await expect(html(<ArrivalPublishPanel {...base} v2 hasSessions={false} wheel onPublishAt={noop} />))
      .toMatchFileSnapshot(snap('arrival-wheel'));
  });
});

describe('ParkRatingSection', () => {
  const base = { onToggle: noop, onRatingChange: noop, comment: '', onCommentChange: noop, onSubmit: noop };
  it.each([
    ['closed', { open: false, done: false, rating: 0, submitting: false }],
    ['open-unrated', { open: true, done: false, rating: 0, submitting: false }],
    ['open-rated', { open: true, done: false, rating: 4, submitting: false }],
    ['submitting', { open: true, done: false, rating: 4, submitting: true }],
    ['done', { open: true, done: true, rating: 4, submitting: false }],
  ] as const)('%s', async (name, s) => {
    await expect(html(<ParkRatingSection {...base} {...s} />)).toMatchFileSnapshot(snap(`rating-${name}`));
  });
});

describe('ParkReviewsSection', () => {
  const reviews = [1, 2, 3, 4, 5].map((i) => ({
    id: `r${i}`, userId: i === 2 ? 'ghost' : i === 3 ? undefined : `u${i}`, rating: i, comment: i % 2 ? `תגובה ${i}` : undefined,
    createdAt: new Date(2026, 9, 10 + i),
  })) as unknown as UserContribution[];
  const names = { u1: 'דנה', u4: 'yossi', u5: 'מיכל' };
  for (const v2 of [false, true]) {
    it(`collapsed v2=${v2}`, async () => {
      await expect(html(<ParkReviewsSection v2={v2} ratedReviews={reviews} visibleReviews={reviews.slice(0, 3)} reviewerNames={names} expanded={false} onExpand={noop} />))
        .toMatchFileSnapshot(snap(`reviews-collapsed-v${v2 ? 2 : 1}`));
    });
  }
  it('expanded', async () => {
    await expect(html(<ParkReviewsSection v2 ratedReviews={reviews} visibleReviews={reviews} reviewerNames={names} expanded onExpand={noop} />))
      .toMatchFileSnapshot(snap('reviews-expanded'));
  });
});

const PARK = {
  id: 'p1', name: 'פארק הלל', city: 'שדרות', featureTags: ['shaded', 'has_benches', 'safe_zone', 'near_water'],
  gymEquipment: [{ equipmentId: 'a' }, { equipmentId: 'b' }, { equipmentId: 'c' }], primaryBrand: 'Ludos',
} as unknown as Park;

describe('meta row, action bar, amenities, photos', () => {
  for (const v2 of [false, true]) {
    const v = `v${v2 ? 2 : 1}`;
    it(`meta row ${v}`, async () => {
      await expect(html(<ParkMetaRow park={{ ...PARK, status: 'under_repair' } as Park} v2={v2} avgRating={4.25} ratedCount={8} distText="350 מ׳" />))
        .toMatchFileSnapshot(snap(`meta-repair-${v}`));
      await expect(html(<ParkMetaRow park={{ ...PARK, status: 'closed' } as Park} v2={v2} avgRating={null} ratedCount={0} distText={null} />))
        .toMatchFileSnapshot(snap(`meta-closed-${v}`));
      await expect(html(<ParkMetaRow park={{ ...PARK, status: 'open' } as Park} v2={v2} avgRating={null} ratedCount={0} distText={null} />))
        .toMatchFileSnapshot(snap(`meta-open-${v}`));
    });
    it(`action bar ${v}`, async () => {
      await expect(html(<ParkActionBar v2={v2} ctaLabel="סקרנים מה באימון?" onStartWorkout={noop} onSuggestEdit={noop} onNavigate={noop} />))
        .toMatchFileSnapshot(snap(`actions-${v}`));
    });
    it(`amenities ${v}`, async () => {
      await expect(html(<ParkAmenitiesSection park={PARK} v2={v2} />)).toMatchFileSnapshot(snap(`amenities-${v}`));
      await expect(html(<ParkAmenitiesSection park={{ ...PARK, featureTags: [] } as Park} v2={v2} />)).toMatchFileSnapshot(snap(`amenities-empty-${v}`));
    });
    it(`photos ${v}`, async () => {
      await expect(html(<ParkPhotosSection v2={v2} photos={['https://x/1.jpg', 'https://x/2.jpg']} onOpenPhoto={noop} />))
        .toMatchFileSnapshot(snap(`photos-${v}`));
    });
  }
});

describe('ParkEquipmentSection', () => {
  const eq = (id: string, over: Partial<GymEquipment>) => ({ id, name: `מתקן ${id}`, brands: [], ...over }) as unknown as GymEquipment;
  const all = [eq('a', { isCardio: true }), eq('b', { isFunctional: true }), eq('c', {})];
  for (const v2 of [false, true]) {
    it(`three sections v2=${v2}`, async () => {
      await expect(html(<ParkEquipmentSection park={PARK} v2={v2} sections={categorizeParkEquipment(all)} onSelect={noop} />))
        .toMatchFileSnapshot(snap(`equipment-all-v${v2 ? 2 : 1}`));
    });
  }
  it('hydraulic only, park without equipment list', async () => {
    await expect(html(<ParkEquipmentSection park={{ ...PARK, gymEquipment: undefined } as Park} v2 sections={categorizeParkEquipment([all[2]])} onSelect={noop} />))
      .toMatchFileSnapshot(snap('equipment-hydraulic'));
  });
});

describe('ParkHero category badge', () => {
  const mv = { heroHeight: motionValue('300px'), imageOpacity: motionValue(1), imageScale: motionValue(1), heroControlsPointerEvents: motionValue<'none' | 'auto'>('auto') };
  for (const facilityType of ['gym_park', 'court', 'route', 'zen_spot', 'urban_spot', 'nature_community', 'mystery_type']) {
    it(facilityType, async () => {
      await expect(html(<ParkHero park={{ ...PARK, facilityType } as unknown as Park} v2={facilityType === 'court'} onClose={noop} {...mv} />))
        .toMatchFileSnapshot(snap(`hero-${facilityType}`));
    });
  }
});
