import { beforeAll, describe, it, expect } from 'vitest';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { buildLocationInfo, locationChips } from '../location/location-info.model';
import { locationCopy } from '../location/location-info.copy';
import { makeT } from '@/lib/i18n/t';
import { library } from '@/messages/ns/library';

const t = makeT('he', library, { gender: 'male' });

describe('buildLocationInfo (board SwapCard, location only)', () => {
  it('walks the offered places starting from the current one', () => {
    const m = buildLocationInfo({ offered: ['park', 'home', 'service'], current: 'home' })!;
    expect(m.order).toEqual(['home', 'service', 'park']);
    expect(m.offered).toEqual(['park', 'home', 'service']);
    expect(m).toMatchObject({ hasHome: true, hasService: true });
  });

  it('a current place the toggle does not offer starts from the first one', () => {
    expect(buildLocationInfo({ offered: ['park', 'home'], current: 'service' })!.order).toEqual(['park', 'home']);
  });

  it('fallback: one place only (no home version, no service) → no "i"', () => {
    expect(buildLocationInfo({ offered: ['park'], current: 'park' })).toBeNull();
    expect(buildLocationInfo({ offered: [], current: 'park' })).toBeNull();
  });

  it('chips follow what is offered', () => {
    expect(locationChips(buildLocationInfo({ offered: ['park', 'home', 'service'], current: 'park' })!)).toEqual(['service', 'noGear']);
    expect(locationChips(buildLocationInfo({ offered: ['park', 'home'], current: 'park' })!)).toEqual(['parkHome', 'noGear']);
    // No home version: nothing about home to ask.
    expect(locationChips(buildLocationInfo({ offered: ['park', 'service'], current: 'park' })!)).toEqual([]);
  });

  it('copy lists the real toggle labels, no long dash', () => {
    const c = locationCopy(buildLocationInfo({ offered: ['park', 'home', 'service'], current: 'park' })!, t);
    expect(c.steps[0]).toBe('בוחרים איפה מתאמנים היום: פארק, בית או שירות.');
    expect(c.chips).toEqual(['מה ההבדל בין בית לשירות?', 'אין לי ציוד בבית']);
    const two = locationCopy(buildLocationInfo({ offered: ['park', 'home'], current: 'park' })!, t);
    expect(two.steps[0]).toBe('בוחרים איפה מתאמנים היום: פארק או בית.');
    for (const s of [c.title, c.lead, ...c.steps, ...c.chips]) expect(s).not.toMatch(/[—–]/);
  });

  beforeAll(async () => {
    await ensureCatalog('en', 'library');
  });

  it('has an English copy', () => {
    const en = makeT('en', library, { gender: 'male' });
    const c = locationCopy(buildLocationInfo({ offered: ['park', 'home'], current: 'park' })!, en);
    expect(c.title).toBe('Training somewhere else?');
  });
});
