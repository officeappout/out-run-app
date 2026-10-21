/**
 * city-inventory/quality.ts — per-layer quality flags (plan §3.2). Pure.
 */
import { isBelowExpectedDensity, isUntaggedMajority } from './coverage';
import type { LayerMethod, LayerSource, QualityFlag } from './types';

/** OSM refreshes monthly (plan §4.3); two missed refreshes ⇒ stale. */
export const OSM_STALE_AFTER_DAYS = 62;
/** Government / municipal datasets update rarely; > ~13 months ⇒ stale. */
export const DATASET_STALE_AFTER_DAYS = 400;

const DAY_MS = 86_400_000;
const TAG_COVERAGE_METHODS = new Set<LayerMethod>(['osm_tag_coverage', 'lamp_proximity_merge']);

export function staleAfterDays(sourceKey: string): number {
  return sourceKey === 'osm' ? OSM_STALE_AFTER_DAYS : DATASET_STALE_AFTER_DAYS;
}

/** `true` when the snapshot date is missing, unparseable, or older than the limit. */
export function isStaleSource(src: Pick<LayerSource, 'key' | 'snapshotDate'>, now: Date): boolean {
  const t = Date.parse(src.snapshotDate ?? '');
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > staleAfterDays(src.key) * DAY_MS;
}

export interface QualityInput {
  method: LayerMethod | null;
  coveragePct: number | null;
  sources: readonly LayerSource[];
  /** Point layers only. */
  density?: number | null;
  peerMedianDensity?: number | null;
  /** Source keys whose licence still waits for written approval. */
  licensePendingKeys?: ReadonlySet<string>;
  now: Date;
}

export function qualityFlags(q: QualityInput): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (isBelowExpectedDensity(q.density ?? null, q.peerMedianDensity ?? null) === true) flags.push('below_expected_density');
  if (q.sources.length === 1) flags.push('single_source');
  if (q.sources.some((s) => isStaleSource(s, q.now))) flags.push('stale_source');
  if (q.method && TAG_COVERAGE_METHODS.has(q.method) && isUntaggedMajority(q.coveragePct)) flags.push('untagged_majority');
  if (q.licensePendingKeys && q.sources.some((s) => q.licensePendingKeys!.has(s.key))) flags.push('license_pending');
  return flags;
}
