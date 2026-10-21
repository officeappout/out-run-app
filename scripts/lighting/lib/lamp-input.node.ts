/**
 * Lamp-post points from a local file (GeoJSON / GeoJSONSeq / zipped
 * shapefile) or an ArcGIS REST layer (paged query, saved page by page into a
 * raw dir first so a run can be repeated offline with --from-raw). ITM is
 * detected and converted. Downloaded data is untrusted — parsed, never run.
 * READ-ONLY w.r.t. every backend.
 */
import * as fs from 'fs';
import * as path from 'path';
import { arcgisQueryUrl, readShapefileZip } from '../../../src/lib/dataset-import/read-shapefile';
import type { LonLat } from '../../../src/lib/shade/types';
import { featureFromGeoJson, readFeatures } from '../../shade-hourly/lib/geojson-input.node';

export async function readLampFile(file: string): Promise<LonLat[]> {
  const out: LonLat[] = [];
  if (/\.zip$/i.test(file)) {
    const gj = (await readShapefileZip(fs.readFileSync(file))) as { features?: unknown[] } | Array<{ features?: unknown[] }>;
    const fcs = Array.isArray(gj) ? gj : [gj];
    for (const fc of fcs) for (const f of fc.features ?? []) featureFromGeoJson(f)?.points.forEach((p) => out.push(p));
    return out;
  }
  await readFeatures(file, (f) => f.points.forEach((p) => out.push(p)));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch an ArcGIS layer page by page into `rawDir/page-NNN.geojson`
 * (≤ 1 request / second). `bbox` (WGS84) limits the query — use it for samples.
 */
export async function fetchArcgisLamps(layerUrl: string, rawDir: string, opts: { bbox?: number[]; pageSize?: number; maxPages?: number; orderBy?: string } = {}): Promise<number> {
  fs.mkdirSync(rawDir, { recursive: true });
  const pageSize = opts.pageSize ?? 1000;
  const maxPages = opts.maxPages ?? 200;
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(arcgisQueryUrl(layerUrl, page * pageSize, pageSize));
    if (opts.orderBy) u.searchParams.set('orderByFields', opts.orderBy);
    if (opts.bbox) {
      u.searchParams.set('geometry', opts.bbox.join(','));
      u.searchParams.set('geometryType', 'esriGeometryEnvelope');
      u.searchParams.set('inSR', '4326');
      u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    }
    const res = await fetch(u.toString(), { headers: { 'User-Agent': 'OUT-lighting-import/1.0' } });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status} on page ${page}`);
    const body = (await res.json()) as { features?: unknown[]; error?: unknown };
    if (body.error) throw new Error(`ArcGIS error on page ${page}: ${JSON.stringify(body.error)}`);
    const n = body.features?.length ?? 0;
    fs.writeFileSync(path.join(rawDir, `page-${String(page).padStart(3, '0')}.geojson`), JSON.stringify(body));
    total += n;
    if (n < pageSize) break;
    await sleep(1000);
  }
  return total;
}

export async function readRawPages(rawDir: string): Promise<LonLat[]> {
  const out: LonLat[] = [];
  for (const f of fs.readdirSync(rawDir).filter((x) => /^page-\d+\.geojson$/.test(x)).sort()) {
    for (const p of await readLampFile(path.join(rawDir, f))) out.push(p);
  }
  return out;
}
