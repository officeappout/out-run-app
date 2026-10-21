/**
 * scripts/shade/fetch-technion-shade.ts
 *
 * Downloads the Technion (Aleksandrowicz lab) public street summer-Shade-Index
 * layers and writes, to a LOCAL directory only (no Firestore, no Storage):
 *   <out>/raw/<city>/page-NNN.geojson      — untouched ArcGIS pages (WGS84)
 *   <out>/normalized/<city>.geojson        — LineString per street segment
 *   <out>/manifest.json                    — cities, layer URLs, counts,
 *                                            field mapping, attribution,
 *                                            permission note
 *
 * Polite: one city at a time, one request in flight, ≥600 ms between
 * requests (< 2 req/s). Public layers only — a layer that answers with a
 * token/permission error is recorded as `blocked` and skipped.
 *
 * Usage:
 *   npx tsx scripts/shade/fetch-technion-shade.ts --out <dir> [--city petah-tikva,eilat] [--page 1000]
 *   npx tsx scripts/shade/fetch-technion-shade.ts --out <dir> --from-raw   # re-normalize existing raw pages, no network
 *
 * Re-runnable: overwrites the files of the cities it fetches; other cities'
 * files in <out> are left alone, and the manifest merges with an existing one.
 *
 * See docs/routes/TECHNION-SHADE-IMPORT.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeLayer,
  TECHNION_ATTRIBUTION,
  TECHNION_PERMISSION,
  TECHNION_SHADE_LAYERS,
  TECHNION_SOURCE,
  type RawFeatureCollection,
  type TechnionLayer,
} from '../../src/lib/shade';

const MIN_GAP_MS = 600;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let lastRequestAt = 0;
async function politeGetJson(url: string): Promise<unknown> {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'OUT-shade-import/1.0 (office@appout.co.il)' } });
      if (res.status === 401 || res.status === 403) return { error: { code: res.status, message: `HTTP ${res.status}` } };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

function isTokenError(j: unknown): string | null {
  const err = (j as { error?: { code?: number; message?: string } })?.error;
  if (!err) return null;
  return `${err.code ?? '?'} ${err.message ?? ''}`.trim();
}

export interface ManifestCity {
  city: string;
  cityHe: string;
  code: string;
  layerUrl: string;
  webMapId: string;
  dataYear?: number;
  status: 'ok' | 'blocked' | 'error';
  error?: string;
  sourceCount?: number;
  fetchedCount?: number;
  segmentCount?: number;
  skippedNoGeometry?: number;
  skippedBadIndex?: number;
  shadeIndexStats?: { min: number; max: number; mean: number; lengthWeightedNote: string };
  fieldMapping: TechnionLayer['mapping'];
  rawBytes?: number;
  normalizedBytes?: number;
  normalizedFile?: string;
  fetchedAt?: string;
}

function readRawPages(rawDir: string): RawFeatureCollection & { bytes: number } {
  const all: RawFeatureCollection & { bytes: number } = { type: 'FeatureCollection', features: [], bytes: 0 };
  for (const f of fs.readdirSync(rawDir).filter((n) => /^page-\d+\.geojson$/.test(n)).sort()) {
    const body = fs.readFileSync(path.join(rawDir, f), 'utf8');
    all.bytes += Buffer.byteLength(body);
    const j = JSON.parse(body) as RawFeatureCollection;
    all.features.push(...(Array.isArray(j.features) ? j.features : []));
  }
  return all;
}

async function fetchCity(layer: TechnionLayer, outDir: string, pageSize: number, fromRaw: ManifestCity | null): Promise<ManifestCity> {
  const base: ManifestCity = {
    city: layer.city,
    cityHe: layer.cityHe,
    code: layer.code,
    layerUrl: layer.url,
    webMapId: layer.webMapId,
    dataYear: layer.dataYear,
    status: 'ok',
    fieldMapping: layer.mapping,
  };
  if (fromRaw) {
    const rawDir = path.join(outDir, 'raw', layer.city);
    if (!fs.existsSync(rawDir)) return { ...base, status: 'error', error: 'no raw pages on disk' };
    const raw = readRawPages(rawDir);
    const fetchedAt = fromRaw.fetchedAt ?? new Date().toISOString();
    return finish(layer, outDir, base, raw, raw.bytes, fromRaw.sourceCount ?? raw.features.length, fetchedAt);
  }
  const meta = await politeGetJson(`${layer.url}?f=json`);
  const metaErr = isTokenError(meta);
  if (metaErr) return { ...base, status: 'blocked', error: metaErr };
  const countJ = await politeGetJson(`${layer.url}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const countErr = isTokenError(countJ);
  if (countErr) return { ...base, status: 'blocked', error: countErr };
  const sourceCount = (countJ as { count?: number }).count ?? 0;
  const oidField = (meta as { objectIdField?: string }).objectIdField ?? layer.mapping.idField ?? 'FID';

  const rawDir = path.join(outDir, 'raw', layer.city);
  fs.rmSync(rawDir, { recursive: true, force: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const all: RawFeatureCollection = { type: 'FeatureCollection', features: [] };
  let rawBytes = 0;
  for (let offset = 0, page = 0; ; page++) {
    const q = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      outSR: '4326',
      orderByFields: oidField,
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: 'geojson',
    });
    const j = (await politeGetJson(`${layer.url}/query?${q}`)) as RawFeatureCollection & {
      properties?: { exceededTransferLimit?: boolean };
      exceededTransferLimit?: boolean;
    };
    const err = isTokenError(j);
    if (err) return { ...base, status: page === 0 ? 'blocked' : 'error', error: err };
    const body = JSON.stringify(j);
    rawBytes += Buffer.byteLength(body);
    fs.writeFileSync(path.join(rawDir, `page-${String(page).padStart(3, '0')}.geojson`), body);
    const n = j.features?.length ?? 0;
    all.features.push(...(j.features ?? []));
    process.stdout.write(`  ${layer.city}: ${all.features.length}/${sourceCount}\r`);
    const more = j.properties?.exceededTransferLimit || j.exceededTransferLimit || n === pageSize;
    if (!n || !more) break;
    offset += n;
  }
  process.stdout.write('\n');
  return finish(layer, outDir, base, all, rawBytes, sourceCount, fetchedAt);
}

function finish(
  layer: TechnionLayer,
  outDir: string,
  base: ManifestCity,
  all: RawFeatureCollection,
  rawBytes: number,
  sourceCount: number,
  fetchedAt: string,
): ManifestCity {
  const { collection, stats } = normalizeLayer(all, {
    city: layer.city,
    sourceLayer: layer.url,
    fetchedAt,
    mapping: layer.mapping,
  });
  const normDir = path.join(outDir, 'normalized');
  fs.mkdirSync(normDir, { recursive: true });
  const normFile = path.join(normDir, `${layer.city}.geojson`);
  const normBody = JSON.stringify(collection);
  fs.writeFileSync(normFile, normBody);

  const vals = collection.features.map((f) => f.properties.shadeIndex);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return {
    ...base,
    sourceCount,
    fetchedCount: all.features.length,
    segmentCount: stats.output,
    skippedNoGeometry: stats.skippedNoGeometry,
    skippedBadIndex: stats.skippedBadIndex,
    shadeIndexStats: vals.length
      ? {
          min: Math.min(...vals),
          max: Math.max(...vals),
          mean: Math.round(mean * 1000) / 1000,
          lengthWeightedNote: 'unweighted mean over segments',
        }
      : undefined,
    status: all.features.length === sourceCount ? 'ok' : 'error',
    error: all.features.length === sourceCount ? undefined : `fetched ${all.features.length} of ${sourceCount}`,
    rawBytes,
    normalizedBytes: Buffer.byteLength(normBody),
    normalizedFile: path.relative(outDir, normFile),
    fetchedAt,
  };
}

async function main() {
  const out = arg('out');
  if (!out) {
    console.error('usage: npx tsx scripts/shade/fetch-technion-shade.ts --out <dir> [--city a,b] [--page 1000]');
    process.exit(1);
  }
  const outDir = path.resolve(out);
  fs.mkdirSync(outDir, { recursive: true });
  const only = arg('city')?.split(',').map((s) => s.trim());
  const pageSize = Number(arg('page') ?? 1000);
  const fromRaw = process.argv.includes('--from-raw');
  const layers = TECHNION_SHADE_LAYERS.filter((l) => !only || only.includes(l.city));

  const manifestPath = path.join(outDir, 'manifest.json');
  const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const byCity = new Map<string, ManifestCity>((prev?.cities ?? []).map((c: ManifestCity) => [c.city, c]));

  for (const layer of layers) {
    console.log(`→ ${layer.city} (${layer.code}) ${layer.url}`);
    try {
      const r = await fetchCity(layer, outDir, pageSize, fromRaw ? (byCity.get(layer.city) ?? ({} as ManifestCity)) : null);
      byCity.set(layer.city, r);
      console.log(`  ${r.status}: ${r.segmentCount ?? 0} segments${r.error ? ` — ${r.error}` : ''}`);
    } catch (e) {
      byCity.set(layer.city, {
        city: layer.city,
        cityHe: layer.cityHe,
        code: layer.code,
        layerUrl: layer.url,
        webMapId: layer.webMapId,
        status: 'error',
        error: String((e as Error)?.message ?? e),
        fieldMapping: layer.mapping,
      });
      console.log(`  error: ${(e as Error)?.message}`);
    }
  }

  const cities = TECHNION_SHADE_LAYERS.map((l) => byCity.get(l.city)).filter(Boolean) as ManifestCity[];
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: TECHNION_SOURCE,
    attribution: TECHNION_ATTRIBUTION,
    permission: TECHNION_PERMISSION,
    sourceHomepage: 'https://oraleks.net.technion.ac.il/en/shade-maps/',
    arcgisOwner: 'oraleks@technion.ac.il_Technion_GIS',
    indexType: 'SI_daily',
    indexDefinition:
      'Summer Shade Index (0..1): share of daily summer solar radiation blocked before reaching the ground, averaged over the street-segment polygon (buildings + trees). NOT the Derech Tzel SAI (hourly 08-17 sidewalk-shade checks).',
    geometryNote:
      'Source geometry is one POLYGON per street segment; normalized output is its principal axis as a 2-point LineString (WGS84). widthM = polygon extent across the axis.',
    outputProperties: ['shadeIndex', 'indexType', 'city', 'sourceLayer', 'sourceFeatureId', 'fetchedAt', 'tcc?', 'siNoTrees?', 'widthM'],
    totals: {
      cities: cities.filter((c) => c.status === 'ok').length,
      segments: cities.reduce((s, c) => s + (c.segmentCount ?? 0), 0),
      rawBytes: cities.reduce((s, c) => s + (c.rawBytes ?? 0), 0),
      normalizedBytes: cities.reduce((s, c) => s + (c.normalizedBytes ?? 0), 0),
    },
    cities,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest → ${manifestPath}`);
  console.log(JSON.stringify(manifest.totals));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
