/**
 * city-inventory/coverage.ts — coverage % per layer
 * (docs/routes/CITY-MAPPING-PLAN.md §3.4). Pure.
 *
 * There is no outside "truth" for how many benches a city has, so coverage
 * is relative and transparent:
 *   - tag layers (lighting, shade, surface, crossings): tagged ÷ all;
 *   - point layers (benches, water, toilets): density per km of street,
 *     compared with the median of peer cities;
 *   - parks: OSM park area ÷ a municipal reference area, when one exists.
 *
 * `null` always means "not measured" — never "zero". A zero denominator is
 * not measurable, so it yields `null`, not 0 % (axioms §25 "the 0 that isn't 0").
 */

/** A point layer below this share of the peer median is flagged `below_expected_density`. */
export const BELOW_EXPECTED_DENSITY_RATIO = 0.25;
/** A tag layer below this coverage % is flagged `untagged_majority`. */
export const UNTAGGED_MAJORITY_PCT = 50;

const round1 = (n: number) => Math.round(n * 10) / 10;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** part ÷ total as 0..100 (1 decimal); `null` when total is 0/invalid. */
export function pct(part: number, total: number): number | null {
  if (!finite(part) || !finite(total) || total <= 0) return null;
  return round1(Math.min(100, Math.max(0, (part / total) * 100)));
}

export interface LengthItem {
  lengthM: number;
  covered: boolean;
}

/** Length-weighted coverage (lighting, shade, surface). */
export function lengthCoveragePct(items: readonly LengthItem[]): number | null {
  let total = 0;
  let covered = 0;
  for (const it of items) {
    if (!finite(it.lengthM) || it.lengthM <= 0) continue;
    total += it.lengthM;
    if (it.covered) covered += it.lengthM;
  }
  return pct(covered, total);
}

/** Count-based coverage (crossings with a specific `crossing=*`). */
export function countCoveragePct(flags: readonly boolean[]): number | null {
  return pct(flags.filter(Boolean).length, flags.length);
}

/** Points per km of street. `null` when street length is unknown/0. */
export function densityPerKm(count: number, streetKm: number): number | null {
  if (!finite(count) || !finite(streetKm) || streetKm <= 0 || count < 0) return null;
  return Math.round((count / streetKm) * 1000) / 1000;
}

/** Median of the finite values; `null` for none. */
export function median(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Point-layer coverage = density as % of the peer median (capped at 100).
 * `null` when either side is unknown.
 */
export function densityCoveragePct(density: number | null, peerMedian: number | null): number | null {
  if (density === null || peerMedian === null) return null;
  return pct(density, peerMedian);
}

/** `true`/`false` only when measurable; `null` when there is nothing to compare. */
export function isBelowExpectedDensity(density: number | null, peerMedian: number | null): boolean | null {
  if (density === null || peerMedian === null || !finite(peerMedian) || peerMedian <= 0) return null;
  return density < peerMedian * BELOW_EXPECTED_DENSITY_RATIO;
}

/** OSM park area ÷ municipal reference park area. `null` without a reference. */
export function parkAreaCoveragePct(osmParkKm2: number, referenceParkKm2: number | null): number | null {
  if (referenceParkKm2 === null) return null;
  return pct(osmParkKm2, referenceParkKm2);
}

export function isUntaggedMajority(coveragePct: number | null): boolean {
  return coveragePct !== null && coveragePct < UNTAGGED_MAJORITY_PCT;
}
