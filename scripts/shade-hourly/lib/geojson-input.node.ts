/**
 * Read polygon / point features from a local GeoJSON (.geojson) or
 * GeoJSON-sequence (.geojsonl / .geojsonseq / .jsonl) file. Sequences are
 * streamed line by line; a plain FeatureCollection is parsed whole (meant for
 * samples). ITM (EPSG:2039) coordinates are detected and converted to WGS84.
 *
 * Downloaded files are untrusted data: this only JSON.parses them, never
 * evaluates anything. READ-ONLY w.r.t. every backend.
 */
import * as fs from 'fs';
import * as readline from 'readline';
import { itmToWgs84, looksLikeItm } from '../../../src/lib/dataset-import/itm';
import type { LonLat } from '../../../src/lib/shade/types';

export interface InputFeature {
  /** Outer rings (Polygon / MultiPolygon) — empty for points. */
  rings: LonLat[][];
  /** Point coordinates (Point / MultiPoint). */
  points: LonLat[];
  props: Record<string, unknown>;
}

function toLonLat(c: unknown): LonLat | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const x = Number(c[0]), y = Number(c[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return looksLikeItm([x, y]) ? itmToWgs84(x, y) : [x, y];
}

function ring(r: unknown): LonLat[] {
  if (!Array.isArray(r)) return [];
  const out: LonLat[] = [];
  for (const c of r) {
    const p = toLonLat(c);
    if (p) out.push(p);
  }
  return out;
}

export function featureFromGeoJson(f: unknown): InputFeature | null {
  const g = (f as { geometry?: { type?: string; coordinates?: unknown } })?.geometry;
  if (!g || !g.type) return null;
  const props = ((f as { properties?: Record<string, unknown> }).properties ?? {}) as Record<string, unknown>;
  const out: InputFeature = { rings: [], points: [], props };
  const c = g.coordinates as unknown[];
  if (g.type === 'Polygon' && Array.isArray(c)) out.rings.push(ring(c[0]));
  else if (g.type === 'MultiPolygon' && Array.isArray(c)) for (const poly of c) out.rings.push(ring((poly as unknown[])?.[0]));
  else if (g.type === 'Point') {
    const p = toLonLat(c);
    if (p) out.points.push(p);
  } else if (g.type === 'MultiPoint' && Array.isArray(c)) for (const q of c) {
    const p = toLonLat(q);
    if (p) out.points.push(p);
  }
  else return null;
  out.rings = out.rings.filter((r) => r.length >= 3);
  return out.rings.length || out.points.length ? out : null;
}

export async function readFeatures(file: string, onFeature: (f: InputFeature) => void): Promise<{ read: number; kept: number }> {
  let read = 0, kept = 0;
  const seq = /\.(geojsonl|geojsonseq|jsonl|ndjson)$/i.test(file);
  if (!seq) {
    const fc = JSON.parse(fs.readFileSync(file, 'utf8')) as { features?: unknown[] };
    for (const f of fc.features ?? []) {
      read++;
      const x = featureFromGeoJson(f);
      if (x) {
        kept++;
        onFeature(x);
      }
    }
    return { read, kept };
  }
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  await new Promise<void>((resolve, reject) => {
    rl.on('line', (raw) => {
      const line = raw.replace(/^\x1e/, '').trim();
      if (!line) return;
      read++;
      try {
        const x = featureFromGeoJson(JSON.parse(line));
        if (x) {
          kept++;
          onFeature(x);
        }
      } catch (e) {
        rl.close();
        reject(e);
      }
    });
    rl.on('close', () => resolve());
  });
  return { read, kept };
}
