/**
 * admin_cost_items — input validation (API) and the read-side parser (field guards). Pure.
 */
import { z } from 'zod';
import { CADENCES, COST_CATEGORIES, CURRENCIES, type CostItem, type VendorKey } from './cost-types';
import { isDayKey } from './month';

const VENDOR_KEYS = ['anthropic', 'gcp', 'vercel', 'bunny', 'github', 'mapbox'] as const;
const day = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

const fields = {
  name: z.string().trim().min(1).max(80),
  vendor: z.string().trim().max(80),
  vendorKey: z.enum(VENDOR_KEYS).nullable().optional(),
  amount: z.number().finite().positive().max(1_000_000),
  currency: z.enum(CURRENCIES as unknown as [string, ...string[]]),
  cadence: z.enum(CADENCES as unknown as [string, ...string[]]),
  startDate: day,
  renewalDate: day.nullable().optional(),
  category: z.enum(COST_CATEGORIES as unknown as [string, ...string[]]),
  notes: z.string().max(500).optional(),
};

export const CostItemInputSchema = z.object({ ...fields, vendor: fields.vendor.default('') }).strict();

export type CostItemInput = z.infer<typeof CostItemInputSchema>;

/** PATCH: any subset of the fields (no defaults — an absent field stays untouched), or
 *  { active: false } to deactivate / { active: true } to restore. */
export const CostItemPatchSchema = z.object(fields).partial().extend({ active: z.boolean().optional() }).strict();

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Firestore doc → CostItem, or null when it can't be used (never throws). */
export function parseCostItem(id: string, raw: Record<string, unknown> | undefined): CostItem | null {
  if (!raw) return null;
  const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : NaN;
  const currency = (CURRENCIES as readonly string[]).includes(raw.currency as string) ? (raw.currency as CostItem['currency']) : null;
  const cadence = (CADENCES as readonly string[]).includes(raw.cadence as string) ? (raw.cadence as CostItem['cadence']) : null;
  if (!(amount > 0) || !currency || !cadence || !isDayKey(raw.startDate)) return null;
  const vendorKey = (VENDOR_KEYS as readonly string[]).includes(raw.vendorKey as string) ? (raw.vendorKey as VendorKey) : null;
  return {
    id,
    name: str(raw.name, '(ללא שם)'),
    vendor: str(raw.vendor),
    vendorKey,
    amount,
    currency,
    cadence,
    startDate: raw.startDate,
    renewalDate: isDayKey(raw.renewalDate) ? raw.renewalDate : null,
    endDate: isDayKey(raw.endDate) ? raw.endDate : null,
    category: (COST_CATEGORIES as readonly string[]).includes(raw.category as string) ? (raw.category as CostItem['category']) : 'other',
    notes: str(raw.notes),
    active: raw.active !== false,
  };
}
