/**
 * Camera scan phase 2, pure parts: photos → the wizard's prefill (equipment, unsure tags, bench /
 * stairs feature tags, unknown objects), the contribution's scan record, the street name, and the
 * wizard's scan-mode step list.
 */
import { describe, it, expect } from 'vitest';
import { prefillFromScan, scanMetaFor, streetForName } from '../park-scan-mapping';
import { indicatorStepIds, wizardStepIds } from '../../contribution-wizard/wizard-steps';
import type { ScanPhotoResult } from '@/lib/ai/scan/scan-types';
import { scanSummary } from '@/features/admin/components/approval/ContributionScanSection';

const photo = (items: Array<[string, number]>, over: Partial<ScanPhotoResult> = {}): ScanPhotoResult => ({
  quality: 'ok',
  hasPeople: false,
  items: items.map(([candidateId, confidence]) => ({ candidateId, confidence, kind: candidateId.startsWith('urban:') ? 'urban' : 'catalog' })),
  unknown: [],
  ...over,
});

describe('prefillFromScan', () => {
  const results = [
    photo([['pull', 0.9], ['urban:bench', 0.7], ['rings', 0.55]], { unknown: [{ description: 'rower', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }] }),
    photo([['dips', 0.95]], { hasPeople: true }),
    photo([['dips', 0.3], ['urban:stairs', 0.9]]),
  ];
  const p = prefillFromScan(results);
  it('catalog items ≥ 0.5 pre-selected, unsure tagged, people photo ignored', () => {
    expect(p.equipmentIds).toEqual(['pull', 'rings']);
    expect(p.unsureIds).toEqual(['rings']);
  });
  it('bench / stairs become feature tags, unknown objects kept with their shot', () => {
    expect(p.featureTags.sort()).toEqual(['has_benches', 'stairs_training']);
    expect(p.unknown).toEqual([{ description: 'rower', shot: 0, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }]);
  });
  it('scan record: kept items with confidence, removed and added by the user, unknown with photos', () => {
    const meta = scanMetaFor(p.merged, ['pull', 'slide'], [{ description: 'rower', photoUrl: 'https://x/r.jpg' }]);
    expect(meta).toEqual({
      photos: 2,
      items: [{ equipmentId: 'pull', confidence: 0.9 }],
      removedByUser: ['rings'],
      addedByUser: ['slide'],
      unknown: [{ description: 'rower', photoUrl: 'https://x/r.jpg' }],
    });
  });
});

describe('streetForName', () => {
  it('drops the generic street word, keeps others, null when empty', () => {
    expect(streetForName('רחוב הרצל')).toBe('הרצל');
    expect(streetForName('שדרות רוטשילד')).toBe('שדרות רוטשילד');
    expect(streetForName('  ')).toBeNull();
    expect(streetForName(null)).toBeNull();
  });
});

describe('wizard steps, scan mode', () => {
  it('צילום · מיקום · מתקנים · שליחה, indicator = the real list', () => {
    const d = { facilityType: 'gym_park', isPointOfInterest: false, scanMode: true };
    expect(wizardStepIds(d)).toEqual(['scan', 'location', 'equipment', 'send']);
    expect(indicatorStepIds(d, 0)).toEqual(['scan', 'location', 'equipment', 'send']);
  });
  it('classic mode unchanged', () => {
    expect(wizardStepIds({ facilityType: 'gym_park', isPointOfInterest: false })).toEqual(['location', 'details', 'equipment', 'photo']);
  });
});


describe('admin scan summary', () => {
  it('photos, equipment count, unsure under 0.8, unknown items', () => {
    const scan = { photos: 5, items: [{ equipmentId: 'a', confidence: 0.9 }, { equipmentId: 'b', confidence: 0.6 }], removedByUser: [], addedByUser: [], unknown: [{ description: 'rower' }] };
    expect(scanSummary(scan, 4)).toEqual({ photos: 5, equipmentCount: 4, unsure: 1, unknown: [{ description: 'rower' }] });
    expect(scanSummary(undefined, 0)).toEqual({ photos: 0, equipmentCount: 0, unsure: 0, unknown: [] });
  });
});
