/**
 * tree-path-layout.ts — pure geometry for the Skill Tree's winding path.
 *
 * Computes, from a list of display segments (build-skill-tree.service.ts's
 * groupRungsForDisplay output) and a couple of layout constants, the (x%,
 * y px) position of every node/gap-pill AND the SVG path `d` for a single
 * continuous curve running through all of them — a smooth, Catmull-Rom-
 * derived cubic-Bezier spline, not a straight line, per the founder's
 * "gentle slalom" brief.
 *
 * Pure + side-effect-free (no React, no DOM) so it's testable in isolation
 * under this repo's node-only vitest config, same convention as
 * build-skill-tree.service.ts.
 *
 * Coordinate system: x is a PERCENT of the container's width (0-100), y is
 * PX from the container's top. The two axes are intentionally on different
 * scales — TreePath.tsx renders the resulting path inside an SVG with
 * `viewBox="0 0 100 {totalHeight}"` and `preserveAspectRatio="none"`, which
 * maps x=0-100 onto the container's actual (responsive) width and y=0-
 * totalHeight 1:1 onto real pixels. This is what makes "30%/70% of the
 * width" stay correct at any viewport size without recomputing anything
 * here — same technique node positions use (`left: {x}%`).
 *
 * Row heights are FIXED constants (not content-driven) so a node's
 * position never depends on its own rendered height — deliberately, this
 * is what a previous absolute-positioning attempt got wrong (documented in
 * TreePath.tsx's own history): a "guessed" row height sized to one node's
 * content clipped/overlapped a taller neighboring node. Here there is
 * exactly one tunable constant per row type, and it must be tall enough
 * for the TALLEST node variant (a 'current' node: bigger photo + the
 * floating "אתה כאן" bubble above it + a swap pill below) so nothing ever
 * clips regardless of which node lands in which slot.
 */
import type { DisplaySegment } from '../core/types';

export interface TreePathLayoutConfig {
  /**
   * Height (px) reserved for one real node's row — the single spacing
   * constant the brief asks for: lower = denser = more levels fit on
   * screen. Must stay tall enough for the tallest node variant (see file
   * header) or a 'current'/'target' node's extra chrome could visually
   * bleed into a neighboring row.
   */
  rungRowHeight: number;
  /** Height (px) reserved for one collapsed gap-pill row — shorter than a node row; a pill has no photo/name/swap-pill chrome to clear. */
  gapRowHeight: number;
  /** Horizontal center (percent, 0-100) for a node on the path's "left" swing. */
  leftX: number;
  /** Horizontal center (percent, 0-100) for a node on the path's "right" swing. */
  rightX: number;
}

export const DEFAULT_TREE_PATH_LAYOUT_CONFIG: TreePathLayoutConfig = {
  rungRowHeight: 176,
  gapRowHeight: 64,
  leftX: 30,
  rightX: 70,
};

export interface TreePathLayoutEntry {
  segment: DisplaySegment;
  x: number;
  y: number;
}

export interface TreePathLayout {
  entries: TreePathLayoutEntry[];
  totalHeight: number;
  /** SVG `d` for one continuous curve through every entry's point (nodes AND gaps, so the curve stays unbroken through no-exercise regions and visually straddles the gap pill exactly like the old straight spine did). */
  pathD: string;
}

/**
 * Standard Catmull-Rom → cubic-Bezier conversion (uniform parametrization,
 * tension 0, the well-known "/6" construction) — the technique the brief
 * names ("Catmull-Rom through the node points"). Endpoints are clamped by
 * reusing the nearest real point rather than extrapolating past it, so the
 * curve doesn't overshoot before the first / after the last point.
 */
export function catmullRomToBezierPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Builds the full layout: one entry per display segment, in order, plus
 * the total container height and the curve path through every point.
 *
 * Alternation counts only real NODE segments — a gap doesn't flip which
 * side the next node lands on, and always sits dead-center (x=50), the
 * same relationship the old straight spine had with its gap pill (which
 * was horizontally centered directly on top of the spine).
 *
 * Generic over segment count — the position of every entry is computed
 * from a running cumulative height, so this works unchanged for any
 * program length (a 3-level ladder or a 30-level one).
 */
export function buildTreePathLayout(
  segments: DisplaySegment[],
  config: TreePathLayoutConfig = DEFAULT_TREE_PATH_LAYOUT_CONFIG,
): TreePathLayout {
  const entries: TreePathLayoutEntry[] = [];
  let y = 0;
  let nodeIndex = 0;

  for (const segment of segments) {
    if (segment.type === 'node') {
      const rowHeight = config.rungRowHeight;
      // First node swings right, matching the prior straight-spine layout's
      // starting side — a minor consistency touch, not load-bearing.
      const x = nodeIndex % 2 === 0 ? config.rightX : config.leftX;
      entries.push({ segment, x, y: y + rowHeight / 2 });
      y += rowHeight;
      nodeIndex += 1;
    } else {
      const rowHeight = config.gapRowHeight;
      entries.push({ segment, x: 50, y: y + rowHeight / 2 });
      y += rowHeight;
    }
  }

  const pathD = catmullRomToBezierPath(entries.map((e) => ({ x: e.x, y: e.y })));

  return { entries, totalHeight: y, pathD };
}
