import { describe, it, expect } from 'vitest';
import { makeT } from '@/lib/i18n/t';
import { legal } from '@/messages/ns/legal';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { shouldShowOsmSourceLine, CREDITS_PATH } from '../route-source-line';

const OSM_ROUTE = { origin: 'osm_import' };
const OSM_BY_ID = { source: { externalId: 'osm:rel/123' } };
const MANUAL = { origin: 'authority_admin' };

describe('shouldShowOsmSourceLine', () => {
  it('flag off: never shows, even for OSM routes', () => {
    expect(shouldShowOsmSourceLine(OSM_ROUTE, false)).toBe(false);
    expect(shouldShowOsmSourceLine(OSM_BY_ID, false)).toBe(false);
  });
  it('flag on: shows only for OSM-derived routes', () => {
    expect(shouldShowOsmSourceLine(OSM_ROUTE, true)).toBe(true);
    expect(shouldShowOsmSourceLine(OSM_BY_ID, true)).toBe(true);
    expect(shouldShowOsmSourceLine({ provenance: { osm: { license: 'ODbL-1.0' } } }, true)).toBe(true);
    expect(shouldShowOsmSourceLine(MANUAL, true)).toBe(false);
    expect(shouldShowOsmSourceLine({}, true)).toBe(false);
    expect(shouldShowOsmSourceLine(null, true)).toBe(false);
    expect(shouldShowOsmSourceLine(undefined, true)).toBe(false);
  });
  it('links to the credits page', () => {
    expect(CREDITS_PATH).toBe('/legal/credits');
  });
});

describe('enable_osm_attribution flag', () => {
  it('exists, default OFF, no super-admin override', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_osm_attribution');
    expect(def).toMatchObject({ key: 'enableOsmAttribution', defaultValue: false, superAdminValue: false });
  });
});

describe('legal catalog: credits keys', () => {
  const t = makeT('he', legal);
  const keys = [
    'credits.meta.title', 'credits.title', 'credits.intro', 'credits.osm.title', 'credits.osm.body',
    'credits.osm.attribution', 'credits.osm.copyrightLink', 'credits.osm.odblLink', 'credits.trails.title',
    'credits.trails.body', 'credits.mapbox.title', 'credits.mapbox.body', 'credits.mapbox.link',
    'credits.mapbox.aboutLink', 'credits.transport.title', 'credits.transport.body', 'credits.transport.link',
    'credits.routeSource.osm', 'credits.routeSource.linkLabel', 'credits.settingsLink',
  ] as const;
  it.each(keys)('%s is non-empty Hebrew/source text', (k) => {
    expect((t as (k: string) => string)(k).length).toBeGreaterThan(0);
  });
  it('route source line text is exact', () => {
    expect(t('credits.routeSource.osm')).toBe('מקור: OpenStreetMap');
    expect(t('credits.osm.attribution')).toBe('© OpenStreetMap contributors');
  });
});
