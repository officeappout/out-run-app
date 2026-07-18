/**
 * Pure logic for the summary SegmentRail block (design spec v0.9 §2, Moovit
 * style). No JSX — kept separate so it runs in the node vitest harness.
 */
export type SegmentRailType = 'aerobic' | 'strength' | 'stairs';

/** Rail colour by segment type (spec v0.9 §2). */
export const SEGMENT_RAIL_COLORS: Record<SegmentRailType, string> = {
  aerobic: '#1D9E75', // turquoise
  strength: '#E0A33E', // amber
  stairs: '#8B5E3C', // brown
};

export function railColor(type: SegmentRailType): string {
  return SEGMENT_RAIL_COLORS[type];
}

/** Map a stored SessionSegmentRecord.kind to a rail type. */
export function railTypeFromKind(kind: 'aerobic' | 'strength'): SegmentRailType {
  return kind === 'strength' ? 'strength' : 'aerobic';
}

/** Hebrew label for a segment; walking stays distinct from running. */
export function segmentLabel(
  type: SegmentRailType,
  aerobicType?: 'running' | 'walking',
): string {
  if (type === 'strength') return 'כוח';
  if (type === 'stairs') return 'מדרגות';
  return aerobicType === 'walking' ? 'הליכה' : 'ריצה';
}
