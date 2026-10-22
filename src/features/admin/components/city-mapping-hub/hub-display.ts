/**
 * hub-display.ts — Hebrew labels + formatting for the city-mapping hub. Pure.
 * Admin screens stay Hebrew-only (docs/i18n/PLAN.md decision 1). The one hard
 * rule from map-health.logic.ts holds: "not measured" is never shown as 0.
 */
import type { HubGapKey, HubRow } from '@/lib/city-mapping-hub/rows';
import { NOT_MEASURED, formatNumber } from '../city-inventory/map-health.logic';

export { NOT_MEASURED };

export const TYPE_LABELS: Record<string, string> = {
  city: 'עירייה',
  local_council: 'מועצה מקומית',
  regional_council: 'מועצה אזורית',
};

export const GAP_LABELS: Record<HubGapKey, string> = {
  not_measured: 'לא נמדדה',
  boundary: 'אין גבול',
  quota: 'מתחת למכסה',
  shade: 'צל חסר',
  layers: 'שכבות לא נמדדו',
  snapshot: 'אין צילום OSM',
  density: 'נקודות מתחת לצפוי',
  lighting: 'תאורה לא נמדדה',
  stale: 'מקור ישן',
};

/** Why + what to do, one line each (the full gaps panel is wave H4). */
export const GAP_HINTS: Record<HubGapKey, string> = {
  not_measured: 'לרשות אין עדיין מסמך מלאי — הרצת מלאי (סקריפט שדוד מריץ).',
  boundary: 'אין גבול מנהלי מאומת — אישור גבול בדף מיפוי העיר.',
  quota: 'פחות מסלולים מאושרים מהמינימום — לבדוק ממתינים או להריץ גילוי מסלולים.',
  shade: 'אין שכבת צל (טכניון) לעיר, או כיסוי נמוך.',
  layers: 'שכבות OSM שלא נמדדו בריצה האחרונה.',
  snapshot: 'אין תאריך צילום OSM לריצה.',
  density: 'ספסלים / ברזיות / שירותים מתחת לחציון ערים דומות.',
  lighting: 'אין נתון תאורה (רק תג lit של OSM או כלום).',
  stale: 'אחד המקורות ישן — רענון מלאי.',
};

export const LEVEL_DOT: Record<'red' | 'yellow' | 'green', string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  green: 'bg-emerald-500',
};

export const pctText = (v: number | null) => (v == null ? NOT_MEASURED : `${Math.round(v)}%`);
export const densityText = (v: number | null) => (v == null ? NOT_MEASURED : formatNumber(v));

export function quotaPct(r: HubRow): number {
  return Math.min(100, Math.round((r.approvedRoutes / Math.max(1, r.quota.min)) * 100));
}

/** dd.mm.yyyy (Israel time) from an ISO string; `—` when missing / invalid. */
export function dateText(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}
