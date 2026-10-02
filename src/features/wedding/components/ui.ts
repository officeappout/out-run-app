import type { CSSProperties } from 'react';
import type { WeddingState } from '../wedding.types';

/** Shared look and small helpers for the planner's components. */

export type Update = (fn: (s: WeddingState) => WeddingState) => void;

export const card = 'rounded-2xl border border-gray-200 bg-white p-4 md:p-5';
export const cellInput =
  'w-full min-w-[80px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

/**
 * Selected pill colors set inline as well as by class: in production the
 * label of a selected tab rendered invisible (dark on dark) — inline style
 * wins over whatever cascade caused it.
 */
export const SELECTED_STYLE: CSSProperties = { backgroundColor: '#0f172a', color: '#ffffff' };

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const fmtDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;
export const fmtIso = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};
