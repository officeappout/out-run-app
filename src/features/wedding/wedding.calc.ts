import type { Venue, WeddingSettings } from './wedding.types';

export interface VenueCost {
  /** Price per plate after alcohol and VAT */
  real: number;
  /** Plates actually billed: max(guests, venue minimum) */
  plates: number;
  /** Plates paid for but not eaten because of the venue minimum */
  emptyPlates: number;
  /** Items the package lacks, with the cost added for each */
  gaps: Array<{ label: string; amount: number }>;
  gapSum: number;
  meals: number;
  total: number;
  perGuest: number;
}

const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/**
 * True cost of a venue offer for a given guest count. Pure — the single
 * source for every number the page shows.
 *
 *   total = real × max(guests, min) + missing items + DJ fee + extras − discount
 *   real  = (price + alcohol) × (vatIncluded ? 1 : 1 + vat%)
 */
export function venueCost(venue: Venue, guests: number, settings: WeddingSettings): VenueCost {
  const g = Math.max(0, num(guests));
  const vatFactor = venue.vatIncluded ? 1 : 1 + num(settings.vat) / 100;
  const real = (num(venue.price) + num(venue.alcohol)) * vatFactor;
  const min = num(venue.minGuests);
  const plates = Math.max(g, min);
  const inc = venue.incl ?? { design: false, chuppah: false, light: false, bar: false };

  const gaps: VenueCost['gaps'] = [];
  if (!inc.design) gaps.push({ label: 'עיצוב', amount: num(settings.design) });
  if (!inc.chuppah) gaps.push({ label: 'חופה', amount: num(settings.chuppah) });
  if (!inc.light) gaps.push({ label: 'תאורה והגברה', amount: num(settings.light) });
  if (!inc.bar) gaps.push({ label: 'בר', amount: num(settings.bar) * g });
  const gapSum = gaps.reduce((s, x) => s + x.amount, 0);

  const meals = real * plates;
  const total = meals + gapSum + num(venue.djFee) + num(venue.extras) - num(venue.discount);

  return {
    real,
    plates,
    emptyPlates: Math.max(0, min - g),
    gaps,
    gapSum,
    meals,
    total,
    perGuest: g > 0 ? total / g : 0,
  };
}

/** Venues still in play (not rejected, has a price), cheapest real total first. */
export function rankVenues(
  venues: Venue[],
  guests: number,
  settings: WeddingSettings,
): Array<{ venue: Venue; cost: VenueCost }> {
  return venues
    .filter((v) => v.status !== 'נפסל' && num(v.price) > 0)
    .map((venue) => ({ venue, cost: venueCost(venue, guests, settings) }))
    .sort((a, b) => a.cost.total - b.cost.total);
}

/** Due date of a task counted back from the wedding date. */
export function taskDueDate(weddingIso: string, daysBefore: number): Date {
  const d = new Date(`${weddingIso}T00:00:00`);
  d.setDate(d.getDate() - num(daysBefore));
  return d;
}

export function daysUntil(weddingIso: string, today: Date = new Date()): number {
  const target = new Date(`${weddingIso}T00:00:00`);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function formatShekel(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} ₪`;
}
