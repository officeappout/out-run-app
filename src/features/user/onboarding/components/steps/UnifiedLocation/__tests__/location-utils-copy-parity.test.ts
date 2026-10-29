/**
 * i18n extraction batch 3: the generated Hebrew copy of location-utils.ts (walking distance line, identity hook,
 * smart badges, Pioneer / Plan B fallback). The file snapshots were recorded from unmodified origin/main (commit 1);
 * the extraction commit must pass them unchanged. Out of scope on purpose (data or dead, see the PR body):
 * reverseGeocode's 'מיקום לא ידוע' (also written to Firestore), getSettlementNaming (never rendered), getFacilityNoun /
 * getActivityValue / genderize (no importers).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/admin/services/authority.service', () => ({ getAllAuthorities: async () => [], getChildrenByParent: async () => [] }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ InventoryService: {} }));

import { buildPioneerFallback, formatDistance, getActivityVerb, getIdentityHook, selectSmartBadges } from '../location-utils';
import type { SportContext } from '../location-types';

const snap = (name: string) => `./__snapshots__/location-utils-copy/${name}.json`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const SPORTS = [
  null, 'running', 'walking', 'cycling', 'basketball', 'football', 'tennis', 'padel', 'yoga', 'pilates', 'stretching',
  'climbing', 'skateboard', 'calisthenics', 'crossfit', 'functional', 'movement', 'gym', 'strength', 'boxing', 'mma',
  'self_defense', 'unknown_sport',
];
const PERSONAS = ['parent', 'military', 'office_worker', 'pro_athlete', 'student', 'pupil', 'vatikim', 'other', ''];
const CTX: SportContext = { activities: [], prefersHybrid: false, isSpotFocus: false, isScenicFocus: false, showBenches: false, climbingFallback: false };

describe('location-utils copy (Hebrew)', () => {
  it('formatDistance', async () => {
    const out = [0, 40, 80, 100, 159, 160, 161, 800, 1234, 5000, 12000].map((m) => [m, formatDistance(m)]);
    await expect(json(out)).toMatchFileSnapshot(snap('format-distance'));
  });

  it('getActivityVerb', async () => {
    await expect(json(SPORTS.map((s) => [s, getActivityVerb(s)]))).toMatchFileSnapshot(snap('activity-verb'));
  });

  it('getIdentityHook: every persona x gender x sport x city', async () => {
    const out: unknown[] = [];
    for (const p of PERSONAS) for (const g of ['male', 'female'] as const) for (const s of SPORTS) for (const c of ['תל אביב-יפו', '']) {
      out.push([p, g, s, c, getIdentityHook(p, c, g, s)]);
    }
    await expect(json(out)).toMatchFileSnapshot(snap('identity-hook'));
  });

  it('selectSmartBadges', async () => {
    const out: unknown[] = [];
    const counts = [null, { gyms: 0, courts: 0, nature: 0 }, { gyms: 3, courts: 0, nature: 0 }, { gyms: 12, courts: 4, nature: 7 }, { gyms: 1204, courts: 1, nature: 1 }];
    const infra = [null, { totalKm: 0, segmentCount: 0 }, { totalKm: 12.34, segmentCount: 5 }, { totalKm: 1234.56, segmentCount: 9 }];
    for (const c of counts) for (const i of infra) for (const s of [null, 'gym', 'basketball', 'yoga', 'running']) for (const city of ['חיפה', null]) for (const spot of [false, true]) {
      out.push([c, i, s, city, spot, selectSmartBadges(c, i, s, city, { ...CTX, isSpotFocus: spot })]);
    }
    await expect(json(out)).toMatchFileSnapshot(snap('smart-badges'));
  });

  it('buildPioneerFallback: every sport x gender x city', async () => {
    const out: unknown[] = [];
    for (const s of SPORTS) for (const g of ['male', 'female'] as const) for (const c of ['באר שבע', null]) {
      out.push([s, g, c, buildPioneerFallback([], s, g, c, CTX, null)]);
    }
    await expect(json(out)).toMatchFileSnapshot(snap('pioneer'));
    expect(out.length).toBeGreaterThan(0);
  });
});
