/**
 * city-inventory/report.ts — the readable per-layer table of a dry run
 * (plan §4.1 step 7): count, coverage %, source, licence, gaps; then the
 * readiness level/score and its blockers. Pure; markdown so it pastes into
 * a PR body as-is.
 */
import type { CityInventoryInput } from './doc';
import { isLayerMeasured } from './readiness';
import type { InventoryExtras } from './run';
import { INVENTORY_LAYER_KEYS, POINT_LAYER_KEYS, type InventoryLayer, type InventoryLayerKey, type QualityFlag } from './types';

const FLAG_TEXT: Record<QualityFlag, string> = {
  below_expected_density: 'below 25% of peer density',
  single_source: 'single source',
  stale_source: 'stale source',
  untagged_majority: 'tagged on < 50%',
  license_pending: 'licence pending (written)',
};

const POINT_SET = new Set<InventoryLayerKey>(POINT_LAYER_KEYS);
const dash = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

/** Short, human gap list for one layer. `single_source` is omitted (true of every OSM-only layer in I1). */
export function layerGaps(key: InventoryLayerKey, l: InventoryLayer, extras?: Pick<InventoryExtras, 'peerMedians'>): string[] {
  if (!isLayerMeasured(l)) return [key === 'shade' ? 'not measured (no Technion layer; canopy estimate is I4)' : 'not measured'];
  const gaps: string[] = [];
  if (l.count === 0) gaps.push('none in OSM');
  for (const f of l.quality) if (f !== 'single_source') gaps.push(FLAG_TEXT[f]);
  if (POINT_SET.has(key) && l.coveragePct === null && extras && extras.peerMedians[key as (typeof POINT_LAYER_KEYS)[number]] === null) {
    gaps.push('no peer median yet (< 3 peer cities)');
  }
  if (key === 'parks' && l.coveragePct === null) gaps.push('coverage needs a municipal park layer');
  return gaps;
}

function sourceText(l: InventoryLayer): string {
  if (!l.sources.length) return '—';
  return l.sources.map((s) => `${s.key} (${s.license}, ${s.snapshotDate || 'no date'})`).join('; ');
}

export function formatLayerTable(inv: CityInventoryInput, extras?: InventoryExtras): string {
  const rows = INVENTORY_LAYER_KEYS.map((k) => {
    const l = inv.layers[k];
    return `| ${k} | ${dash(l.count)} | ${dash(l.lengthKm)} | ${dash(l.areaKm2)} | ${dash(l.density)} | ${dash(l.coveragePct, '%')} | ${l.method ?? '—'} | ${sourceText(l)} | ${layerGaps(k, l, extras).join('; ') || '—'} |`;
  });
  return [
    '| layer | count | km | km² | per street-km | coverage | method | source (licence, date) | gaps |',
    '|---|---:|---:|---:|---:|---:|---|---|---|',
    ...rows,
  ].join('\n');
}

export function formatReadiness(inv: CityInventoryInput): string {
  const r = inv.readiness;
  const lines = [`**Readiness: ${r.level.toUpperCase()} · score ${r.score}/100**`];
  if (r.blockers.length) lines.push(...r.blockers.map((b) => `- ${b}`));
  return lines.join('\n');
}

export function formatCityReport(inv: CityInventoryInput, extras: InventoryExtras, approvedRoutes: number): string {
  const shade = extras.shade ? ` · shade mean SI ${dash(extras.shade.meanSI)}, shaded ${dash(extras.shade.shadedPctOfMatched, '%')} of matched` : '';
  return [
    `### ${inv.city} (\`${inv.authorityId}\`, ${inv.authorityType})`,
    `Area ${dash(inv.areaKm2)} km² · streets ${extras.streetKm} km · walkable ${extras.walkableKm} km · approved routes ${approvedRoutes} · OSM ${inv.snapshot.osmPbfDate}${shade}` +
      (extras.peerIds.length ? ` · density peers: ${extras.peerIds.length}` : ''),
    '',
    formatLayerTable(inv, extras),
    '',
    formatReadiness(inv),
  ].join('\n');
}
