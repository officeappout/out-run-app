/**
 * Explainer 7's map window (owner 28.10, Y7): the real progress map is long, so the box scrolls to
 * the user's level. Pure (tested).
 */
import type { TreePathLayoutEntry } from '@/features/progression-map/services/tree-path-layout';

export const TREE_WINDOW_PX = 340;

/** The rung the user stands on: their level, else the nearest rung below it (gaps have no node). */
export function currentRungLevel(rungLevels: readonly number[], level: number): number | null {
  const below = rungLevels.filter((l) => l <= level);
  if (below.length) return Math.max(...below);
  return rungLevels.length ? Math.min(...rungLevels) : null;
}

/** scrollTop that centres the user's node in the window (clamped to the top). */
export function treeScrollTop(entries: readonly TreePathLayoutEntry[], level: number, windowPx = TREE_WINDOW_PX): number {
  const hit = entries.find((e) => e.segment.type === 'node' && e.segment.rung.level === level);
  return hit ? Math.max(0, Math.round(hit.y - windowPx / 2)) : 0;
}
