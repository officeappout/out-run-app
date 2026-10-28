/**
 * enable_where_to_train_v1 — render snapshots of the new UI (born translated, recorded through the
 * catalogs): the "איפה מתאמנים?" section (park carousel / home chip / loading) and the shared
 * "I'm training here" sheet per gender and place kind. `<!-- -->` is stripped (react-dom/server's
 * text-node separator); the v2 Sheet is mocked to render in place (it portals). Zustand state is written into getInitialState() (server snapshot).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/admin/services/planned-sessions.service', () => ({ createPlannedSession: async () => 'id' }));
// The v2 Sheet portals to <body> (nothing under react-dom/server) — render its title + body in place.
vi.mock('@/components/ui/v2/Sheet', () => ({
  default: ({ open, title, children }: { open: boolean; title?: React.ReactNode; children?: React.ReactNode }) =>
    open ? <div data-sheet><h2>{title}</h2>{children}</div> : null,
}));

import WhereToTrainSection from '../../where-to-train/WhereToTrainSection';
import TrainingHereSheet from '@/features/parks/client/components/training-here/TrainingHereSheet';
import type { WhereToTrainPark } from '../../where-to-train/useWhereToTrainParks';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/where-to-train/${name}.html`;
const noop = () => {};
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

const parks: WhereToTrainPark[] = [
  {
    id: 'p1', name: 'גינת הירקון', lat: 32.1, lng: 34.8, distanceM: 648, heroSrc: 'https://x/p1.jpg',
    rating: { avg: 4.6, count: 12 }, city: 'תל אביב', machineCount: 9,
    amenityTags: ['shaded', 'water_fountain', 'night_lighting'], gearIds: ['pullup_bar'],
  },
  {
    id: 'p2', name: 'גינת בן גוריון', lat: 32.2, lng: 34.8, distanceM: 1240, heroSrc: null,
    rating: null, city: null, machineCount: 0, amenityTags: [], gearIds: [],
  },
];

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T16:20:00')); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS, { gender: 'other' }); });

describe('WhereToTrainSection', () => {
  const base = {
    onSelectLocation: noop, isSwapping: false, onOpenPark: noop, homeGearLabels: ['מתח'], selectedParkId: 'p1',
  };
  it('park: carousel of compact cards, best match ringed', async () => {
    const out = html(<WhereToTrainSection {...base} location="park" parks={parks} loading={false} />);
    expect(out).toContain('איפה מתאמנים?');
    expect(out).toContain('תל אביב · 650 מ׳ · 9 מתקנים');
    expect(out).toContain('1.2 ק״מ');
    expect(out).not.toContain('ציוד חסר');
    await expect(out).toMatchFileSnapshot(snap('section-park'));
  });
  it('home: only the equipment chip, no parks', async () => {
    const out = html(<WhereToTrainSection {...base} location="home" parks={parks} loading={false} />);
    expect(out).toContain('בבית · מתח');
    expect(out).not.toContain('גינת הירקון');
    await expect(out).toMatchFileSnapshot(snap('section-home'));
  });
  it('military: a third שירות segment; plain users keep two', () => {
    const military = html(<WhereToTrainSection {...base} showService location="service" parks={parks} loading={false} />);
    expect(military).toContain('שירות');
    expect(military).not.toContain('גינת הירקון');
    expect(military).not.toContain('בבית');
    expect(html(<WhereToTrainSection {...base} location="park" parks={parks} loading={false} />)).not.toContain('שירות');
  });
  it('home without gear: bodyweight chip', () => {
    const out = html(<WhereToTrainSection {...base} homeGearLabels={[]} location="home" parks={[]} loading={false} />);
    expect(out).toContain('בבית · משקל גוף');
  });
  it('AA4: no home version, no בית / פארק toggle and no notice, the parks alone', () => {
    const out = html(<WhereToTrainSection {...base} homeBlocked blockedNotice="המעבר לבית לא זמין באימון הזה" location="park" parks={parks} loading={false} />);
    expect(out).not.toContain('role="group"');
    expect(out).not.toContain('לא זמין');
    expect(out).toContain('גינת הירקון');
    expect(html(<WhereToTrainSection {...base} location="park" parks={parks} loading={false} />)).toContain('role="group"');
  });
  it('park, loading: skeleton cards; no GPS / no parks: no carousel', async () => {
    await expect(html(<WhereToTrainSection {...base} location="park" parks={[]} loading />)).toMatchFileSnapshot(snap('section-loading'));
    expect(html(<WhereToTrainSection {...base} location="park" parks={[]} loading={false} />)).not.toContain('data-v2-hscroller');
  });
});

describe('TrainingHereSheet', () => {
  const place = { kind: 'park' as const, id: 'p1', name: 'גינת הירקון', lat: 32.1, lng: 34.8, distanceM: 648 };
  const alternatives = [place, { kind: 'park' as const, id: 'p2', name: 'גינת בן גוריון', lat: 32.2, lng: 34.8, distanceM: 1240 }];

  it.each(['female', 'male', 'other'] as const)('park, from the carousel (%s)', async (gender) => {
    Object.assign(useLocaleStore.getInitialState(), { gender });
    const out = html(
      <TrainingHereSheet open onClose={noop} activity="workout" workoutLabel="אימון עליון · 45 דק׳" place={place}
        alternatives={alternatives} onStartNow={noop} onPickOnly={noop} />,
    );
    expect(out).toContain('גינת הירקון · 650 מ׳');
    expect(out).toContain('או רק לבחור את הגינה, בלי לשתף');
    await expect(out).toMatchFileSnapshot(snap(`sheet-park-${gender}`));
  });

  it('route, from the share toggle: no start handler → share-now CTA, no pick-only link, no החלף', async () => {
    Object.assign(useLocaleStore.getInitialState(), { gender: 'male' });
    const out = html(
      <TrainingHereSheet open onClose={noop} activity="running" workoutLabel={null}
        place={{ kind: 'route', id: 'r1', name: 'סיבוב פארק הירקון', lat: null, lng: null }} />,
    );
    expect(out).toContain('יוצא לרוץ');
    expect(out).toContain('שתף עכשיו');
    expect(out).toContain('תופיע ב&quot;מתאמנים&quot; בדף המסלול');
    expect(out).not.toContain('רק לבחור');
    expect(out).not.toContain('החלף');
    await expect(out).toMatchFileSnapshot(snap('sheet-route-male'));
  });
});
