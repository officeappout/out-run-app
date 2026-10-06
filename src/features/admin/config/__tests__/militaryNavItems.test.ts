import { describe, it, expect } from 'vitest';
import { MILITARY_ROOT_NAV_ITEMS } from '../militaryNavItems';

describe('MILITARY_ROOT_NAV_ITEMS (06.10.2026, David\'s explicit 7-item order)', () => {
  it('has exactly 6 data items — "ספים" has no dedicated screen today, deliberately not included', () => {
    expect(MILITARY_ROOT_NAV_ITEMS.length).toBe(6);
  });

  it('is in David\'s exact order: all-brigades, dashboard, roster, trends, units-hierarchy, team', () => {
    expect(MILITARY_ROOT_NAV_ITEMS.map((i) => i.label)).toEqual([
      'כל החטיבות',
      'דשבורד כשירות',
      'חיילים ותוצאות',
      'מגמות',
      'היררכיית יחידות',
      'ניהול צוות צבאי',
    ]);
  });

  it('"כל החטיבות" (the entry point) is listed first, pointing at the overview list', () => {
    expect(MILITARY_ROOT_NAV_ITEMS[0].href).toBe('/admin/authority/readiness/vertical-overview');
  });

  it('דשבורד כשירות and מגמות — the two screens David found reachable only by direct URL — are both in the list', () => {
    const hrefs = MILITARY_ROOT_NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toContain('/admin/dashboard');
    expect(hrefs).toContain('/admin/authority/readiness/trends');
  });

  it('every href is unique — no duplicate nav target', () => {
    const hrefs = MILITARY_ROOT_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
