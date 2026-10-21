/**
 * city-inventory/doc.ts — the exact Firestore shape of
 * `city_inventory/{authorityId}` and `.../runs/{runId}`, and the reader
 * that turns a stored doc back into the domain model. Pure — no firebase
 * imports; the server-timestamp sentinel is injected by the caller.
 *
 * Builder rules:
 *   - every field is written explicitly; "not measured" is `null`, never an
 *     absent key (axioms §33: `== null` never matches a missing field) and
 *     never `undefined` (axioms §24);
 *   - all 17 layers are always written, so a reader can tell "unmeasured"
 *     from "this layer didn't exist when the doc was written" by version;
 *   - a create needs a non-empty authorityId and city (axioms §23 spirit —
 *     the caller resolves the authority doc before building).
 * Reader rules: every field is guarded; dates go through `toDateOrNull`
 * (Firestore returns Timestamps, axioms §31).
 */
import { toDateOrNull } from './dates';
import {
  CITY_INVENTORY_COLLECTION,
  CITY_INVENTORY_RUNS_SUBCOLLECTION,
  CITY_INVENTORY_SCHEMA_VERSION,
  INVENTORY_LAYER_KEYS,
  type AuthorityType,
  type CityInventory,
  type CityInventoryRun,
  type InventoryLayer,
  type InventoryLayerKey,
  type InventorySnapshot,
  type LayerFile,
  type LayerMethod,
  type LayerSource,
  type QualityFlag,
  type Readiness,
  type ReadinessLevel,
} from './types';

export type CityInventoryInput = Omit<CityInventory, 'updatedAt' | 'schemaVersion'>;
type Raw = Record<string, unknown>;

const AUTHORITY_TYPES: readonly AuthorityType[] = ['city', 'local_council', 'regional_council'];
const QUALITY_FLAGS: readonly QualityFlag[] = [
  'below_expected_density',
  'single_source',
  'stale_source',
  'untagged_majority',
  'license_pending',
];
const METHODS: readonly LayerMethod[] = [
  'osm_count',
  'osm_tag_coverage',
  'osm_density_vs_peers',
  'technion_si_daily',
  'canopy_estimate',
  'lamp_proximity_merge',
];
const LEVELS: readonly ReadinessLevel[] = ['red', 'yellow', 'green'];

export function cityInventoryDocPath(authorityId: string): string {
  return `${CITY_INVENTORY_COLLECTION}/${authorityId}`;
}

export function cityInventoryRunDocPath(authorityId: string, runId: string): string {
  return `${CITY_INVENTORY_COLLECTION}/${authorityId}/${CITY_INVENTORY_RUNS_SUBCOLLECTION}/${runId}`;
}

export function emptyLayer(): InventoryLayer {
  return {
    count: null,
    lengthKm: null,
    areaKm2: null,
    density: null,
    coveragePct: null,
    method: null,
    sources: [],
    quality: [],
    files: [],
    lastRefreshAt: null,
  };
}

/** Every layer key present; missing ones become unmeasured. */
export function completeLayers(partial: Partial<Record<InventoryLayerKey, InventoryLayer>>): Record<InventoryLayerKey, InventoryLayer> {
  const out = {} as Record<InventoryLayerKey, InventoryLayer>;
  for (const k of INVENTORY_LAYER_KEYS) out[k] = partial[k] ?? emptyLayer();
  return out;
}

// ── builder ──────────────────────────────────────────────────────────────

const numOrNull = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function assertIdentity(authorityId: string, city: string, runId: string): void {
  if (!authorityId?.trim()) throw new Error('city_inventory: authorityId is required');
  if (authorityId.includes('/')) throw new Error('city_inventory: authorityId must not contain "/"');
  if (!city?.trim()) throw new Error('city_inventory: city is required');
  if (!runId?.trim()) throw new Error('city_inventory: snapshot.runId is required');
  if (runId.includes('/')) throw new Error('city_inventory: runId must not contain "/"');
}

function sourceToDoc(s: LayerSource): Raw {
  return {
    key: String(s.key),
    license: String(s.license ?? ''),
    attribution: String(s.attribution ?? ''),
    snapshotDate: String(s.snapshotDate ?? ''),
    count: numOrNull(s.count) ?? 0,
  };
}

function layerToDoc(l: InventoryLayer, withFiles: boolean): Raw {
  const doc: Raw = {
    count: numOrNull(l.count),
    lengthKm: numOrNull(l.lengthKm),
    areaKm2: numOrNull(l.areaKm2),
    density: numOrNull(l.density),
    coveragePct: numOrNull(l.coveragePct),
    method: l.method ?? null,
    sources: (l.sources ?? []).map(sourceToDoc),
    quality: [...(l.quality ?? [])],
    lastRefreshAt: l.lastRefreshAt ?? null,
  };
  if (withFiles) doc.files = (l.files ?? []).map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 }));
  return doc;
}

function layersToDoc(layers: Partial<Record<InventoryLayerKey, InventoryLayer>>, withFiles: boolean): Raw {
  const full = completeLayers(layers);
  const out: Raw = {};
  for (const k of INVENTORY_LAYER_KEYS) out[k] = layerToDoc(full[k], withFiles);
  return out;
}

function snapshotToDoc(s: InventorySnapshot): Raw {
  return { osmPbfDate: s.osmPbfDate, builtAt: s.builtAt, builtBy: s.builtBy, runId: s.runId };
}

function readinessToDoc(r: Readiness): Raw {
  return { score: r.score, level: r.level, missing: [...r.missing], blockers: [...r.blockers] };
}

/** `city_inventory/{authorityId}` payload. `serverTimestamp` = `FieldValue.serverTimestamp()`. */
export function buildCityInventoryDoc(inv: CityInventoryInput, serverTimestamp: unknown): Raw {
  assertIdentity(inv.authorityId, inv.city, inv.snapshot?.runId);
  return {
    authorityId: inv.authorityId,
    city: inv.city,
    authorityType: inv.authorityType,
    areaKm2: numOrNull(inv.areaKm2),
    snapshot: snapshotToDoc(inv.snapshot),
    layers: layersToDoc(inv.layers, true),
    readiness: readinessToDoc(inv.readiness),
    schemaVersion: CITY_INVENTORY_SCHEMA_VERSION,
    updatedAt: serverTimestamp,
  };
}

/** `city_inventory/{authorityId}/runs/{runId}` payload — same layers, no files. */
export function buildCityInventoryRunDoc(inv: CityInventoryInput, serverTimestamp: unknown): Raw {
  assertIdentity(inv.authorityId, inv.city, inv.snapshot?.runId);
  return {
    authorityId: inv.authorityId,
    runId: inv.snapshot.runId,
    snapshot: snapshotToDoc(inv.snapshot),
    layers: layersToDoc(inv.layers, false),
    readiness: readinessToDoc(inv.readiness),
    schemaVersion: CITY_INVENTORY_SCHEMA_VERSION,
    createdAt: serverTimestamp,
  };
}

// ── reader ───────────────────────────────────────────────────────────────

const asObj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

function readSource(v: unknown): LayerSource | null {
  const o = asObj(v);
  const key = asStr(o.key);
  if (!key) return null;
  return {
    key,
    license: asStr(o.license),
    attribution: asStr(o.attribution),
    snapshotDate: asStr(o.snapshotDate),
    count: asNum(o.count) ?? 0,
  };
}

function readFile(v: unknown): LayerFile | null {
  const o = asObj(v);
  const path = asStr(o.path);
  if (!path) return null;
  return { path, bytes: asNum(o.bytes) ?? 0, sha256: asStr(o.sha256) };
}

function readLayer(v: unknown): InventoryLayer {
  const o = asObj(v);
  return {
    count: asNum(o.count),
    lengthKm: asNum(o.lengthKm),
    areaKm2: asNum(o.areaKm2),
    density: asNum(o.density),
    coveragePct: asNum(o.coveragePct),
    method: oneOf(o.method, METHODS),
    sources: asArr(o.sources).map(readSource).filter((s): s is LayerSource => s !== null),
    quality: asArr(o.quality).map((q) => oneOf(q, QUALITY_FLAGS)).filter((q): q is QualityFlag => q !== null),
    files: asArr(o.files).map(readFile).filter((f): f is LayerFile => f !== null),
    lastRefreshAt: toDateOrNull(o.lastRefreshAt),
  };
}

function readLayers(v: unknown): Record<InventoryLayerKey, InventoryLayer> {
  const o = asObj(v);
  const out = {} as Record<InventoryLayerKey, InventoryLayer>;
  for (const k of INVENTORY_LAYER_KEYS) out[k] = k in o ? readLayer(o[k]) : emptyLayer();
  return out;
}

function readSnapshot(v: unknown): InventorySnapshot {
  const o = asObj(v);
  return {
    osmPbfDate: asStr(o.osmPbfDate),
    // builtAt is required on write; an unreadable value falls back to epoch so
    // the card shows an obviously-wrong date instead of crashing.
    builtAt: toDateOrNull(o.builtAt) ?? new Date(0),
    builtBy: asStr(o.builtBy),
    runId: asStr(o.runId),
  };
}

function readReadiness(v: unknown): Readiness {
  const o = asObj(v);
  return {
    score: asNum(o.score) ?? 0,
    level: oneOf(o.level, LEVELS) ?? 'red',
    missing: asArr(o.missing).map((k) => oneOf(k, INVENTORY_LAYER_KEYS)).filter((k): k is InventoryLayerKey => k !== null),
    blockers: asArr(o.blockers).filter((b): b is string => typeof b === 'string'),
  };
}

/** Stored doc ⇒ domain model; `null` when the doc is missing or has no identity. */
export function readCityInventoryDoc(docId: string, raw: unknown): CityInventory | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Raw;
  const authorityId = asStr(o.authorityId) || docId;
  if (!authorityId) return null;
  return {
    authorityId,
    city: asStr(o.city),
    authorityType: oneOf(o.authorityType, AUTHORITY_TYPES) ?? 'city',
    areaKm2: asNum(o.areaKm2),
    snapshot: readSnapshot(o.snapshot),
    layers: readLayers(o.layers),
    readiness: readReadiness(o.readiness),
    schemaVersion: asNum(o.schemaVersion) ?? 0,
    updatedAt: toDateOrNull(o.updatedAt),
  };
}

export function readCityInventoryRunDoc(docId: string, raw: unknown): CityInventoryRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Raw;
  const layers = readLayers(o.layers);
  const noFiles = {} as CityInventoryRun['layers'];
  for (const k of INVENTORY_LAYER_KEYS) {
    const { files: _files, ...rest } = layers[k];
    noFiles[k] = rest;
  }
  return {
    authorityId: asStr(o.authorityId),
    runId: asStr(o.runId) || docId,
    snapshot: readSnapshot(o.snapshot),
    layers: noFiles,
    readiness: readReadiness(o.readiness),
    schemaVersion: asNum(o.schemaVersion) ?? 0,
    createdAt: toDateOrNull(o.createdAt),
  };
}
