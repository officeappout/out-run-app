import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: vi.fn(), getAdminDb: vi.fn() }));

import { ALL_PUSH_SOURCES, CATEGORY_TO_SOURCE, MEASURED_FUNNEL_CATEGORIES } from '../push-catalog.service';
import { computePushPerformanceSummary } from '@/app/api/admin/push-performance-summary/route';

/**
 * Mirrors functions/src/services/push-measure-all.ts PUSH_TYPE_IDS (functions can't be imported
 * here) — every type id the functions stamp must map back to a catalog source.
 */
const FUNCTIONS_TYPE_IDS = [
  'LevelUp', 'Kudos', 'GroupWelcome', 'GroupAdminJoin', 'ContributionApproved', 'WeekStart',
  'CoachMessage', 'ChatMessage', 'OnboardingDropoff', 'AdminBroadcast', 'Inactivity',
];

function fakeDb(docs: Record<string, unknown>[]) {
  return {
    collection: () => ({
      where: (_f: string, _op: string, v: string) => ({
        get: async () => ({ docs: docs.filter((d) => d.eventType === v).map((d) => ({ data: () => d })) }),
      }),
      doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }),
    }),
    getAll: async () => [],
  } as unknown as FirebaseFirestore.Firestore;
}

describe('push catalog — enable_push_measure_all', () => {
  it('every previously-unmeasured source is measurable under the flag, with a distinct category', () => {
    const unmeasured = ALL_PUSH_SOURCES.filter((s) => !s.source.measured);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const s of unmeasured) {
      expect(s.source.measuredWithFlag, s.source.label).toBe(true);
      expect(s.source.funnelCategory, s.source.label).toBeTruthy();
    }
    const cats = unmeasured.map((s) => s.source.funnelCategory);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it('every type id the functions stamp maps back to a catalog source', () => {
    for (const id of FUNCTIONS_TYPE_IDS) expect(CATEGORY_TO_SOURCE[id], id).toBeDefined();
  });

  it('the always-measured list is unchanged (flag sources are not in it)', () => {
    expect(MEASURED_FUNNEL_CATEGORIES).toEqual(
      ALL_PUSH_SOURCES.filter((s) => s.source.measured && s.source.funnelCategory).map((s) => s.source.funnelCategory),
    );
    expect(MEASURED_FUNNEL_CATEGORIES).not.toContain('Kudos');
  });

  it('performance summary: no data → the flag source stays "לא נמדד"; data → a measured row instead', async () => {
    const scope = { kind: 'platform' as const };
    const empty = await computePushPerformanceSummary(fakeDb([]), scope, {});
    const rowsEmpty = (empty.body as { rows: Array<{ sourceLabel: string; measured: boolean }> }).rows;
    expect(rowsEmpty.find((r) => r.sourceLabel === 'קודוס שהתקבל')?.measured).toBe(false);

    const withData = await computePushPerformanceSummary(
      fakeDb([{ eventType: 'push_sent', pushId: 'p', uid: 'u', category: 'Kudos', variantId: 'default:Kudos', delivered: true, typeId: 'Kudos' }]),
      scope,
      {},
    );
    const rows = (withData.body as { rows: Array<{ sourceLabel: string; measured: boolean; sent: number | null; channel: string | null }> }).rows;
    const kudos = rows.filter((r) => r.sourceLabel === 'קודוס שהתקבל');
    expect(kudos).toHaveLength(1);
    expect(kudos[0]).toMatchObject({ measured: true, sent: 1, channel: 'social' });
  });
});
