// @vitest-environment jsdom
/**
 * i18n wave 2 batch aj (namespace `home`): StatsOverview (the legacy workout-trio hero: title, description, locked
 * teaser CTA, step-deficit route card).
 *
 * Snapshots recorded BEFORE the extraction. Everything StatsOverview pulls in (services, stores, children) is
 * replaced by fakes — only its own markup is under test; the trio stays empty (skeleton). The hero (title, description,
 * locked-teaser CTA) is what a static render reaches; the trio-dependent step-deficit route card, the states behind a tap
 * (the train-ahead modal) and the unreachable
 * ones (the assessment nudge — `handleLockedWidgetTap` has no caller; ExercisePreviewList — never rendered) are
 * pinned key by key in src/lib/i18n/__tests__/home-aj-he.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  mode: 'PERFORMANCE',
  calm: { on: false, state: null as unknown, welcomeBack: false },
  deficit: null as null | Record<string, unknown>,
  deficitNeedsConnection: false,
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {}, storage: {} }));
vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {} };
  return { useRouter: () => router };
});
vi.mock('@/features/user', () => {
  const state = () => ({ profile: h.profile, _hasHydrated: true, refreshProfile: async () => {} });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useGPSStore', () => ({ useGPSStore: { getState: () => ({}) } }));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => h.mode }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: false } }) }));
vi.mock('../../hooks/useCalmReturn', () => ({ useCalmReturn: () => h.calm }));
vi.mock('../../hooks/useStepDeficitRoute', () => ({
  useStepDeficitRoute: () => ({ route: h.deficit, needsConnection: h.deficitNeedsConnection, stepsRemaining: 1200 }),
}));
vi.mock('@/features/activity', () => ({
  useDailyActivity: () => ({ stepsToday: 0, caloriesToday: 0 }),
  useWeeklyProgress: () => ({ summary: {} }),
}));
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => {
  const s = { checkAndResetWeek: () => {}, recalculateFromActivities: () => {}, getState: () => ({}) };
  const useWeeklyVolumeStore = Object.assign((sel: (x: typeof s) => unknown) => sel(s), { getState: () => ({}) });
  return { useWeeklyVolumeStore, calculateWeeklyBudget: () => 10 };
});
vi.mock('@/features/workout-engine/services/home-workout.service', () => ({ generateHomeWorkoutTrio: () => new Promise(() => {}) }));
vi.mock('@/features/workout-engine/services/lead-program.service', () => ({ resolveActiveProgramBudget: async () => null }));
vi.mock('@/features/workout-engine/services/workout-context-resolver', () => ({ resolveWorkoutContext: async () => ({ availableGear: [] }) }));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({ ensureEquipmentCachesLoaded: async () => {} }));
vi.mock('@/features/workout-engine/budget-light/snapshot', () => ({ snapshotFromVolumeStore: () => ({}), trainingDaysOf: () => 3 }));
vi.mock('@/features/workout-engine/core/services/workout-completion.service', () => ({
  handleProgramAlignment: () => ({ type: 'none' }),
  rollBackOneWeek: async () => {},
  calculateCurrentWeek: () => 1,
  autoSkipMissedEntries: async () => {},
  getCurrentUid: () => 'u1',
}));
vi.mock('@/features/user/scheduling/services/userSchedule.service', () => ({
  getScheduleEntries: async () => [],
  hydrateFromTemplate: async () => [],
}));
vi.mock('@/features/user/progression/hooks/useGoalsForProgram', () => ({ useGoalsForProgram: () => ({ goals: [] }) }));
vi.mock('@/features/user/onboarding/utils/onboarding-entry', () => ({ seedOnboardingTrackEntry: () => {} }));
vi.mock('@/features/workout-engine/logic/adaptive/goal-presence', () => ({ recentIdsByDomain: () => ({}) }));
vi.mock('../HeroWorkoutCard', () => ({
  default: () => <div data-hero="" />,
  pickHeroExercise: () => null,
  resolveHeroMedia: () => null,
}));
vi.mock('../UserWorkoutAdjuster', () => ({ default: () => null }));
vi.mock('../ProcessingOverlay', () => ({ default: () => null }));
vi.mock('../AnchorLocationChip', () => ({ default: () => <div data-anchor="" /> }));
vi.mock('../widgets/LoadAdvisorBanner', () => ({ LoadAdvisorBanner: () => null }));
vi.mock('../widgets/RunForecastWidget', () => ({ RunForecastWidget: () => null }));
vi.mock('../widgets/NextRunWorkoutCard', () => ({ default: () => <div data-next-run="" /> }));
vi.mock('../WorkoutSelectionCarousel', () => ({
  default: () => null,
  CarouselSkeleton: () => <div data-skeleton="" />,
  BuildCustomButton: () => null,
}));
vi.mock('../ConnectStepsCard', () => ({ ConnectStepsCard: () => <div data-connect="" /> }));
vi.mock('@/features/workout-engine/players/running/components/MissedWorkoutBanner', () => ({ default: () => null }));
vi.mock('@/features/workout-engine/players/running/components/PlanAlignmentPopup', () => ({ PlanRealignPopup: () => null, RebuildPopup: () => null }));
vi.mock('@/features/parks/core/components/RouteCardUnified', () => ({
  default: (p: { name: string; distanceText: string; durationText: string; ctaContent: unknown }) => (
    <div data-route-card="">
      <b>{p.name}</b>
      <i>{p.distanceText}</i>
      <u>{p.durationText}</u>
      <button>{p.ctaContent as never}</button>
    </div>
  ),
}));
vi.mock('@/features/parks/core/components/RouteQualityBadges', () => ({ default: () => null }));
vi.mock('@/features/content/exercises', () => ({ getLocalizedText: (x: unknown) => String(x) }));
vi.mock('@/features/content/programs', () => ({ getProgramIcon: () => null }));
vi.mock('@/features/workouts/components/workout-preview-drawer/hooks/useSwapAll', () => ({ useSwapAll: () => ({}) }));
vi.mock('@/features/workouts/components/workout-preview-drawer/hooks/useExercisePool', () => ({ useExercisePool: () => ({}) }));
vi.mock('@/lib/gen-perf', () => ({ genPerfBegin: () => {}, genPerfMark: () => {}, genPerfEnd: () => {} }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import StatsOverview from '../StatsOverview';

const snap = (name: string) => `./__snapshots__/home-aj-stats-i18n/${name}.html`;
let m: Mounted | null = null;
const settle = async () => {
  for (let i = 0; i < 5; i++) await m!.advance(0);
};

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.profile = { id: 'u1', core: { gender: 'male' }, lifestyle: { scheduleDays: ['ב', 'ד'] }, progression: {} };
  h.mode = 'PERFORMANCE';
  h.calm = { on: false, state: null, welcomeBack: false };
  h.deficit = null;
  h.deficitNeedsConnection = false;
  useLocaleStore.setState({ gender: 'male' });
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('StatsOverview', () => {
  it('hero header: assessment done / not done, calm welcome back, every mode', async () => {
    const parts: string[] = [];
    const render = async (props: Record<string, unknown> = {}) => {
      m?.unmount();
      m = await mount(<StatsOverview stats={{}} {...props} />);
      await settle();
      parts.push(m.html());
    };
    await render();
    await render({ hasCompletedAssessment: false, onStartWorkout: () => {} });
    h.calm = { on: true, state: { isLightened: false }, welcomeBack: true };
    await render();
    h.calm = { on: false, state: null, welcomeBack: false };
    h.mode = 'HYBRID';
    await render();
    h.mode = 'RUNNING';
    await render();
    h.mode = 'DEFAULT';
    await render();
    await render({ hideWorkoutSection: true });
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('hero'));
  });
});
