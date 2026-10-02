import { describe, expect, it } from 'vitest';
import { daysUntil, rankVenues, taskDueDate, venueCost } from '../wedding.calc';
import { DEFAULT_SETTINGS, initialWeddingState, isWeddingOwner } from '../wedding.config';
import { LIMITS, parseWeddingState } from '../wedding.schema';
import type { Venue } from '../wedding.types';

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

  it('de-duplicates ids', () => {
    const s = parseWeddingState({ vendors: [{ id: 'v1', name: 'a' }, { id: 'v1', name: 'b' }] });
    expect(new Set(s.vendors.map((v) => v.id)).size).toBe(2);
  });
});

describe('isWeddingOwner', () => {
  it('matches case-insensitively and rejects others', () => {
    expect(isWeddingOwner('Office@AppOut.co.il')).toBe(true);
    expect(isWeddingOwner('matan.danan@appout.co.il')).toBe(false);
    expect(isWeddingOwner(null)).toBe(false);
  });
});
