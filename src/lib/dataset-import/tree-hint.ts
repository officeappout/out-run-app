/**
 * Shade HINT from a dataset's "trees along the path" attribute (RC9, owner
 * 22.10.2026) — used only where the Technion shade layer is missing
 * (routeScore v1.3 comfort, half coverage). Values are SI-equivalents on the
 * Technion Shade Index scale (0.10 → 0 points, 0.35 → full): trees on both
 * sides ≈ a well-shaded street, one side ≈ partial, none ≈ open. Pure.
 */
import { pathLengthM } from '../route-quality/geo';
import type { DatasetLine } from './types';

/** MoT bph_infra_exist `Trees` values → SI-equivalent; 'לא רלוונטי' / missing = no answer. */
export const TREE_SHADE_HINT: Record<string, number> = {
  'בשני צדדים': 0.3,
  'בצד אחד': 0.2,
  'אין': 0.05,
};
export const TREE_FIELD = 'Trees';
/** A hint is given only when at least this share of the length has a tree answer. */
export const TREE_HINT_MIN_KNOWN = 0.5;

/** Length-weighted SI-equivalent over the lines that answer; null when under half the length answers. */
export function treeShadeHint(lines: readonly DatasetLine[], field = TREE_FIELD): number | null {
  let known = 0, total = 0, sum = 0;
  for (const l of lines) {
    const len = pathLengthM(l.coords);
    total += len;
    const v = l.attrs?.[field];
    const si = v != null ? TREE_SHADE_HINT[v] : undefined;
    if (si == null) continue;
    known += len;
    sum += si * len;
  }
  if (!(total > 0) || known / total < TREE_HINT_MIN_KNOWN) return null;
  return Math.round((sum / known) * 1000) / 1000;
}
