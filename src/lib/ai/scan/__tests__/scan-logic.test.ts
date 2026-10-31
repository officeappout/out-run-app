/**
 * Camera scan pure logic: candidate list, tool-output sanitizing, the single-item verdict and the
 * park-mapping merge / next-shot guide.
 */
import { describe, it, expect } from 'vitest';
import { buildScanCandidates, candidateLines } from '../scan-candidates';
import { parseScanToolInput, singleVerdict, needsCompare } from '../scan-result';
import { mergeParkScans, nextParkShot, reviewItems, isUnsure } from '../scan-merge';
import type { ScanPhotoResult } from '../scan-types';
import refsJson from '../scan-reference-photos.json';
import { feedbackRecord, ScanFeedbackSchema } from '../scan-feedback';

const CATALOG = [
  { id: 'pull', name: 'מתח', nameLocalized: { he: 'מתח', en: 'Pull-up bar' }, movementPattern: 'vertical_pull', availableInLocations: ['park'], brands: [{ brandName: 'Ludus', imageUrl: 'https://img/pull.jpg' }] },
  { id: 'dips', name: { he: 'מקבילים', en: 'Parallel bars' }, availableInLocations: ['park', 'gym'], brands: [{ brandName: 'Urbanix', imageUrl: 'http://insecure' }] },
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

describe('brand-aware recognition (owner 31.10)', () => {
  const cat = [
    { id: 'dips', name: 'מקבילים', availableInLocations: ['park'], brands: [
      { brandName: 'Ludus', imageUrl: 'https://img/l.jpg' }, { brandName: 'Urbanix', imageUrl: 'https://img/o.jpg' }, { brandName: 'Ludus' }] },
    { id: 'pull', name: 'מתח', availableInLocations: ['park'], brands: [{ brandName: 'Urbanix' }] },
  ];
  const cands = buildScanCandidates(cat, [], { 'dips::Ludus': 'yellow round tubes, curved ends' });

  it('one brand entry per (equipment, brand), with its look line, listed in the prompt', () => {
    expect(cands[0].brands).toEqual([
      { name: 'Ludus', imageUrl: 'https://img/l.jpg', look: 'yellow round tubes, curved ends' },
      { name: 'Urbanix', imageUrl: 'https://img/o.jpg' },
    ]);
    expect(candidateLines(cands)).toContain('brands: Ludus (yellow round tubes, curved ends); Urbanix');
  });

  it('the model brand is matched to the catalog spelling, unknown brands dropped', () => {
    const r = parseScanToolInput({ quality: 'ok', has_people: false, unknown: [], items: [
      { id: 'dips', brand: 'ludus ', confidence: 0.9 }, { id: 'pull', brand: 'Acme', confidence: 0.4 }] }, cands);
    expect(r.items[0].brandName).toBe('Ludus');
    const alias = parseScanToolInput({ quality: 'ok', has_people: false, unknown: [], items: [{ id: 'dips', brand: 'Urbanics', confidence: 0.9 }] }, cands);
    expect(alias.items[0].brandName).toBe('Urbanix');
    expect(r.items[1].brandName).toBeUndefined();
    expect(singleVerdict(r)).toEqual({ kind: 'confirm', candidateId: 'dips', brandName: 'Ludus', alternatives: ['pull'] });
  });

  it('compare when the brand is unknown and there are 2+ brand photos', () => {
    const one = (brandName?: string) => ({ quality: 'ok' as const, hasPeople: false, unknown: [],
      items: [{ candidateId: 'dips', kind: 'catalog' as const, confidence: 0.9, ...(brandName ? { brandName } : {}) }] });
    expect(needsCompare(one(), cands)).toBe(true);
    expect(needsCompare(one('Urbanix'), cands)).toBe(false);
    expect(needsCompare(one(), [])).toBe(false);
  });
});


describe('scan feedback log', () => {
  const now = new Date(0);
  it('top hit + brand hit for single scans, no photo field accepted', () => {
    const body = ScanFeedbackSchema.parse({ mode: 'single', via: 'confirm',
      detected: [{ equipmentId: 'dips', brandName: 'Ludus', confidence: 0.9 }], confirmed: { equipmentId: 'dips', brandName: 'Urbanix' } });
    expect(feedbackRecord('u1', body, now)).toMatchObject({ uid: 'u1', topHit: true, brandHit: false });
    expect(ScanFeedbackSchema.safeParse({ ...body, image: 'AAAA' }).success).toBe(true);
    expect('image' in ScanFeedbackSchema.parse({ ...body, image: 'AAAA' })).toBe(false);
  });
  it('a correction is a miss; park submits carry kept / removed / added', () => {
    const miss = ScanFeedbackSchema.parse({ mode: 'single', via: 'search', detected: [{ equipmentId: 'dips', confidence: 0.6 }], confirmed: { equipmentId: 'pull' } });
    expect(feedbackRecord('u1', miss, now)).toMatchObject({ topHit: false, brandHit: null });
    const park = ScanFeedbackSchema.parse({ mode: 'park', via: 'park_submit', detected: [], kept: [{ equipmentId: 'pull', brandName: 'Urbanix' }], removed: ['dips'], added: ['rings'] });
    expect(feedbackRecord('u1', park, now)).toMatchObject({ topHit: null, removed: ['dips'], added: ['rings'] });
  });
});

describe('owner reference photos (Drive "מתקנים")', () => {
  const cat = [
    { id: 'dips', name: 'מקבילים', availableInLocations: ['park'], brands: [{ brandName: 'Urbanics', imageUrl: 'https://img/u.jpg' }] },
  ];
  const refs = [
    { equipmentId: 'dips', brand: 'Urbanix', url: 'https://app/scan-reference/urbanix/dips.jpg' },
    { equipmentId: 'dips', brand: 'Ludus', url: 'https://app/scan-reference/ludus/dips.jpg' },
    { equipmentId: 'other', brand: 'Ludus', url: 'https://app/x.jpg' },
  ];
  const [c] = buildScanCandidates(cat, [], { 'dips::Ludus': 'low steel bars' }, refs);

  it('attaches to the alias-matching brand; a maker missing from the catalog becomes a brand', () => {
    expect(c.brands).toEqual([
      { name: 'Urbanics', imageUrl: 'https://img/u.jpg', refImageUrls: ['https://app/scan-reference/urbanix/dips.jpg'] },
      { name: 'Ludus', look: 'low steel bars', refImageUrls: ['https://app/scan-reference/ludus/dips.jpg'] },
    ]);
  });
  it('the compare photo prefers the reference, and two photos make a brand-unknown result worth comparing', () => {
    expect(c.imageUrl).toBe('https://app/scan-reference/urbanix/dips.jpg');
    const r = { quality: 'ok' as const, hasPeople: false, unknown: [], items: [{ candidateId: 'dips', kind: 'catalog' as const, confidence: 0.9 }] };
    expect(needsCompare(r, [c])).toBe(true);
  });
});


describe('reference manifest', () => {
  it('every entry has an id, a known brand and a public path', () => {
    for (const r of refsJson as Array<{ equipmentId: string; brand: string; path: string }>) {
      expect(r.equipmentId).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(['Urbanix', 'Ludus']).toContain(r.brand);
      expect(r.path).toMatch(/^\/scan-reference\/(urbanix|ludus)\/[A-Za-z0-9-]+\.jpg$/);
    }
  });
});
