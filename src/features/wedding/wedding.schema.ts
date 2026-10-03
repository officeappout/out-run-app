import { DEFAULT_SETTINGS } from './wedding.config';
import {
  TAG_COLORS,
  TASK_COLORS,
  FAMILY_KINDS,
  HEBREW_MONTHS,
  type FamilyDate,
  type FamilyKind,
  type HebrewMonth,
  type TaskColor,
  TOGETHER,
  type TagColor,
  VENDOR_STATUSES,
  VENUE_STATUSES,
  type Vendor,
  type VendorStatus,
  type Venue,
  type VenueOffer,
  type VenueStatus,
  type WeddingSettings,
  type WeddingState,
  type WeddingTask,
} from './wedding.types';

/**
 * Coerces an untrusted body (PUT /api/public/wedding) or a stored Firestore
 * document into a well-formed WeddingState. Never throws: bad fields fall
 * back to defaults, oversized lists and strings are truncated. Field-guard
 * rule (CLAUDE.md §5) — nothing here assumes a field exists.
 */

export const LIMITS = { venues: 100, vendors: 100, tasks: 200, text: 300, notes: 2000, people: 10, name: 30 } as const;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

function str(x: unknown, max: number = LIMITS.text): string {
  return typeof x === 'string' ? x.trim().slice(0, max) : '';
}
function money(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 10_000_000);
}
function count(x: unknown, fallback = 0): number {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), 100_000);
}
function isoDate(x: unknown, fallback: string): string {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : fallback;
}
function id(x: unknown, i: number, prefix: string): string {
  const s = typeof x === 'string' ? x.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
  return s || `${prefix}${i}`;
}
function oneOf<T extends string>(x: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(x as T) ? (x as T) : fallback;
}
function list(x: unknown, max: number): unknown[] {
  return Array.isArray(x) ? x.slice(0, max) : [];
}

export function parseSettings(x: unknown): WeddingSettings {
  const s = isObj(x) ? x : {};
  const d = DEFAULT_SETTINGS;
  return {
    date: isoDate(s.date, d.date),
    guests: count(s.guests, d.guests) || d.guests,
    low: count(s.low, d.low),
    high: count(s.high, d.high),
    budget: money(s.budget),
    vat: s.vat === undefined ? d.vat : Math.min(money(s.vat), 100),
    design: s.design === undefined ? d.design : money(s.design),
    chuppah: s.chuppah === undefined ? d.chuppah : money(s.chuppah),
    light: s.light === undefined ? d.light : money(s.light),
    bar: s.bar === undefined ? d.bar : money(s.bar),
    people: parsePeople(s.people),
    tagColors: parseTagColors(s.tagColors),
    familyDates: parseFamilyDates(s.familyDates),
  };
}

function intIn(x: unknown, min: number, max: number): number {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n >= min && n <= max ? n : 0;
}

function parseFamilyDates(x: unknown): FamilyDate[] {
  return list(x, 60)
    .map((f, i): FamilyDate | null => {
      if (!isObj(f)) return null;
      const out: FamilyDate = {
        id: id(f.id, i, 'fd'),
        name: str(f.name, 60),
        kind: oneOf<FamilyKind>(f.kind, FAMILY_KINDS, 'אחר'),
        hDay: intIn(f.hDay, 1, 30),
        hMonth: oneOf<HebrewMonth>(f.hMonth, HEBREW_MONTHS, 'תשרי'),
        gDay: intIn(f.gDay, 1, 31),
        gMonth: intIn(f.gMonth, 1, 12),
      };
      if (!out.gDay || !out.gMonth) out.gDay = out.gMonth = 0;
      return out.name && (out.hDay || out.gDay) ? out : null;
    })
    .filter((f): f is FamilyDate => !!f);
}

function parseTagColors(x: unknown): Record<string, TagColor> {
  const out: Record<string, TagColor> = {};
  if (!isObj(x)) return out;
  for (const [k, v] of Object.entries(x).slice(0, LIMITS.people + 1)) {
    const name = str(k, LIMITS.name);
    if (name && TAG_COLORS.includes(v as TagColor)) out[name] = v as TagColor;
  }
  return out;
}

function parsePeople(x: unknown): string[] {
  if (!Array.isArray(x)) return [...DEFAULT_SETTINGS.people];
  const out: string[] = [];
  for (const p of x.slice(0, LIMITS.people)) {
    const name = str(p, LIMITS.name);
    if (name && name !== TOGETHER && !out.includes(name)) out.push(name);
  }
  return out;
}

function parseVenue(x: unknown, i: number, weddingDate: string): Venue | null {
  if (!isObj(x)) return null;
  const inc = isObj(x.incl) ? x.incl : {};
  return {
    id: id(x.id, i, 'venue'),
    name: str(x.name) || 'אולם ללא שם',
    city: str(x.city),
    contact: str(x.contact),
    date: isoDate(x.date, weddingDate),
    status: oneOf<VenueStatus>(x.status, VENUE_STATUSES, 'לברר'),
    price: money(x.price),
    vatIncluded: x.vatIncluded === true,
    minGuests: count(x.minGuests),
    alcohol: money(x.alcohol),
    incl: {
      design: inc.design === true,
      chuppah: inc.chuppah === true,
      light: inc.light === true,
      bar: inc.bar === true,
    },
    djFee: money(x.djFee),
    extras: money(x.extras),
    discount: money(x.discount),
    notes: str(x.notes, LIMITS.notes),
    priceIsEstimate: x.priceIsEstimate === true,
    offers: list(x.offers, 20)
      .map((o, j) => (isObj(o) ? { id: id(o.id, j, 'offer'), date: isoDate(o.date, ''), price: money(o.price) } : null))
      .filter((o): o is VenueOffer => !!o && !!o.date && o.price > 0),
    catalogId: typeof x.catalogId === 'string' ? x.catalogId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : '',
  };
}

function parseVendor(x: unknown, i: number): Vendor | null {
  if (!isObj(x)) return null;
  return {
    id: id(x.id, i, 'vendor'),
    name: str(x.name) || 'ספק',
    supplier: str(x.supplier),
    price: money(x.price),
    paid: money(x.paid),
    status: oneOf<VendorStatus>(x.status, VENDOR_STATUSES, 'לברר'),
    priceIsEstimate: x.priceIsEstimate === true,
  };
}

/** Owners from `owners[]`, or the legacy single `owner` string; legacy TOGETHER = every person. */
function parseOwners(x: Obj, people: string[]): string[] {
  const raw = Array.isArray(x.owners) ? x.owners : typeof x.owner === 'string' && x.owner ? [x.owner] : [];
  const out: string[] = [];
  for (const o of raw.slice(0, LIMITS.people + 1)) {
    const name = str(o, LIMITS.name);
    const names = name === TOGETHER ? people : name ? [name] : [];
    for (const n of names) if (!out.includes(n)) out.push(n);
  }
  return out;
}

function parseTask(x: unknown, i: number, people: string[]): WeddingTask | null {
  if (!isObj(x)) return null;
  const daysBefore = count(x.daysBefore);
  const start = x.startBefore === undefined ? daysBefore : count(x.startBefore);
  return {
    id: id(x.id, i, 'task'),
    name: str(x.name) || 'משימה',
    daysBefore,
    startBefore: Math.max(start, daysBefore),
    done: x.done === true,
    owners: parseOwners(x, people),
    vendorId: typeof x.vendorId === 'string' ? x.vendorId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '',
    color: TASK_COLORS.includes(x.color as TaskColor) ? (x.color as TaskColor) : '',
    notes: str(x.notes, LIMITS.notes),
  };
}

function uniqueIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    const next = seen.has(it.id) ? { ...it, id: `${prefix}${i}-${Date.now().toString(36)}` } : it;
    seen.add(next.id);
    return next;
  });
}

const notNull = <T>(x: T | null): x is T => x !== null;

export function parseWeddingState(x: unknown): WeddingState {
  const s = isObj(x) ? x : {};
  const settings = parseSettings(s.settings);
  return {
    settings,
    venues: uniqueIds(list(s.venues, LIMITS.venues).map((v, i) => parseVenue(v, i, settings.date)).filter(notNull), 'venue'),
    vendors: uniqueIds(list(s.vendors, LIMITS.vendors).map(parseVendor).filter(notNull), 'vendor'),
    catalogHidden: list(s.catalogHidden, 500)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20))
      .filter((v, i, a) => v && a.indexOf(v) === i),
    tasks: uniqueIds(list(s.tasks, LIMITS.tasks).map((t, i) => parseTask(t, i, settings.people)).filter(notNull), 'task'),
  };
}
