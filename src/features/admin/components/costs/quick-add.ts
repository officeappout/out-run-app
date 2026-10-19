/**
 * "הוסף מהר" — suggestions that PREFILL the item form. Nothing is written until the owner saves.
 * Amounts are left empty where we don't know the real number.
 */
import type { CostItemInput } from '@/lib/costs/item-schema';

export type QuickAdd = { key: string; label: string; draft: Partial<CostItemInput> };

export const QUICK_ADDS: QuickAdd[] = [
  { key: 'workspace', label: 'Google Workspace / דומיינים', draft: { name: 'Google Workspace + דומיינים', vendor: 'Google', amount: 150, currency: 'ILS', cadence: 'monthly', category: 'tools' } },
  { key: 'apple', label: 'Apple Developer', draft: { name: 'Apple Developer Program', vendor: 'Apple', amount: 99, currency: 'USD', cadence: 'yearly', category: 'stores' } },
  { key: 'play', label: 'Google Play', draft: { name: 'Google Play Console', vendor: 'Google', amount: 25, currency: 'USD', cadence: 'one_off', category: 'stores' } },
  { key: 'claude', label: 'מנוי Claude', draft: { name: 'מנוי Claude', vendor: 'Anthropic', currency: 'USD', cadence: 'monthly', category: 'ai' } },
  { key: 'figma', label: 'Figma', draft: { name: 'Figma', vendor: 'Figma', currency: 'USD', cadence: 'monthly', category: 'tools' } },
  { key: 'registrar', label: 'רשם דומיינים', draft: { name: 'רישום דומיין', vendor: '', currency: 'USD', cadence: 'yearly', category: 'domains' } },
  { key: 'sms', label: 'ספק SMS', draft: { name: 'ספק SMS', vendor: '', currency: 'ILS', cadence: 'monthly', category: 'comms' } },
  { key: 'mapbox', label: 'Mapbox', draft: { name: 'Mapbox', vendor: 'Mapbox', vendorKey: 'mapbox', currency: 'USD', cadence: 'monthly', category: 'infra' } },
  { key: 'vercel', label: 'Vercel Pro', draft: { name: 'Vercel Pro', vendor: 'Vercel', vendorKey: 'vercel', amount: 20, currency: 'USD', cadence: 'monthly', category: 'infra' } },
  { key: 'github', label: 'GitHub', draft: { name: 'GitHub', vendor: 'GitHub', vendorKey: 'github', currency: 'USD', cadence: 'monthly', category: 'tools' } },
];
