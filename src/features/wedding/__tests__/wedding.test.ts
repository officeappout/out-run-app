import { describe, expect, it } from 'vitest';
import { bookingLead, closeWindow, syncVendorTasks, taskOrder } from '../wedding.links';
import { buildIcs, foldLine } from '../wedding.ics';
import { blockedReason, venuePriceFor, buildRoadmap, dateFactor, daysBeforeFor, daysUntil, gematria, hebrewDate, hebrewDateLabel, layoutWeek, monthOptions, rankVenues, taskDueDate, toIso, venueCost } from '../wedding.calc';
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
  priceIsEstimate: false,
  offers: [],
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
    expect(s.venues[0].priceIsEstimate).toBe(false);
    expect(parseWeddingState({ venues: [{ name: 'x', price: 457, priceIsEstimate: true }] }).venues[0].priceIsEstimate).toBe(true);
    expect(parseWeddingState({}).catalogHidden).toEqual([]);
  });
});

describe('date comparison', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  it('blocks the Omer, the Three Weeks and holidays, but not Lag BaOmer', () => {
    expect(blockedReason(at('2027-04-22'))).toBe('פסח'); // 15 Nisan
    expect(blockedReason(at('2027-04-29'))).toBe('ספירת העומר'); // 22 Nisan
    expect(blockedReason(at('2027-05-25'))).toBeNull(); // Lag BaOmer
    expect(blockedReason(at('2027-06-10'))).toBe('ספירת העומר'); // 5 Sivan
    expect(blockedReason(at('2027-06-11'))).toBe('שבועות');
    expect(blockedReason(at('2027-06-13'))).toBeNull();
    expect(blockedReason(at('2027-07-22'))).toBe('בין המצרים'); // 17 Tammuz
    expect(blockedReason(at('2027-08-13'))).toBeNull(); // 10 Av
    expect(blockedReason(at('2027-03-09'))).toBeNull(); // the wedding date
  });
  it('prices Thursdays and peak season higher than a winter weekday', () => {
    expect(dateFactor(at('2027-01-12'))).toBe(1); // Tue, January
    expect(dateFactor(at('2027-01-14'))).toBeCloseTo(1.11); // Thu
    expect(dateFactor(at('2027-06-15'))).toBeCloseTo(1.25); // Tue, June
    expect(dateFactor(at('2027-03-09'))).toBeCloseTo(1.12); // Tue, March
  });
  it('counts usable Sun–Thu dates per month', () => {
    const may = monthOptions(2027, 4);
    expect(may.blocked['ספירת העומר']).toBeGreaterThan(15);
    expect(may.weekdayFree + may.thursdayFree).toBeGreaterThanOrEqual(1); // Lag BaOmer at least
    const jan = monthOptions(2027, 0);
    expect(Object.keys(jan.blocked)).toEqual([]);
    expect(jan.weekdayFree + jan.thursdayFree).toBe(21);
  });
});

describe('venue price per scenario', () => {
  const v: Venue = { ...base, price: 330, date: '2027-03-09', offers: [{ id: 'o1', date: '2027-01-19', price: 280 }] };
  it('uses a quote for the same month and day type', () => {
    expect(venuePriceFor(v, 2027, 2, 'weekday')).toEqual({ price: 330, source: 'quote', fromDate: '2027-03-09' });
    expect(venuePriceFor(v, 2027, 0, 'weekday')).toEqual({ price: 280, source: 'quote', fromDate: '2027-01-19' });
  });
  it('projects other months / days from the main quote by the market factors', () => {
    // 330 on a March Tuesday (×1.12) → winter Thursday = 330/1.12×1.11
    expect(venuePriceFor(v, 2026, 11, 'thursday')).toEqual({ price: Math.round((330 / 1.12) * 1.11), source: 'derived', fromDate: '2027-03-09' });
    expect(venuePriceFor(v, 2027, 5, 'weekday')!.price).toBe(Math.round((330 / 1.12) * 1.25));
  });
  it('marks a catalog estimate and returns null without any price', () => {
    expect(venuePriceFor({ ...v, offers: [], priceIsEstimate: true }, 2027, 2, 'weekday')!.source).toBe('estimate');
    expect(venuePriceFor({ ...v, price: 0, offers: [] }, 2027, 2, 'weekday')).toBeNull();
  });
  it('parses offers and drops incomplete ones', () => {
    const s = parseWeddingState({ venues: [{ name: 'x', offers: [{ date: '2027-01-19', price: 280 }, { date: 'bad', price: 5 }, { date: '2027-02-01', price: 0 }] }] });
    expect(s.venues[0].offers).toHaveLength(1);
    expect(s.venues[0].offers[0]).toMatchObject({ date: '2027-01-19', price: 280 });
  });
});

describe('vendor ⇄ task link', () => {
  const today = new Date('2026-10-02T12:00:00');
  const base0 = parseWeddingState({ settings: { date: '2027-03-09' }, vendors: [{ id: 'p', name: 'צילום', status: 'לברר' }], tasks: [{ id: 'tp', name: 'צלם', daysBefore: 130, vendorId: 'p' }] });
  it('dates by the recommended lead, squeezed when late', () => {
    expect(bookingLead('צילום סטילס ווידאו').days).toBe(330);
    expect(bookingLead('מגנטים / עמדת צילום').days).toBe(180);
    expect(bookingLead('רבנות והדרכת כלה/חתן').days).toBe(90);
    expect(bookingLead('רב / עורך טקס').days).toBe(270);
    // every vendor name in use maps to its own row, not a substring neighbour
    for (const [name, days] of [['נעליים ואביזרים (כולל הינומה ותכשיטים)', 150], ['זר כלה וסידור פרחים לרכב', 270], ['מוזיקה לחופה (כנר/סקסופון/זמר)', 255], ['אפקטים (זיקוקים קרים, עשן, בועות)', 150], ['טיפים לצוות', 3], ['DJ (שלנו)', 255], ['שמלת כלה', 240], ['איפור ושיער', 180], ['הזמנות ואישורי הגעה', 90]] as const)
      expect([name, bookingLead(name).days]).toEqual([name, days]);
    expect(closeWindow('צילום', '2027-03-09', today)).toEqual({ startBefore: 158, daysBefore: 144, late: true });
    expect(closeWindow('טיפים לצוות', '2027-03-09', today)).toEqual({ startBefore: 17, daysBefore: 3, late: false });
  });
  it('a new vendor gets an auto task; deleting it removes that task', () => {
    const next = { ...base0, vendors: [...base0.vendors, { id: 'n', name: 'מגנטים', supplier: '', price: 0, paid: 0, status: 'לברר' as const, priceIsEstimate: false }] };
    const s1 = syncVendorTasks(base0, next, today, () => 'auto1');
    expect(s1.tasks.find((t) => t.id === 'auto1')).toMatchObject({ name: 'לסגור: מגנטים', vendorId: 'n', daysBefore: 144 });
    const s2 = syncVendorTasks(s1, { ...s1, vendors: s1.vendors.filter((v) => v.id !== 'n') }, today);
    expect(s2.tasks.some((t) => t.id === 'auto1')).toBe(false);
  });
  it('deleting a vendor only unlinks a task the couple wrote', () => {
    const s = syncVendorTasks(base0, { ...base0, vendors: [] }, today);
    expect(s.tasks[0]).toMatchObject({ id: 'tp', vendorId: '' });
  });
  it('vendor closed ⇄ task done', () => {
    const closed = syncVendorTasks(base0, { ...base0, vendors: [{ ...base0.vendors[0], status: 'נסגר' }] }, today);
    expect(closed.tasks[0].done).toBe(true);
    const reopened = syncVendorTasks(closed, { ...closed, tasks: [{ ...closed.tasks[0], done: false }] }, today);
    expect(reopened.vendors[0].status).toBe('לברר');
    const ticked = syncVendorTasks(base0, { ...base0, tasks: [{ ...base0.tasks[0], done: true }] }, today);
    expect(ticked.vendors[0].status).toBe('נסגר');
  });
  it('numbers tasks in booking order', () => {
    const o = taskOrder(parseWeddingState({ tasks: [{ id: 'a', daysBefore: 10 }, { id: 'b', daysBefore: 100 }, { id: 'c', daysBefore: 50 }] }).tasks);
    expect([o.get('b'), o.get('c'), o.get('a')]).toEqual([1, 2, 3]);
  });
});

describe('calendar feed (.ics)', () => {
  const s = parseWeddingState({
    settings: { date: '2027-03-09' },
    vendors: [{ id: 'p', name: 'צילום', supplier: 'סטודיו, לב', status: 'לברר' }],
    tasks: [
      { id: 'a', name: 'סגירת אולם', startBefore: 145, daysBefore: 140, owners: ['דוד'] },
      { id: 'b', name: 'צלם', daysBefore: 133, vendorId: 'p', done: true },
    ],
  });
  const ics = buildIcs(s, new Date('2026-10-02T12:00:00Z'));
  const unfolded = ics.replace(/\r\n /g, '');
  it('one all-day event per task over its range, plus the wedding day', () => {
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261015\r\nDTEND;VALUE=DATE:20261021');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20270309\r\nDTEND;VALUE=DATE:20270310');
    expect(unfolded).toContain('SUMMARY:#1 סגירת אולם · דוד');
    expect(unfolded).toContain('SUMMARY:✓ #2 צלם');
    expect(unfolded).toContain('ספק: צילום (סטודיו\\, לב)');
  });
  it('folds lines at 75 octets without breaking Hebrew letters', () => {
    const long = 'SUMMARY:' + 'חתונה '.repeat(40);
    const folded = foldLine(long);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});
