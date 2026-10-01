import { describe, it, expect } from 'vitest';
import {
  buildTreePathLayout,
  catmullRomToBezierPath,
  DEFAULT_TREE_PATH_LAYOUT_CONFIG,
} from '../tree-path-layout';
import type { DisplaySegment, SkillTreeRung } from '../../core/types';

function rung(level: number): SkillTreeRung {
  return { level, representative: null, siblingCount: 0, isGap: false };
}

function nodeSeg(level: number): DisplaySegment {
  return { type: 'node', rung: rung(level) };
}

function gapSeg(fromLevel: number, toLevel: number): DisplaySegment {
  return { type: 'gap', fromLevel, toLevel };
}

describe('catmullRomToBezierPath', () => {
  it('returns empty string for zero points', () => {
    expect(catmullRomToBezierPath([])).toBe('');
  });

  it('returns a bare moveto for a single point', () => {
    expect(catmullRomToBezierPath([{ x: 10, y: 20 }])).toBe('M 10 20');
  });

  it('produces one moveto and one curveto per segment for 2 points', () => {
    const d = catmullRomToBezierPath([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('C ');
    expect(d.match(/C /g)).toHaveLength(1);
  });

  it('produces N-1 curvetos for N points, ending exactly at the last point', () => {
    const points = [
      { x: 30, y: 0 },
      { x: 70, y: 100 },
      { x: 30, y: 200 },
      { x: 70, y: 300 },
    ];
    const d = catmullRomToBezierPath(points);
    expect(d.match(/C /g)).toHaveLength(3);
    expect(d.endsWith('70 300')).toBe(true);
  });
});

describe('buildTreePathLayout', () => {
  it('alternates node x between rightX and leftX, starting on the right', () => {
    const segments = [nodeSeg(1), nodeSeg(2), nodeSeg(3), nodeSeg(4)];
    const layout = buildTreePathLayout(segments);
    const xs = layout.entries.map((e) => e.x);
    expect(xs).toEqual([
      DEFAULT_TREE_PATH_LAYOUT_CONFIG.rightX,
      DEFAULT_TREE_PATH_LAYOUT_CONFIG.leftX,
      DEFAULT_TREE_PATH_LAYOUT_CONFIG.rightX,
      DEFAULT_TREE_PATH_LAYOUT_CONFIG.leftX,
    ]);
  });

  it('a gap segment sits dead-center (x=50) and does not flip the alternation for the next node', () => {
    const segments = [nodeSeg(1), gapSeg(2, 3), nodeSeg(4)];
    const layout = buildTreePathLayout(segments);
    expect(layout.entries[0].x).toBe(DEFAULT_TREE_PATH_LAYOUT_CONFIG.rightX); // node 1
    expect(layout.entries[1].x).toBe(50); // gap
    expect(layout.entries[2].x).toBe(DEFAULT_TREE_PATH_LAYOUT_CONFIG.leftX); // node 4 — still alternates as if the gap wasn't there
  });

  it('cumulates y using rungRowHeight for nodes and gapRowHeight for gaps, centered within each row', () => {
    const config = { rungRowHeight: 100, gapRowHeight: 40, leftX: 20, rightX: 80 };
    const segments = [nodeSeg(1), gapSeg(2, 2), nodeSeg(3)];
    const layout = buildTreePathLayout(segments, config);
    expect(layout.entries[0].y).toBe(50); // centered in [0,100)
    expect(layout.entries[1].y).toBe(120); // centered in [100,140)
    expect(layout.entries[2].y).toBe(190); // centered in [140,240)
    expect(layout.totalHeight).toBe(240);
  });

  it('computes positions generically for any segment count (works for a long ladder, not just a fixed size)', () => {
    const segments = Array.from({ length: 12 }, (_, i) => nodeSeg(i + 1));
    const layout = buildTreePathLayout(segments);
    expect(layout.entries).toHaveLength(12);
    expect(layout.totalHeight).toBe(12 * DEFAULT_TREE_PATH_LAYOUT_CONFIG.rungRowHeight);
    // Every y strictly increases — no overlapping rows.
    for (let i = 1; i < layout.entries.length; i++) {
      expect(layout.entries[i].y).toBeGreaterThan(layout.entries[i - 1].y);
    }
  });

  it('produces a non-empty curve path spanning all entries, including gaps', () => {
    const segments = [nodeSeg(1), gapSeg(2, 3), nodeSeg(4), nodeSeg(5)];
    const layout = buildTreePathLayout(segments);
    expect(layout.pathD.startsWith('M ')).toBe(true);
    expect(layout.pathD.match(/C /g)).toHaveLength(segments.length - 1);
  });

  it('returns empty entries and zero height for an empty segment list', () => {
    const layout = buildTreePathLayout([]);
    expect(layout.entries).toEqual([]);
    expect(layout.totalHeight).toBe(0);
    expect(layout.pathD).toBe('');
  });
});
