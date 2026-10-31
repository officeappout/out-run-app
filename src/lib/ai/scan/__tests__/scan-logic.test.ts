/**
 * Camera scan pure logic: candidate list, tool-output sanitizing, the single-item verdict and the
 * park-mapping merge / next-shot guide.
 */
import { describe, it, expect } from 'vitest';
import { buildScanCandidates, candidateLines } from '../scan-candidates';
import { parseScanToolInput, singleVerdict, needsCompare } from '../scan-result';
import { mergeParkScans, nextParkShot, reviewItems, isUnsure } from '../scan-merge';
import type { ScanPhotoResult } from '../scan-types';

const CATALOG = [
  { id: 'pull', name: 'מתח', nameLocalized: { he: 'מתח', en: 'Pull-up bar' }, movementPattern: 'vertical_pull', availableInLocations: ['park'], brands: [{ imageUrl: 'https://img/pull.jpg' }] },
  { id: 'dips', name: { he: 'מקבילים', en: 'Parallel bars' }, availableInLocations: ['park', 'gym'], brands: [{ imageUrl: 'http://insecure' }] },
  { id: 'press', name: 'מכונת לחיצה', availableInLocations: ['gym'] },
  { id: 'noname', name: '' },
];
const C = buildScanCandidates(CATALOG, ['dips']);

describe('buildScanCandidates', () => {
  it('keeps park items, reads {he,en} names, flags the park items, adds the urban two', () => {
    expect(C.map((c) => c.id)).toEqual(['dips', 'pull', 'urban:bench', 'urban:stairs']);
    expect(C.find((c) => c.id === 'dips')).toMatchObject({ name: 'מקבילים', nameEn: 'Parallel bars', atPark: true, imageUrl: undefined });
    expect(C.find((c) => c.id === 'pull')).toMatchObject({ nameEn: 'Pull-up bar', imageUrl: 'https://img/pull.jpg', hint: 'vertical_pull' });
    expect(C.filter((c) => c.kind === 'urban')).toHaveLength(2);
  });
  it('is stable (cacheable prompt)', () => {
    expect(candidateLines(buildScanCandidates([...CATALOG].reverse(), []))).toBe(candidateLines(buildScanCandidates(CATALOG, [])));
  });
});

describe('parseScanToolInput', () => {
  it('drops invented ids, clamps, dedupes by best confidence, sorts', () => {
    const r = parseScanToolInput(
      {
        quality: 'ok',
        has_people: false,
        items: [
          { id: 'pull', confidence: 0.4 },
          { id: 'made-up', confidence: 0.99 },
          { id: 'pull', confidence: 0.7, count: 2, box: { x: 0.9, y: 0.1, w: 0.5, h: 0.2 } },
          { id: 'dips', confidence: 3 },
        ],
        unknown: [{ description: '  rowing machine ' }, { description: '' }],
      },
      C,
    );
    expect(r.items.map((i) => [i.candidateId, i.confidence])).toEqual([['dips', 1], ['pull', 0.7]]);
    expect(r.items[1].count).toBe(2);
    expect(r.items[1].box!.w).toBeCloseTo(0.1);
    expect(r.unknown).toEqual([{ description: 'rowing machine' }]);
  });
  it('garbage → empty ok result', () => {
    expect(parseScanToolInput(null, C)).toEqual({ quality: 'ok', hasPeople: false, items: [], unknown: [] });
  });
});

const photo = (items: Array<[string, number]>, over: Partial<ScanPhotoResult> = {}): ScanPhotoResult => ({
  quality: 'ok',
  hasPeople: false,
  items: items.map(([candidateId, confidence]) => ({ candidateId, confidence, kind: candidateId.startsWith('urban:') ? 'urban' : 'catalog' })),
  unknown: [],
  ...over,
});

describe('singleVerdict', () => {
  it('people always → retake people', () => {
    expect(singleVerdict(photo([['pull', 0.95]], { hasPeople: true }))).toEqual({ kind: 'retake', reason: 'people' });
  });
  it('confirm / choose / unsure / quality', () => {
    expect(singleVerdict(photo([['pull', 0.9], ['dips', 0.3]]))).toEqual({ kind: 'confirm', candidateId: 'pull', alternatives: ['dips'] });
    expect(singleVerdict(photo([['pull', 0.6]]))).toMatchObject({ kind: 'choose', candidateId: 'pull' });
    expect(singleVerdict(photo([['pull', 0.3]]))).toEqual({ kind: 'retake', reason: 'unsure' });
    expect(singleVerdict(photo([], { quality: 'dark' }))).toEqual({ kind: 'retake', reason: 'dark' });
    expect(singleVerdict(photo([]))).toEqual({ kind: 'retake', reason: 'no_equipment' });
  });
  it('needsCompare only for a near tie', () => {
    expect(needsCompare(photo([['pull', 0.6], ['dips', 0.55]]))).toBe(true);
    expect(needsCompare(photo([['pull', 0.9], ['dips', 0.5]]))).toBe(false);
    expect(needsCompare(photo([['pull', 0.2], ['dips', 0.2]]))).toBe(false);
  });
});

describe('park mapping', () => {
  it('merges, ignores people photos, bonuses items seen twice', () => {
    const m = mergeParkScans([
      photo([['pull', 0.7], ['urban:bench', 0.9]]),
      photo([['pull', 0.95]], { hasPeople: true }),
      photo([['pull', 0.6], ['dips', 0.4]]),
    ]);
    expect(m.usableShots).toBe(2);
    expect(m.items.find((i) => i.candidateId === 'pull')).toMatchObject({ confidence: 0.8, seenIn: 2 });
    expect(reviewItems(m).map((i) => i.candidateId)).toEqual(['urban:bench', 'pull']);
    expect(isUnsure(m.items.find((i) => i.candidateId === 'urban:bench')!)).toBe(false);
  });

  it('guides 3 angles, re-asks a lost angle, then closer for unsure, stops at 5', () => {
    expect(nextParkShot([])).toEqual({ kind: 'angle', angle: 'wide' });
    expect(nextParkShot([photo([])])).toEqual({ kind: 'angle', angle: 'side' });
    expect(nextParkShot([photo([]), photo([], { hasPeople: true })])).toEqual({ kind: 'angle', angle: 'side' });
    const unsure = [photo([['pull', 0.9]]), photo([['rings', 0]]), photo([['dips', 0.6]])];
    expect(nextParkShot(unsure)).toMatchObject({ kind: 'closer', shot: 2 });
    expect(nextParkShot([photo([['pull', 0.9]]), photo([]), photo([])])).toEqual({ kind: 'done' });
    expect(nextParkShot([...unsure, photo([['dips', 0.6]]), photo([['dips', 0.6]])])).toEqual({ kind: 'done' });
  });

  it('asks one closer shot for an unknown object, not twice', () => {
    const three = [photo([['pull', 0.9]], { unknown: [{ description: 'rower' }] }), photo([]), photo([])];
    expect(nextParkShot(three)).toMatchObject({ kind: 'closer', shot: 0 });
    expect(nextParkShot([...three, photo([], { unknown: [{ description: 'rower' }] })])).toEqual({ kind: 'done' });
  });
});
