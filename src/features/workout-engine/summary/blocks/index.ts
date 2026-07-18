/**
 * Summary block kit — the single import surface for the summary composition
 * pages (Stage 1 of the consolidation).
 *
 * Net-new blocks live here. Widely-shared EXISTING blocks are re-exported IN
 * PLACE (not relocated) because they have importers outside the summary layer
 * (e.g. RunMapBlock is imported by admin / profile / workout-preview) — moving
 * their files would ripple across the app. Ships inert until a page imports it.
 */

// Net-new blocks
export { default as SegmentRail } from './SegmentRail';
export type { SegmentRailItem } from './SegmentRail';
export {
  type SegmentRailType,
  SEGMENT_RAIL_COLORS,
  railColor,
  railTypeFromKind,
  segmentLabel,
} from './segment-rail.util';
export { default as SummarySheet } from './SummarySheet';
export { default as SummaryDrawerShell, type DrawerTab } from './SummaryDrawerShell';
export { default as SummaryTabs, type SummaryTab } from './SummaryTabs';
export { default as IdentityUnitsRow } from './IdentityUnitsRow';
export { default as StreakBlock } from './StreakBlock';

// Re-exported IN PLACE (do NOT relocate — cross-app importers)
export { default as RunMapBlock } from '../components/running/RunMapBlock';
export { default as LapPaceChart } from '../components/shared/LapPaceChart';
export { default as DopamineStreakBlock } from '../components/shared/DopamineStreakBlock';
