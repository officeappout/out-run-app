import { DEFAULT_SETTINGS } from './wedding.config';
import {
  TAG_COLORS,
  TOGETHER,
  type TagColor,
  VENDOR_STATUSES,
  VENUE_STATUSES,
  type Vendor,
  type VendorStatus,
  type Venue,
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
  };
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
  };
}

function parseTask(x: unknown, i: number): WeddingTask | null {
  if (!isObj(x)) return null;
  return {
    id: id(x.id, i, 'task'),
    name: str(x.name) || 'משימה',
    daysBefore: count(x.daysBefore),
    done: x.done === true,
    owner: str(x.owner, LIMITS.name),
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
    tasks: uniqueIds(list(s.tasks, LIMITS.tasks).map(parseTask).filter(notNull), 'task'),
  };
}
