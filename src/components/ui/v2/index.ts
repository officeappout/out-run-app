/**
 * Design language v2 primitives — the shared building blocks of every
 * `enable_home_v2` screen (see .claude/knowledge/design-language.md, v2).
 * In use across home, the map, the live players and the workout summary;
 * new v2 markup should compose these instead of re-rolling sheets, icon
 * buttons, CTAs, section titles, rails or story bars:
 *   Sheet (modal bottom sheet) · ConfirmSheet (short action sheet) · DraggableSheet (snap-point, non-modal) ·
 *   IconButton · Button (variant "cta" = the one gradient CTA) ·
 *   SectionHeader · HScroller · StoryBars · Card / Chip / IconTile …
 * scripts/ci/v2-raw-style-grep.sh warns about raw copies outside this folder.
 */
export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { default as Card, CardTile } from './Card';
export type { CardProps, CardVariant } from './Card';
export { default as BrandCard, BRAND_GRADIENT, BRAND_BORDER_BG, BRAND_TILE_BG, BRAND_CARD_SHADOW } from './BrandCard';
export type { BrandCardProps } from './BrandCard';
export { default as GlassSurface } from './GlassSurface';
export type { GlassSurfaceProps, GlassRecipe } from './GlassSurface';
export { default as Chip } from './Chip';
export type { ChipProps, ChipTone } from './Chip';
export { default as IconTile } from './IconTile';
export type { IconTileProps, IconTileTone } from './IconTile';
export { default as DoneRow, DoneCheck, DONE_SURFACE_STYLE, DONE_GREEN } from './DoneRow';
export type { DoneRowProps } from './DoneRow';
export { default as StatNumber } from './StatNumber';
export type { StatNumberProps } from './StatNumber';
export { default as DeltaBadge } from './DeltaBadge';
export type { DeltaBadgeProps } from './DeltaBadge';
export { default as DraggableSheet } from './DraggableSheet';
export type { DraggableSheetProps } from './DraggableSheet';
export {
  default as Sheet,
  SheetGrabber,
  SheetHeader,
  SheetDragHandle,
  SHEET_SURFACE_CLASS,
  SHEET_GRABBER_CLASS,
  SHEET_TITLE_CLASS,
  DEFAULT_SHEET_SAFE_AREA,
  SPRING_HERO_SNAP,
} from './Sheet';
export type { SheetProps, SheetDragOptions } from './Sheet';
export { default as ConfirmSheet, CONFIRM_ACTION_CLASS } from './ConfirmSheet';
export { default as SoftAskCard } from './SoftAskCard';
export type { SoftAskCardProps } from './SoftAskCard';
export type { ConfirmSheetProps, ConfirmSheetAction, ConfirmActionTone } from './ConfirmSheet';
export { default as IconButton } from './IconButton';
export type { IconButtonProps, IconButtonTone, IconButtonSize } from './IconButton';
export { default as SectionHeader } from './SectionHeader';
export type { SectionHeaderProps, SectionHeaderSize } from './SectionHeader';
export { default as HScroller } from './HScroller';
export type { HScrollerProps, HScrollerGap, HScrollerEdge } from './HScroller';
export { default as StepBar } from './StepBar';
export type { StepBarProps } from './StepBar';
export * from './step-bar';
export { default as BarChart } from './BarChart';
export type { BarChartProps, BarDatum } from './BarChart';
export { default as LineChart } from './LineChart';
export type { LineChartProps } from './LineChart';
export * from './tokens';
export { default as StreakFlame } from './StreakFlame';
export type { StreakFlameProps } from './StreakFlame';
export * from './streak';
// Post-workout summary (home v2) building blocks.
export * from './summary';
export { default as ExerciseSetsTable, SetTileBox, SetsLegend, ExerciseThumb } from './ExerciseSetsTable';
export type { ExerciseSetsRow, ExerciseSetsTableProps } from './ExerciseSetsTable';
export { default as ProgramProgressRing } from './ProgramProgressRing';
export type { ProgramProgressItem } from './ProgramProgressRing';
export { default as StreakDotsStrip } from './StreakDotsStrip';
export type { StreakDotsStripProps, StreakWeekBar } from './StreakDotsStrip';
export { default as MetricRings } from './MetricRings';
export type { MetricRing } from './MetricRings';
export { default as ImprovementCard } from './ImprovementCard';
export type { ImprovementItem, ImprovementCardProps } from './ImprovementCard';
// Live players (home v2): segmented "shopping cart" list button + per-colour story bars.
export { default as CartProgressIcon } from './CartProgressIcon';
export type { CartProgressIconProps } from './CartProgressIcon';
export * from './cart-ring';
export { default as StoryBars, STORY_TRACK_V2 } from './StoryBars';
export type { StoryBarsProps, StoryBarSegment, StoryBarState } from './StoryBars';
export { default as RepPaceTable } from './RepPaceTable';
export type { RepPaceRow, RepPaceTableProps } from './RepPaceTable';
// Workout overviews (hybrid route+stops, run preview/briefing): the horizontal journey strip + its header.
export { default as JourneyStrip } from './JourneyStrip';
export type { JourneyStripProps, JourneyStripItem, JourneyItemKind } from './JourneyStrip';
export { default as WorkoutOverviewHeader } from './WorkoutOverviewHeader';
export type { WorkoutOverviewHeaderProps, OverviewMetaItem } from './WorkoutOverviewHeader';
export { default as SegmentedPicker } from './SegmentedPicker';
export type { SegmentedPickerProps, SegmentedOption } from './SegmentedPicker';
// Pre-run (home v2): a workout's intensity profile, one bar per block.
export { default as ProfileStrip } from './ProfileStrip';
export type { ProfileStripProps, ProfileStripSegment } from './ProfileStrip';
// Full-bleed media hero that fades into the surface below (no card, no grey placeholder).
export { default as MediaHeroFade, MediaHeroLayer, MediaHeroImage } from './MediaHeroFade';
export type { MediaHeroFadeProps } from './MediaHeroFade';
export * from './media-hero';
// Friendly error surface (route error.tsx fallbacks + failed widgets).
export { default as ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorStateAction } from './ErrorState';
// Swap sheets (strength "החלפת תרגיל", run "החלף מקטע"): the level below / same / above marks.
export { default as LevelCompareIcon, LEVEL_COMPARE_ICONS } from './LevelCompareIcon';
export type { LevelComparison, LevelCompareIconProps } from './LevelCompareIcon';
// Staggered entrance on scroll (plan summary tiles); reduced motion = no motion.
export { default as RevealOnScroll } from './RevealOnScroll';
export type { RevealOnScrollProps } from './RevealOnScroll';
export * from './reveal';
// Signup schedule steps: the "ממליצים לך" pre-filled recommendation card.
export { default as RecommendationCard } from './RecommendationCard';
export type { RecommendationCardProps } from './RecommendationCard';
// Schedule proposals (add-track week): one day row + a session piece with a diff tag.
export { default as WeekDayRow, WeekSessionPiece } from './WeekDayRow';
export type { WeekDayRowProps, WeekSessionPieceProps, WeekSessionTagTone, WeekSessionNoteTone } from './WeekDayRow';
// Small progress ring with a lighter "planned" arc (home walking: steps + today's walk).
export { default as MiniRing } from './MiniRing';
export type { MiniRingProps } from './MiniRing';
// Progress summary (P-1c): a ring split by activity + tiny bar sparklines next to numbers.
export { default as SegmentedRing } from './SegmentedRing';
export type { SegmentedRingProps } from './SegmentedRing';
export * from './segmented-ring';
export { default as SparkBars } from './SparkBars';
export type { SparkBarsProps } from './SparkBars';
// Progress comparison (P-1d / P-1e): one bar split by share, and now-vs-before paired bars.
export { default as SplitBar } from './SplitBar';
export type { SplitBarProps, SplitBarSegment } from './SplitBar';
export { default as PairedBarRow, PAIRED_PREVIOUS_COLOR } from './PairedBarRow';
export type { PairedBarRowProps } from './PairedBarRow';
export * from './compare-bars';
export { default as ScreenSkeleton } from './ScreenSkeleton';
export type { ScreenSkeletonProps } from './ScreenSkeleton';
// Bottom chrome math: nav / FAB offsets and the end padding a scroll container needs.
export * from './bottom-chrome';
