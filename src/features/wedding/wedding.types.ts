/**
 * Wedding planner — the owner's personal tool, reached only through the
 * open link (/public/wedding). Not part of the admin panel.
 * Self-contained domain: nothing outside src/features/wedding imports from
 * here except that page and /api/public/wedding.
 */

export const VENUE_STATUSES = ['לברר', 'נשלחה הצעה', 'ביקרנו', 'במשא ומתן', 'נבחר', 'נפסל'] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];

export const VENDOR_STATUSES = ['לברר', 'קיבלנו הצעה', 'נסגר', 'שולם במלואו'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export interface WeddingSettings {
  /** ISO date, YYYY-MM-DD */
  date: string;
  guests: number;
  low: number;
  high: number;
  /** 0 = not set */
  budget: number;
  /** VAT percent, e.g. 18 */
  vat: number;
  /** Cost to add when the venue does not include it (₪) */
  design: number;
  chuppah: number;
  light: number;
  /** Bar cost per guest (₪) */
  bar: number;
  /** Names that tasks can be tagged with (who does it). */
  people: string[];
}

export interface VenueIncludes {
  design: boolean;
  chuppah: boolean;
  light: boolean;
  bar: boolean;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  contact: string;
  date: string;
  status: VenueStatus;
  /** Quoted price per plate (₪) */
  price: number;
  vatIncluded: boolean;
  minGuests: number;
  /** Alcohol add-on per plate (₪) */
  alcohol: number;
  incl: VenueIncludes;
  /** Fee the venue charges for bringing an outside DJ (₪) */
  djFee: number;
  extras: number;
  discount: number;
  notes: string;
}

export interface Vendor {
  id: string;
  name: string;
  supplier: string;
  price: number;
  paid: number;
  status: VendorStatus;
}

export interface WeddingTask {
  id: string;
  name: string;
  daysBefore: number;
  done: boolean;
  /** Who does it: one of settings.people, TOGETHER, or '' (not assigned). */
  owner: string;
}

/** Owner value for a task both people do. */
export const TOGETHER = 'ביחד';

export interface WeddingState {
  settings: WeddingSettings;
  venues: Venue[];
  vendors: Vendor[];
  tasks: WeddingTask[];
}

/** What GET returns and PUT accepts: the state plus an optimistic-concurrency revision. */
export interface WeddingDocument {
  state: WeddingState;
  rev: number;
}
