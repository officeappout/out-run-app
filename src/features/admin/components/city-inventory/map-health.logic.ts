/**
 * map-health.logic.ts — pure display logic of the "map health" card
 * (RC4 wave I2, docs/routes/CITY-MAPPING-PLAN.md §5). No React, no I/O.
 *
 * The one hard rule: "not measured" is never shown as 0. A layer with no
 * count / length / area / coverage is "לא נמדד"; a measured layer whose
 * coverage is not defined shows a dash with the reason, not "0%".
 *
 * Admin screens stay Hebrew-only (docs/i18n/PLAN.md decision 1 — admin is
 * not migrated to the i18n catalogs), so the copy lives here, like the rest
 * of /admin/city-mapping.
 */
import { isLayerMeasured } from '@/lib/city-inventory/readiness';
import {
  INVENTORY_LAYER_KEYS,
  type CityInventoryRun,
  type InventoryLayer,
  type InventoryLayerKey,
  type QualityFlag,
  type ReadinessLevel,
} from '@/lib/city-inventory/types';

export const NOT_MEASURED = 'לא נמדד';

export const LAYER_LABELS: Record<InventoryLayerKey, string> = {
  parks: 'פארקים',
  big_parks: 'פארקים גדולים',
  lap_loops: 'גינות להקפה (≥500 מ׳)',
  courts: 'מגרשים',
  fitness_stations: 'מתקני כושר',
  benches: 'ספסלים',
  drinking_water: 'ברזיות',
  toilets: 'שירותים',
  major_roads: 'כבישים ראשיים',
  crossings: 'מעברי חצייה',
  bike_paved: 'אופניים — סלול',
  bike_offroad: 'אופניים — שטח',
  bike_unknown: 'אופניים — משטח לא ידוע',
  trails_paved: 'שבילים סלולים',
  trails_offroad: 'שבילי שטח',
  promenades: 'טיילות',
  lighting: 'תאורה',
  shade: 'צל',
};

export const QUALITY_LABELS: Record<QualityFlag, string> = {
  below_expected_density: 'מתחת לצפוי (צפיפות מול ערים דומות)',
  single_source: 'מקור יחיד',
  stale_source: 'מקור ישן',
  untagged_majority: 'רוב לא מתויג',
  license_pending: 'ממתין לאישור רישיון',
};

export const LEVEL_LABELS: Record<ReadinessLevel, string> = {
  red: 'אדום',
  yellow: 'צהוב',
  green: 'ירוק',
};

const SOURCE_LABELS: Record<string, string> = {
  osm: 'OSM',
  technion_shade: 'טכניון (צל)',
  canopy_estimate: 'הערכת חופות',
};

const nf = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatNumber(n: number): string {
  return nf.format(n);
}

/** dd.mm.yyyy in Israel time; `—` for a missing date. */
export function formatDate(d: Date | null | undefined): string {
  return d && Number.isFinite(d.getTime()) ? df.format(d) : '—';
}

/** "How much": count, km, km² — or "לא נמדד", never 0 for an unmeasured layer. */
export function amountText(l: InventoryLayer): string {
  if (!isLayerMeasured(l)) return NOT_MEASURED;
  const parts: string[] = [];
  if (l.count !== null) parts.push(formatNumber(l.count));
  if (l.lengthKm !== null) parts.push(`${formatNumber(l.lengthKm)} ק״מ`);
  if (l.areaKm2 !== null) parts.push(`${formatNumber(l.areaKm2)} קמ״ר`);
  return parts.length ? parts.join(' · ') : '—';
}

export type CoverageTone = 'none' | 'low' | 'mid' | 'high';

export interface CoverageCell {
  text: string;
  /** Why there is no % (shown as a tooltip). */
  hint: string | null;
  tone: CoverageTone;
}

export function coverageCell(key: InventoryLayerKey, l: InventoryLayer): CoverageCell {
  if (!isLayerMeasured(l)) return { text: NOT_MEASURED, hint: null, tone: 'none' };
  const density = l.density !== null ? `${formatNumber(l.density)} לק״מ רחוב` : null;
  if (l.coveragePct === null) {
    let hint = 'אין מדד כיסוי לשכבה הזו';
    if (l.method === 'osm_density_vs_peers') hint = 'אין עדיין חציון של ערים דומות (צריך ≥3 ערים שנמדדו)';
    else if (key === 'parks') hint = 'כיסוי פארקים דורש שכבה עירונית להשוואה';
    return { text: density ?? '—', hint, tone: 'none' };
  }
  const pct = `${formatNumber(l.coveragePct)}%`;
  const tone: CoverageTone = l.coveragePct < 50 ? 'low' : l.coveragePct < 80 ? 'mid' : 'high';
  return { text: density ? `${pct} · ${density}` : pct, hint: null, tone };
}

export function sourceText(l: InventoryLayer): string {
  if (!l.sources.length) return '—';
  return l.sources
    .map((s) => `${SOURCE_LABELS[s.key] ?? s.key} · ${s.license || 'רישיון לא ידוע'}${s.snapshotDate ? ` · ${s.snapshotDate}` : ''}`)
    .join(' | ');
}

/** Gap / quality notes for one row. `single_source` is left out (true of every OSM-only layer today). */
export function gapNotes(key: InventoryLayerKey, l: InventoryLayer): string[] {
  if (!isLayerMeasured(l)) {
    return [key === 'shade' ? 'לא חושב (אין שכבת טכניון לעיר; הערכת חופות — גל I4)' : 'לא נמדד בריצה הזו'];
  }
  const notes: string[] = [];
  if (l.count === 0) notes.push('אין ב-OSM');
  for (const f of l.quality) if (f !== 'single_source') notes.push(QUALITY_LABELS[f]);
  return notes;
}

/**
 * Layers that look like a fetch failure between two runs ("a zero that isn't
 * zero", plan §3.2): a count that was > 0 and is now 0, or a layer that was
 * measured and now isn't. `runs` is newest first; result is per run (vs. the
 * next older one in the list; the oldest gets none).
 */
type Measurable = Pick<InventoryLayer, 'count' | 'coveragePct' | 'lengthKm' | 'areaKm2'>;
const measured = (l: Measurable | undefined): boolean =>
  !!l && (l.count !== null || l.coveragePct !== null || l.lengthKm !== null || l.areaKm2 !== null);

export function runRegressions(runs: readonly CityInventoryRun[]): InventoryLayerKey[][] {
  return runs.map((run, i) => {
    const prev = runs[i + 1];
    if (!prev) return [];
    return INVENTORY_LAYER_KEYS.filter((k) => {
      const now = run.layers[k];
      const before = prev.layers[k];
      if (!measured(before)) return false;
      if (!measured(now)) return true;
      return (before.count ?? 0) > 0 && now.count === 0;
    });
  });
}
