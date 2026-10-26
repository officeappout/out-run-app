/**
 * Map places drawer UI (enable_map_places_drawer_v1, board RP-4):
 *  - key parity: every placesDrawer.* key used exists in he/map.json, no orphans, no hard-coded Hebrew;
 *  - the Hebrew copy of every key and branch (chips, tags, gendered CTA — neutral when unknown);
 *  - the drawer renders the list (compact cards + workout tags), the "nothing near" state with the
 *    generator CTA, and a loading line — from mocked data hooks (no reads).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '@/messages/he/map.json';
import { makeT } from '@/lib/i18n/t';
import { map } from '@/messages/ns/map';
import type { Park } from '@/features/parks/core/types/park.types';
import type { PlaceUserContext } from '@/features/workout-engine/place-fit';
import type { NearbyPlace } from '../nearby-places';

vi.mock('@/hooks/useT', async () => {
  const { makeT: mk } = await import('@/lib/i18n/t');
  return { useT: (ns: Parameters<typeof mk>[1]) => mk('he', ns) };
});

const nearby = vi.hoisted(() => ({ value: { places: [] as unknown[], loading: false } }));
vi.mock('../hooks/useNearbyPlaces', () => ({ useNearbyPlaces: () => nearby.value }));
const userCtx = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('../../place-workouts/hooks/usePlaceUserContext', () => ({
  usePlaceUserContext: () => ({ ctx: userCtx.value, todayRun: null, paceCtx: { basePace: 0, zones: null } }),
}));

import MapPlacesDrawer from '../MapPlacesDrawer';
import PlacesDrawerEmpty from '../PlacesDrawerEmpty';

const t = makeT('he', map);
const DIR = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === '__tests__') return [];
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const strip = (html: string) => html.replace(/<!-- -->/g, '');

describe('places drawer — catalog keys', () => {
  const catalog = he as Record<string, string>;
  const files = sources(DIR);
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const used = new Set(Array.from(text.matchAll(/'(placesDrawer\.[A-Za-z.]+)'/g)).map((m) => m[1]));

  it('every key used exists in he/map.json', () => {
    expect(used.size).toBeGreaterThan(15);
    Array.from(used).forEach((k) => expect(catalog[k], k).toBeTypeOf('string'));
  });

  it('every placesDrawer.* catalog key is used', () => {
    expect(Object.keys(catalog).filter((k) => k.startsWith('placesDrawer.') && !used.has(k))).toEqual([]);
  });

  it('no hard-coded Hebrew in the folder, and no hard-coded dir', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(/[֐-׿]/.test(code), f).toBe(false);
      expect(/dir="(rtl|ltr)"/.test(code), f).toBe(false);
    }
  });
});

describe('places drawer — Hebrew copy', () => {
  it('chips, kinds, tags', () => {
    expect(['all', 'strength', 'run', 'walk', 'hybrid'].map((chip) => t('placesDrawer.chip', { chip })))
      .toEqual(['הכול', 'כוח', 'ריצה', 'הליכה', 'משולב']);
    expect(t('placesDrawer.subtitle', { km: '1.5' })).toBe('לפי המיקום שלך · רדיוס 1.5 ק״מ');
    expect(t('placesDrawer.kind.route', { km: '5' })).toBe('מסלול · 5 ק״מ');
    expect(t('placesDrawer.tag', { style: 'strength', min: '35' })).toBe('כוח 35׳');
    expect(t('placesDrawer.tag', { style: 'hybrid', min: '40' })).toBe('משולב 40׳');
    expect(t('placesDrawer.tagPlan', { style: 'run_easy' })).toBe('ריצה קלה · מהתוכנית');
    expect(t('placesDrawer.tagNoMin', { style: 'walk' })).toBe('הליכה');
    expect(t('placesDrawer.openPage', { kind: 'park' })).toBe('לדף הגינה');
    expect(t('placesDrawer.openPage', { kind: 'route' })).toBe('לדף המסלול');
    expect(t('placesDrawer.toggle', { open: 'yes' })).toBe('כיווץ המגירה');
  });

  it('the generator CTA is gendered, neutral when unknown', () => {
    expect(t('placesDrawer.empty.cta', { gender: 'male' })).toBe('צור לי מסלול באזור שלי');
    expect(t('placesDrawer.empty.cta', { gender: 'female' })).toBe('צרי לי מסלול באזור שלי');
    expect(t('placesDrawer.empty.cta', { gender: 'other' })).toBe('יצירת מסלול באזור שלי');
  });
});

const parkPlace = (id: string, distanceM: number): NearbyPlace => ({
  key: `park:${id}`, kind: 'park', id, name: `גינה ${id}`, distanceM,
  park: { id, name: id, location: { lat: 32, lng: 34 } } as Park,
  engine: { kind: 'park', parkId: id, equipment: [], nearestRouteKm: 0.2 },
});

const ctx: PlaceUserContext = {
  persona: 'strength',
  today: { strength: { title: null }, run: null, walk: null },
  hasStrengthPlan: true, hasRunPlan: false, hasWalkPlan: false,
  weeklyStrength: null, easyPaceSecPerKm: null, afterDark: false,
};

const render = () => strip(renderToStaticMarkup(
  <MapPlacesDrawer userLocation={{ lat: 32, lng: 34 }} onGenerateRoute={() => {}} onOpenPark={() => {}} onOpenRoute={() => {}} open onOpenChange={() => {}} />,
));

describe('MapPlacesDrawer', () => {
  beforeEach(() => { nearby.value = { places: [], loading: false }; userCtx.value = null; });

  it('lists nearby places as compact cards with their workout tags (plan first)', () => {
    nearby.value = { places: [parkPlace('a', 650)], loading: false };
    userCtx.value = ctx;
    const html = render();
    expect(html).toContain('בסביבה');
    expect(html).toContain('לפי המיקום שלך · רדיוס 1.5 ק״מ');
    expect(html).toContain('data-testid="park-card-compact"');
    expect(html).toContain('גינת כושר · 650 מ׳');
    expect(html).toContain('כוח · מהתוכנית');
    expect(html).toContain('משולב 40׳');
    expect(html).not.toContain('data-places-empty');
  });

  it('nothing within walking range → the generator empty state, ONE CTA', () => {
    userCtx.value = ctx;
    const html = render();
    expect(html).toContain('data-places-empty="none_near"');
    expect(html).toContain('אין מסלול או גינה בטווח הליכה');
    expect(html).toContain('אפשר גם להזיז את המפה ולחפש במקום אחר');
    expect(html.match(/מסלול באזור שלי/g)).toHaveLength(1);
  });

  it('loading → a status line, no list, no CTA', () => {
    nearby.value = { places: [], loading: true };
    const html = render();
    expect(html).toContain('מחפשים מה יש לידך…');
    expect(html).not.toContain('data-places-empty');
  });

  it('the empty state for a chip names the filter, run / walk pick preselected', () => {
    const html = strip(renderToStaticMarkup(<PlacesDrawerEmpty reason="none_for_chip" initialActivity="walking" onGenerate={() => {}} />));
    expect(html).toContain('אין בסביבה מקום שמתאים לסינון הזה');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*הליכה/);
  });
});
