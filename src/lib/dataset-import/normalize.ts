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

export function normalizeFeatures(input: unknown, spec: DatasetSpec): { lines: DatasetLine[]; report: NormalizeReport } {
  const features = collectFeatures(input);
  const report: NormalizeReport = { features: features.length, lines: 0, skippedNotLine: 0, skippedStatus: {}, skippedBadCoords: 0, reprojectedFromItm: 0 };
  const lines: DatasetLine[] = [];
  features.forEach((f, idx) => {
    const props = f?.properties ?? {};
    const parts = linesOf(f?.geometry);
    if (!parts.length) { report.skippedNotLine++; return; }
    const status = spec.statusField ? String(props[spec.statusField] ?? '').trim() || null : null;
    if (spec.statusField && !spec.existingStatuses.includes(status ?? '')) {
      const k = status ?? '(empty)';
      report.skippedStatus[k] = (report.skippedStatus[k] ?? 0) + 1;
      return;
    }
    const baseId = spec.idField && props[spec.idField] != null && String(props[spec.idField]).trim() ? String(props[spec.idField]).trim() : `f${idx}`;
    const name = String(props[spec.nameField] ?? '').trim();
    parts.forEach((part, pi) => {
      const first = Array.isArray(part) ? (part[0] as number[] | undefined) : undefined;
      const itm = !!first && looksLikeItm(first);
      const coords = (part as unknown[]).map((c) => toLngLat(c, itm)).filter((c): c is LngLat => !!c);
      if (coords.length < 2 || coords.length !== part.length) { report.skippedBadCoords++; return; }
      if (itm) report.reprojectedFromItm++;
      lines.push({ featureId: parts.length > 1 ? `${baseId}#${pi}` : baseId, name, status, coords });
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
