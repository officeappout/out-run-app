import { describe, expect, it } from 'vitest';
import { buildRoadmap, daysBeforeFor, daysUntil, gematria, hebrewDate, hebrewDateLabel, layoutWeek, rankVenues, taskDueDate, toIso, venueCost } from '../wedding.calc';
import { DEFAULT_SETTINGS, initialWeddingState } from '../wedding.config';
import { LIMITS, parseWeddingState } from '../wedding.schema';
import type { Venue } from '../wedding.types';
import { VENUE_CATALOG } from '../data/venueCatalog';

const base: Venue = {
  id: 'a',
  name: 'גן',
  city: '',
  contact: '',
  date: '2027-03-09',
  status: 'לברר',
  price: 310,
  vatIncluded: false,
  minGuests: 250,
  alcohol: 0,
  incl: { design: true, chuppah: true, light: false, bar: false },
  djFee: 1500,
  extras: 0,
  discount: 0,
  notes: '',
  catalogId: '',
};

describe('venueCost', () => {
  it('adds VAT, missing items and DJ fee (250 guests)', () => {
    const c = venueCost(base, 250, DEFAULT_SETTINGS);
    expect(c.real).toBeCloseTo(365.8, 5);
    expect(c.plates).toBe(250);
    // 365.8×250 + light 6000 + bar 30×250 + DJ 1500
    expect(c.total).toBeCloseTo(91450 + 6000 + 7500 + 1500, 5);
    expect(c.perGuest).toBeCloseTo(106450 / 250, 5);
  });

  it('bills the venue minimum when guests are fewer', () => {
    const c = venueCost(base, 200, DEFAULT_SETTINGS);
    expect(c.plates).toBe(250);
    expect(c.emptyPlates).toBe(50);
    // bar is per actual guest, not per billed plate
    expect(c.total).toBeCloseTo(365.8 * 250 + 6000 + 30 * 200 + 1500, 5);
  });

  it('VAT-included, all-inclusive offer is just price × plates', () => {
    const v: Venue = { ...base, price: 380, vatIncluded: true, minGuests: 180, djFee: 0, incl: { design: true, chuppah: true, light: true, bar: true } };
    expect(venueCost(v, 250, DEFAULT_SETTINGS).total).toBe(95000);
  });

  it('subtracts discount and adds extras and alcohol', () => {
    const v: Venue = { ...base, alcohol: 20, extras: 1000, discount: 3000 };
    const c = venueCost(v, 250, DEFAULT_SETTINGS);
    expect(c.real).toBeCloseTo(330 * 1.18, 5);
    expect(c.total).toBeCloseTo(330 * 1.18 * 250 + 6000 + 7500 + 1500 + 1000 - 3000, 5);
  });
});

describe('rankVenues', () => {
  it('drops rejected and unpriced venues, sorts by real total', () => {
    const cheapPlate: Venue = { ...base, id: 'cheap', price: 270, alcohol: 30, incl: { design: false, chuppah: false, light: false, bar: false }, djFee: 2000 };
    const loft: Venue = { ...base, id: 'loft', price: 380, vatIncluded: true, minGuests: 180, djFee: 0, incl: { design: true, chuppah: true, light: true, bar: true } };
    const rejected: Venue = { ...base, id: 'no', price: 100, status: 'נפסל' };
    const unpriced: Venue = { ...base, id: 'zero', price: 0 };
    const ids = rankVenues([cheapPlate, rejected, loft, unpriced, base], 250, DEFAULT_SETTINGS).map((r) => r.venue.id);
    expect(ids).toEqual(['loft', 'a', 'cheap']);
  });
});

describe('dates', () => {
  it('counts task due dates back from the wedding', () => {
    const d = taskDueDate('2027-03-09', 155);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 5]);
  });
  it('days until the wedding', () => {
    expect(daysUntil('2027-03-09', new Date(2026, 9, 2, 15, 0))).toBe(158);
  });
});

describe('parseWeddingState', () => {
  it('fills defaults from garbage', () => {
    const s = parseWeddingState('nope');
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.venues).toEqual([]);
  });

  it('round-trips the initial state unchanged', () => {
    const init = initialWeddingState();
    expect(parseWeddingState(JSON.parse(JSON.stringify(init)))).toEqual(init);
  });

  it('coerces bad fields and caps list sizes', () => {
    const s = parseWeddingState({
      settings: { date: 'tomorrow', guests: '260', vat: 500, budget: -5 },
      venues: [{ id: 'x/../y', name: '  אולם  ', price: '320', status: 'hacked', incl: { bar: 'yes', design: true } }, 42],
      tasks: Array.from({ length: LIMITS.tasks + 20 }, (_, i) => ({ id: `t${i}`, name: 'x', daysBefore: i })),
    });
    expect(s.settings.date).toBe(DEFAULT_SETTINGS.date);
    expect(s.settings.guests).toBe(260);
    expect(s.settings.vat).toBe(100);
    expect(s.settings.budget).toBe(0);
    expect(s.venues).toHaveLength(1);
    expect(s.venues[0]).toMatchObject({ id: 'xy', name: 'אולם', price: 320, status: 'לברר', incl: { bar: false, design: true } });
    expect(s.tasks).toHaveLength(LIMITS.tasks);
  });

  it('parses people and task owners; old data without them gets defaults', () => {
    const s = parseWeddingState({
      settings: { people: ['  מיכל ', 'דוד', 'מיכל', 'ביחד', '', 7] },
      tasks: [
        { id: 't1', name: 'צלם', daysBefore: 10, owner: 'מיכל' },
        { id: 't2', name: 'אולם', daysBefore: 20 },
        { id: 't3', name: 'רב', daysBefore: 30, owner: 'ביחד' },
        { id: 't4', name: 'הזמנות', daysBefore: 40, owners: ['דוד', 'מיכל', 'דוד'] },
      ],
    });
    expect(s.settings.people).toEqual(['מיכל', 'דוד']);
    expect(s.tasks.map((t) => t.owners)).toEqual([['מיכל'], [], ['מיכל', 'דוד'], ['דוד', 'מיכל']]);
    expect(parseWeddingState({ settings: {} }).settings.people).toEqual(DEFAULT_SETTINGS.people);
  });

  it('keeps only known tag colors', () => {
    const s = parseWeddingState({ settings: { tagColors: { 'דוד': 'rose', 'מיכל': 'neon', '': 'sky', 'ביחד': 'slate' } } });
    expect(s.settings.tagColors).toEqual({ 'דוד': 'rose', 'ביחד': 'slate' });
    expect(parseWeddingState({}).settings.tagColors).toEqual({});
  });

  it('de-duplicates ids', () => {
    const s = parseWeddingState({ vendors: [{ id: 'v1', name: 'a' }, { id: 'v1', name: 'b' }] });
    expect(new Set(s.vendors.map((v) => v.id)).size).toBe(2);
  });
});

describe('buildRoadmap', () => {
  const today = new Date(2026, 9, 2, 12); // Fri 2.10.2026
  const t = (id: string, daysBefore: number, done = false) => ({ id, daysBefore, done });

  it('runs from this week (Sun 27.9) to the wedding week', () => {
    const { weeks } = buildRoadmap('2027-03-09', [], today);
    expect(toIso(weeks[0].start)).toBe('2026-09-27');
    expect(weeks[weeks.length - 1].isWeddingWeek).toBe(true);
    expect(toIso(weeks[weeks.length - 1].start)).toBe('2027-03-07');
  });

  it('places tasks by due week and collects unfinished past tasks as overdue', () => {
    const tasks = [t('this', 158), t('next', 155), t('late', 170), t('lateDone', 170, true), t('wedding', 0)];
    const { overdue, weeks } = buildRoadmap('2027-03-09', tasks, today);
    expect(overdue.map((x) => x.id)).toEqual(['late']);
    expect(weeks[0].tasks.map((x) => x.id)).toEqual(['this']); // due 2.10
    expect(weeks[1].tasks.map((x) => x.id)).toEqual(['next']); // due 5.10
    expect(weeks[weeks.length - 1].tasks.map((x) => x.id)).toEqual(['wedding']);
  });

  it('daysBeforeFor is the inverse of taskDueDate', () => {
    expect(daysBeforeFor('2027-03-09', '2026-10-05')).toBe(155);
    expect(toIso(taskDueDate('2027-03-09', daysBeforeFor('2027-03-09', '2026-12-24')))).toBe('2026-12-24');
    expect(daysBeforeFor('2027-03-09', '2027-04-01')).toBe(0);
  });
});

describe('buildRoadmap across DST', () => {
  it('keeps a task in its own week after the clocks change (Israel, Oct 25 2026)', () => {
    const { weeks } = buildRoadmap('2027-03-09', [{ id: 'nov', daysBefore: daysBeforeFor('2027-03-09', '2026-11-03'), done: false }], new Date(2026, 9, 2, 12));
    const w = weeks.find((x) => x.tasks.length);
    expect(w && toIso(w.start)).toBe('2026-11-01');
  });
});

describe('task ranges', () => {
  it('parses startBefore, defaulting to a one-day task and never after the due date', () => {
    const s = parseWeddingState({ tasks: [{ id: 'a', daysBefore: 10 }, { id: 'b', daysBefore: 10, startBefore: 14 }, { id: 'c', daysBefore: 10, startBefore: 3 }] });
    expect(s.tasks.map((x) => x.startBefore)).toEqual([10, 14, 10]);
  });

  it('lays out a range across days and wraps it into the next week', () => {
    // Sun 4.10 – Sat 10.10.2026; task 6.10–13.10 (Tue → next Tue)
    const t = { id: 'r', daysBefore: daysBeforeFor('2027-03-09', '2026-10-13'), startBefore: daysBeforeFor('2027-03-09', '2026-10-06') };
    const w1 = layoutWeek('2027-03-09', new Date(2026, 9, 4), [t]);
    expect(w1).toMatchObject([{ col: 2, span: 5, lane: 0, continuesBefore: false, continuesAfter: true }]);
    const w2 = layoutWeek('2027-03-09', new Date(2026, 9, 11), [t]);
    expect(w2).toMatchObject([{ col: 0, span: 3, lane: 0, continuesBefore: true, continuesAfter: false }]);
  });

  it('stacks overlapping tasks into separate lanes and reuses free ones', () => {
    const d = (iso: string) => daysBeforeFor('2027-03-09', iso);
    const a = { id: 'a', daysBefore: d('2026-10-07'), startBefore: d('2026-10-04') }; // Sun–Wed
    const b = { id: 'b', daysBefore: d('2026-10-06'), startBefore: d('2026-10-05') }; // Mon–Tue
    const c = { id: 'c', daysBefore: d('2026-10-09'), startBefore: d('2026-10-08') }; // Thu–Fri
    const lanes = Object.fromEntries(layoutWeek('2027-03-09', new Date(2026, 9, 4), [a, b, c]).map((x) => [x.task.id, x.lane]));
    expect(lanes).toEqual({ a: 0, b: 1, c: 0 });
  });
});

describe('Hebrew calendar', () => {
  it('writes Hebrew numerals', () => {
    expect([1, 10, 15, 16, 21, 30, 787].map(gematria)).toEqual(['א׳', 'י׳', 'ט״ו', 'ט״ז', 'כ״א', 'ל׳', 'תשפ״ז']);
  });
  it('converts civil dates', () => {
    expect(hebrewDate(new Date(2026, 9, 2))).toEqual({ day: 21, month: 'תשרי', year: 5787 });
    expect(hebrewDateLabel(new Date(2027, 2, 9))).toBe('ל׳ באדר א׳ תשפ״ז'); // the wedding: Rosh Chodesh Adar II
  });
});

describe('venue catalog', () => {
  it('has unique ids and parses hidden ids / venue catalogId', () => {
    expect(new Set(VENUE_CATALOG.map((v) => v.id)).size).toBe(VENUE_CATALOG.length);
    const s = parseWeddingState({ catalogHidden: ['c01', 'c01', 'x/../y', 5], venues: [{ name: 'גרייס', catalogId: 'c38' }] });
    expect(s.catalogHidden).toEqual(['c01', 'xy']);
    expect(s.venues[0].catalogId).toBe('c38');
    expect(parseWeddingState({}).catalogHidden).toEqual([]);
  });
});
