'use client';

/**
 * Home widgets, each wrapped in its own WidgetBoundary (drop-in replacements
 * for the original imports — same props, same JSX at the call sites).
 *
 * A widget that throws now disappears (or, for the main cards, shows a small
 * "נסו שוב" card) and is reported to Sentry, instead of taking the whole app
 * down to the global error screen.
 */
import { withWidgetBoundary } from '@/components/system/WidgetBoundary';
import { compactWidgetFallback } from '@/components/system/CompactWidgetFallback';
import StatsOverviewRaw from '@/features/home/components/StatsOverview';
import SmartWeeklyScheduleRaw from '@/features/home/components/SmartWeeklySchedule';
import ProgramProgressRowRaw from '@/features/home/components/rows/ProgramProgressRow';
import ConsistencyWidgetRaw from '@/features/home/components/rows/ConsistencyWidget';
import AddStrengthProgramCardRaw from '@/features/home/components/AddStrengthProgramCard';
import HomeProgramSlideRaw from '@/features/home/components/start-cards/HomeProgramSlide';
import TodayActivityStripRaw from '@/features/home/components/TodayActivityStrip';
import DoneTodayCardRaw from '@/features/home/components/DoneTodayCard';
import StepsSummaryCardRaw from '@/features/home/components/widgets/StepsSummaryCard';
import RacePredictionCardRaw from '@/features/home/components/widgets/RacePredictionCard';
import WeatherChipRaw from '@/features/weather/components/WeatherChip';
import { AiCoachHomeEntry as AiCoachHomeEntryRaw } from '@/features/ai-coach/components/AiCoachEntry';
import AnchorLocationChipRaw from '@/features/home/components/AnchorLocationChip';
import WorkoutLocationSuggestionsRaw from '@/features/home/components/WorkoutLocationSuggestions';
import CalmReturnCardRaw from '@/features/home/components/CalmReturnCard';
import StreakNoticeCardRaw from '@/features/home/components/streak/StreakNoticeCard';
import HomeRunCarouselCardRaw from '@/features/home/components/widgets/run-week-v2/HomeRunCarouselCard';
import NextRunWorkoutCardRaw, { type NextRunWorkoutCardProps } from '@/features/home/components/widgets/NextRunWorkoutCard';
import NearbyGroupsRowRaw from '@/features/home/components/NearbyGroupsRow';
import CommunitySessionBannerRaw from '@/features/arena/components/CommunitySessionBanner';
import { PostWorkoutCardRenderer as PostWorkoutCardRendererRaw } from '@/features/home/components/PostWorkoutCardRenderer';
import { PreWorkoutCardRenderer as PreWorkoutCardRendererRaw } from '@/features/home/components/PreWorkoutCardRenderer';

// Main cards — a compact retry card rather than a silent gap.
export const StatsOverview = withWidgetBoundary(StatsOverviewRaw, 'home.StatsOverview', compactWidgetFallback);
export const PreWorkoutCardRenderer = withWidgetBoundary(PreWorkoutCardRendererRaw, 'home.PreWorkoutCard', compactWidgetFallback);
// enable_home_v2: today's / the next planned run as a daily-carousel slide.
export const HomeRunCarouselCard = withWidgetBoundary(HomeRunCarouselCardRaw, 'home.HomeRunCarouselCard', compactWidgetFallback);
// Flag off: the legacy run card as a daily-carousel slide (ungated fix, 19.10.2026).
export const NextRunWorkoutCard = withWidgetBoundary<NextRunWorkoutCardProps>(NextRunWorkoutCardRaw, 'home.NextRunWorkoutCard', compactWidgetFallback);
export const PostWorkoutCardRenderer = withWidgetBoundary(PostWorkoutCardRendererRaw, 'home.PostWorkoutCard', compactWidgetFallback);
export const TodayActivityStrip = withWidgetBoundary(TodayActivityStripRaw, 'home.TodayActivityStrip', compactWidgetFallback);

// Secondary widgets — the screen reads fine without them.
export const SmartWeeklySchedule = withWidgetBoundary(SmartWeeklyScheduleRaw, 'home.SmartWeeklySchedule');
export const ProgramProgressRow = withWidgetBoundary(ProgramProgressRowRaw, 'home.ProgramProgressRow');
export const ConsistencyWidget = withWidgetBoundary(ConsistencyWidgetRaw, 'home.ConsistencyWidget');
export const AddStrengthProgramCard = withWidgetBoundary(AddStrengthProgramCardRaw, 'home.AddStrengthProgramCard');
// enable_home_v2: the start-pair / add-track slide of the daily carousels.
export const HomeProgramSlide = withWidgetBoundary(HomeProgramSlideRaw, 'home.HomeProgramSlide');
export const DoneTodayCard = withWidgetBoundary(DoneTodayCardRaw, 'home.DoneTodayCard');
export const StepsSummaryCard = withWidgetBoundary(StepsSummaryCardRaw, 'home.StepsSummaryCard');
export const RacePredictionCard = withWidgetBoundary(RacePredictionCardRaw, 'home.RacePredictionCard');
export const WeatherChip = withWidgetBoundary(WeatherChipRaw, 'home.WeatherChip');
export const AiCoachHomeEntry = withWidgetBoundary(AiCoachHomeEntryRaw, 'home.AiCoachHomeEntry');
export const AnchorLocationChip = withWidgetBoundary(AnchorLocationChipRaw, 'home.AnchorLocationChip');
export const WorkoutLocationSuggestions = withWidgetBoundary(WorkoutLocationSuggestionsRaw, 'home.WorkoutLocationSuggestions');
export const CalmReturnCard = withWidgetBoundary(CalmReturnCardRaw, 'home.CalmReturnCard');
// enable_home_v2: the one streak message of the day (broken / shield / milestone).
export const StreakNoticeCard = withWidgetBoundary(StreakNoticeCardRaw, 'home.StreakNoticeCard');
export const NearbyGroupsRow = withWidgetBoundary(NearbyGroupsRowRaw, 'home.NearbyGroupsRow');
export const CommunitySessionBanner = withWidgetBoundary(CommunitySessionBannerRaw, 'home.CommunitySessionBanner');
