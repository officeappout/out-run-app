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
  /** Tag name (a person or TOGETHER) → color key from TAG_COLORS. Missing = default by position. */
  tagColors: Record<string, TagColor>;
}

export const TAG_COLORS = ['sky', 'violet', 'amber', 'teal', 'rose', 'lime', 'emerald', 'orange', 'pink', 'slate'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

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
  /** Set when the venue was added from the suggested-venues catalog ('' otherwise). */
  catalogId: string;
  /** price is the catalog's couple-reported average, not a quote. Cleared when the price is edited. */
  priceIsEstimate: boolean;
  /** Quotes for other dates (price per plate). Same terms otherwise: VAT, minimum, inclusions, DJ fee. */
  offers: VenueOffer[];
}

export interface VenueOffer {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  price: number;
}

export interface Vendor {
  id: string;
  name: string;
  supplier: string;
  price: number;
  paid: number;
  status: VendorStatus;
  /** price is a market-midpoint estimate, not a quote. Cleared when the price is edited. */
  priceIsEstimate: boolean;
}

export interface WeddingTask {
  id: string;
  name: string;
  /** Due date (end of the range), as days before the wedding. */
  daysBefore: number;
  /** Start of the range, as days before the wedding. Equal to daysBefore = a one-day task. */
  startBefore: number;
  done: boolean;
  /** Who does it: names from settings.people. Empty = not assigned. */
  owners: string[];
  /** The vendor this task closes ('' = none). Done ⇄ vendor closed are kept in sync. */
  vendorId: string;
  /** The task's own color in the calendar ('' = automatic by booking order). Independent of the owner tags. */
  color: TaskColor | '';
}

export const TASK_COLORS = ['sky', 'violet', 'amber', 'teal', 'rose', 'lime', 'indigo', 'orange', 'cyan', 'fuchsia', 'emerald', 'yellow', 'blue', 'pink'] as const;
export type TaskColor = (typeof TASK_COLORS)[number];

/**
 * Legacy single-owner value meaning "both of us". Tasks now take several
 * owners, so on load it is expanded to every person; kept only for parsing.
 */
export const TOGETHER = 'ביחד';

export interface WeddingState {
  settings: WeddingSettings;
  venues: Venue[];
  vendors: Vendor[];
  tasks: WeddingTask[];
  /** Suggested-venue catalog ids marked 'לא רלוונטי'. */
  catalogHidden: string[];
}

/** What GET returns and PUT accepts: the state plus an optimistic-concurrency revision. */
export interface WeddingDocument {
  state: WeddingState;
  rev: number;
}
