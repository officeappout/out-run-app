import { describe, expect, it } from 'vitest';
import { amountText, coverageCell, formatDate, gapNotes, runRegressions } from '../map-health.logic';
import { emptyLayer } from '@/lib/city-inventory/doc';
import type { CityInventoryRun, InventoryLayerKey } from '@/lib/city-inventory/types';
import { INVENTORY_LAYER_KEYS } from '@/lib/city-inventory/types';
import { measuredLayer } from '@/lib/city-inventory/__tests__/fixtures';

const runWith = (runId: string, over: Partial<Record<InventoryLayerKey, ReturnType<typeof measuredLayer>>>): CityInventoryRun => {
  const layers = {} as CityInventoryRun['layers'];
  for (const k of INVENTORY_LAYER_KEYS) {
    const { files: _f, ...rest } = over[k] ?? measuredLayer();
    layers[k] = rest;
  }
  return {
    authorityId: 'a', runId, layers, schemaVersion: 2, createdAt: null,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: new Date(0), builtBy: 'x', runId },
    readiness: { score: 0, level: 'red', missing: [], blockers: [] },
  };
};

describe('map-health logic', () => {
  it('amountText: unmeasured ⇒ "לא נמדד", measured 0 ⇒ "0"', () => {
    expect(amountText(emptyLayer())).toBe('לא נמדד');
    expect(amountText(measuredLayer({ count: 0 }))).toBe('0');
    expect(amountText(measuredLayer({ count: 14, areaKm2: 3.1 }))).toBe('14 · 3.1 קמ״ר');
  });

  it('coverageCell tones and reasons', () => {
    expect(coverageCell('crossings', measuredLayer({ coveragePct: 30 })).tone).toBe('low');
    expect(coverageCell('crossings', measuredLayer({ coveragePct: 60 })).tone).toBe('mid');
    expect(coverageCell('crossings', measuredLayer({ coveragePct: 90 })).tone).toBe('high');
    expect(coverageCell('parks', measuredLayer({ coveragePct: null })).hint).toContain('שכבה עירונית');
    expect(coverageCell('shade', emptyLayer()).text).toBe('לא נמדד');
  });

  it('gapNotes: unmeasured non-shade layer', () => {
    expect(gapNotes('benches', emptyLayer())).toEqual(['לא נמדד בריצה הזו']);
  });

  it('formatDate: Israel time, dash for null', () => {
    expect(formatDate(new Date('2026-10-20T22:30:00Z'))).toBe('21.10.2026'); // 01:30 in Israel
    expect(formatDate(null)).toBe('—');
  });

  it('runRegressions: >0 ⇒ 0, and measured ⇒ unmeasured; unmeasured before is not a regression', () => {
    const older = runWith('r1', { shade: emptyLayer() });
    const newer = runWith('r2', { benches: measuredLayer({ count: 0 }), toilets: emptyLayer(), shade: emptyLayer() });
    expect(runRegressions([newer, older])).toEqual([['benches', 'toilets'], []]);
    expect(runRegressions([])).toEqual([]);
  });
});
