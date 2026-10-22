/**
 * GeoJSON features (from a shapefile, a GeoJSON file or an ArcGIS
 * `query?f=geojson`) → DatasetLine[]: lines only, MultiLineString exploded,
 * ITM auto-detected and reprojected, status-filtered to "exists on the ground".
 */
import { itmToWgs84, looksLikeItm, looksLikeWgs84Israel } from './itm';
import type { DatasetLine, DatasetSpec, LngLat } from './types';

type Feature = { type?: string; properties?: Record<string, unknown> | null; geometry?: { type?: string; coordinates?: unknown } | null };

export interface NormalizeReport {
  features: number;
  lines: number;
  skippedNotLine: number;
  skippedStatus: Record<string, number>;
  /** Features dropped by the spec's excludeWhere (e.g. bike crossings). */
  skippedExcluded: number;
  skippedBadCoords: number;
  reprojectedFromItm: number;
}

function toLngLat(raw: unknown, itm: boolean): LngLat | null {
  if (!Array.isArray(raw) || typeof raw[0] !== 'number' || typeof raw[1] !== 'number') return null;
  const p: LngLat = itm ? itmToWgs84(raw[0], raw[1]) : [raw[0], raw[1]];
  return looksLikeWgs84Israel(p) ? p : null;
}

function linesOf(g: Feature['geometry']): unknown[][] {
  if (!g) return [];
  if (g.type === 'LineString' && Array.isArray(g.coordinates)) return [g.coordinates as unknown[]];
  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) return g.coordinates as unknown[][];
  return [];
}

/** Collect features from a FeatureCollection, an array of collections (shpjs returns one per layer), or a bare array. */
export function collectFeatures(input: unknown): Feature[] {
  if (Array.isArray(input)) return input.flatMap((x) => (x && typeof x === 'object' && 'features' in (x as object) ? collectFeatures(x) : [x as Feature]));
  const fc = input as { features?: unknown };
  return Array.isArray(fc?.features) ? (fc.features as Feature[]) : [];
}

/** Shapefile field names vary in case between releases (Jerusalem 2019: `name`/`status`, registry: `NAME`/`STATUS`). */
export function propCI(props: Record<string, unknown>, field: string): unknown {
  if (field in props) return props[field];
  const want = field.toLowerCase();
  const hit = Object.keys(props).find((k) => k.toLowerCase() === want);
  return hit === undefined ? undefined : props[hit];
}

function keptAttrs(props: Record<string, unknown>, fields: string[] | undefined): Record<string, string> | null {
  if (!fields?.length) return null;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = propCI(props, f);
    if (v != null && String(v).trim()) out[f] = String(v).trim();
  }
  return out;
}

export function normalizeFeatures(input: unknown, spec: DatasetSpec): { lines: DatasetLine[]; report: NormalizeReport } {
  const features = collectFeatures(input);
  const report: NormalizeReport = { features: features.length, lines: 0, skippedNotLine: 0, skippedStatus: {}, skippedExcluded: 0, skippedBadCoords: 0, reprojectedFromItm: 0 };
  const lines: DatasetLine[] = [];
  features.forEach((f, idx) => {
    const props = f?.properties ?? {};
    if (spec.excludeWhere && spec.excludeWhere.values.includes(String(propCI(props, spec.excludeWhere.field) ?? '').trim())) { report.skippedExcluded++; return; }
    const parts = linesOf(f?.geometry);
    if (!parts.length) { report.skippedNotLine++; return; }
    const status = spec.statusField ? String(propCI(props, spec.statusField) ?? '').trim() || null : null;
    if (spec.statusField && !spec.existingStatuses.includes(status ?? '')) {
      const k = status ?? '(empty)';
      report.skippedStatus[k] = (report.skippedStatus[k] ?? 0) + 1;
      return;
    }
    const baseId = spec.idField && propCI(props, spec.idField) != null && String(propCI(props, spec.idField)).trim() ? String(propCI(props, spec.idField)).trim() : `f${idx}`;
    const name = String(propCI(props, spec.nameField) ?? '').trim() || (spec.nameFallbackField ? String(propCI(props, spec.nameFallbackField) ?? '').trim() : '');
    const attrs = keptAttrs(props, spec.keepFields);
    parts.forEach((part, pi) => {
      const first = Array.isArray(part) ? (part[0] as number[] | undefined) : undefined;
      const itm = !!first && looksLikeItm(first);
      const coords = (part as unknown[]).map((c) => toLngLat(c, itm)).filter((c): c is LngLat => !!c);
      if (coords.length < 2 || coords.length !== part.length) { report.skippedBadCoords++; return; }
      if (itm) report.reprojectedFromItm++;
      lines.push({ featureId: parts.length > 1 ? `${baseId}#${pi}` : baseId, name, status, coords, ...(attrs ? { attrs } : {}) });
    });
  });
  // Feature ids must be unique for deterministic route ids.
  const seen = new Map<string, number>();
  for (const l of lines) {
    const n = seen.get(l.featureId) ?? 0;
    seen.set(l.featureId, n + 1);
    if (n > 0) l.featureId = `${l.featureId}~${n}`;
  }
  report.lines = lines.length;
  return { lines, report };
}
