/**
 * Pure logic for the summary SegmentRail block (design spec v0.9 §2, Moovit
 * style). No JSX — kept separate so it runs in the node vitest harness.
 */
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { summary, type SummaryKey } from '@/messages/ns/summary';

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

/** Catalog key (namespace `summary`) of the label for a segment; walking stays distinct from running. */
export function segmentLabelKey(
  type: SegmentRailType,
  aerobicType?: 'running' | 'walking' | 'cycling',
): SummaryKey {
  if (type === 'strength') return 'segment.strength';
  if (type === 'stairs') return 'segment.stairs';
  if (aerobicType === 'cycling') return 'segment.cycling';
  return aerobicType === 'walking' ? 'segment.walking' : 'segment.running';
}

const sourceT = makeT(SOURCE_LOCALE, summary);

/**
 * The label as source-language text. Kept for HybridSummary, whose file is busy
 * (it will switch to `t(segmentLabelKey(...))` when it is migrated); pass the
 * caller's `t` to get the active locale.
 */
export function segmentLabel(
  type: SegmentRailType,
  aerobicType?: 'running' | 'walking' | 'cycling',
  t: (key: SummaryKey) => string = sourceT,
): string {
  return t(segmentLabelKey(type, aerobicType));
}
