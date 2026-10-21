/**
 * i18n wave 2 (namespace `home`): the home screen's free components in src/features/home/components
 * (hero metadata, build-custom phrases, program start cards, nearby groups header, personas section, race
 * prediction, run / walk carousel cards, run week card, agenda confirm sheets, training planner header,
 * pre-workout safety-net cards, connect-steps card, load advisor, consistency bars, today / done-today cards,
 * steps summary, program progress card + row).
 *
 * The snapshots below were recorded from the components BEFORE the extraction; the extracted components must
 * render the same Hebrew markup in every state a static render reaches (v1 and v2 = enable_home_v2 via
 * HomeV2Context, each branch). States behind a tap or an async load are covered by home-i18n-dom-parity.test.tsx
 * (jsdom); what neither reaches is pinned key by key in src/lib/i18n/__tests__/home-he.test.ts.
 *
 * Stores are replaced by selector fakes (vi.mock) — under react-dom/server a real Zustand store only renders its
 * initial state. `<!-- -->` is stripped before comparing (in the BEFORE snapshots too): react-dom/server inserts
 * it between two adjacent text nodes (`{n} דקות` is two nodes, `t('…', { n })` is one). It is not rendered
 * text, and the client DOM never contains it. Portal / rotating components (ConfirmSheet, ShimmerPhraseButton,
 * SuggestionCard) are stubbed so their text props are printed in place.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const userState: { profile: Record<string, unknown> | null } = { profile: null };
const weekly = { summary: { categorySessions: { strength: 1, cardio: 1 } } as Record<string, unknown> };
const volume = { strength: { totalSetsCompleted: 0, weeklyBudget: 0 }, sessionLogs: [] as unknown[] };
const settings = { healthPermissionAsked: false };
const health = { connected: true as boolean | null };
const live = { stepsToday: 4321, todayActivity: null as Record<string, unknown> | null, isLoading: false };
const activity = { today: { steps: 5400, stepsGoal: 8000 } as Record<string, unknown> | null, resolvedStepGoal: null as number | null };
const personaSummary: Record<string, Record<string, unknown>> = {};
const programProgress = { data: null as Record<string, unknown> | null };
const cachedRoute = { route: null as Record<string, unknown> | null };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: unknown) => unknown) => {
    const s = { profile: userState.profile, refreshProfile: async () => {} };
    return sel ? sel(s) : s;
  };
  (useUserStore as unknown as { getState: () => unknown }).getState = () => ({ profile: userState.profile });
  return { useUserStore };
});
vi.mock('@/features/activity', () => ({
  useWeeklyProgress: () => ({ summary: weekly.summary }),
  getStrengthAdherence: () => ({ done: 2, target: 3 }),
  useWeeklyRunCount: () => 1,
}));
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => ({
  useWeeklyVolumeStore: (sel: (s: typeof volume) => unknown) => sel(volume),
}));
vi.mock('@/features/home/store/useSettingsStore', () => ({
  useSettingsStore: (sel: (s: typeof settings) => unknown) => sel(settings),
}));
vi.mock('@/hooks/useHealthConnected', () => ({ useHealthConnected: () => health.connected }));
vi.mock('@/hooks/useHealthWithDisclosure', () => ({
  useHealthWithDisclosure: () => ({ triggerHealthPermission: () => {}, disclosureProps: { open: false } }),
}));
vi.mock('@/components/ui/HealthConnectDisclosureModal', () => ({ default: () => null }));
vi.mock('@/features/activity/hooks/useLiveDailyActivity', () => ({ useLiveDailyActivity: () => live }));
vi.mock('@/features/activity/store/useActivityStore', () => ({
  useActivityStore: (sel: (s: typeof activity) => unknown) => sel(activity),
}));
vi.mock('@/lib/haptics', () => ({ hapticMedium: () => {}, hapticLight: () => {} }));
vi.mock('@/lib/sound', () => ({ playSuccessChime: () => {} }));
vi.mock('@/components/ui/ShimmerPhraseButton', () => ({
  default: ({ messages }: { messages: string[] }) => <ul data-shimmer="">{messages.map((m) => <li key={m}>{m}</li>)}</ul>,
}));
vi.mock('@/components/ui/v2/ConfirmSheet', () => ({
  default: (p: { open: boolean; title: string; description?: string; actions: { label: string }[] }) => (
    <div data-confirm={String(p.open)}><h2>{p.title}</h2>{p.description && <p>{p.description}</p>}{p.actions.map((a) => <button key={a.label}>{a.label}</button>)}</div>
  ),
}));
vi.mock('@/features/workout-engine/core/components/SuggestionCard', () => ({
  SuggestionCard: (p: { suggestion: { title: string; subtitle?: string }; ctaLabel?: string }) => (
    <div data-suggestion=""><b>{p.suggestion.title}</b><i>{p.suggestion.subtitle}</i><u>{p.ctaLabel ?? 'default-cta'}</u></div>
  ),
}));
vi.mock('@/features/workout-engine/core/generators/route.generator', () => ({ getCachedRoute: () => cachedRoute.route }));
vi.mock('@/features/workout-engine/core/generators/full-strength.generator', () => ({ getCachedFullStrengthWorkout: () => undefined }));
vi.mock('@/features/workout-engine/core/generators/recovery-follow-up.generator', () => ({ getCachedRecoveryWorkout: () => undefined }));
vi.mock('@/features/home/fast-startup/provisionalHeroWorkouts', () => ({ getProvisionalHeroWorkout: () => undefined }));
vi.mock('@/features/home/hooks/useEquipmentIconsReady', () => ({ useEquipmentIconsReady: () => false }));
vi.mock('@/features/home/hooks/usePlannedRunWorkout', () => ({ usePlannedRunWorkout: () => ({ workout: null, loading: false }) }));
vi.mock('@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel', () => ({ useRunPreviewModel: () => null }));
vi.mock('@/features/workout-engine/players/running/components/overview-v2/RunOverviewHomeSheet', () => ({ default: () => null }));
vi.mock('@/features/schedule/walking/useNearbyWalkingGroup', () => ({ useNearbyWalkingGroup: () => null }));
vi.mock('@/features/schedule/walking/components/NotAloneCard', () => ({ default: () => <div data-not-alone="" /> }));
vi.mock('@/features/parks/core/store/useGPSStore', () => ({ useGPSStore: { getState: () => ({ requestPermissionIfAllowed: () => new Promise(() => {}) }) } }));
vi.mock('@/features/arena/services/group.service', () => ({
  getPublicGroups: () => new Promise(() => {}), getMyGroups: async () => [], joinGroup: async () => {}, leaveGroup: async () => {},
}));
vi.mock('@/features/arena/components/GroupCard', () => ({ default: () => <div data-group-card="" /> }));
vi.mock('@/features/arena/components/GroupDetailsDrawer', () => ({ default: () => null }));
vi.mock('@/features/arena/hooks/useCommunitySessionBanner', () => ({ useCommunitySessionBanner: () => ({ sessions: [] }) }));
vi.mock('@/features/arena/hooks/usePublicGroupPhases', () => ({ usePublicGroupPhases: () => ({}) }));
vi.mock('@/features/user/identity/hooks/useResolvedPersonaSummary', () => ({
  useResolvedPersonaSummary: (_uid: unknown, entry: { id: string }) =>
    personaSummary[entry.id] ?? { loading: false, resolved: true, isComplete: true, parts: [], icon: null },
}));
vi.mock('@/features/user/identity/services/persona-answers.service', () => ({ addPersona: async () => {}, removePersona: async () => {} }));
vi.mock('@/features/user/onboarding/components/PersonaQuestionsDrawer', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/components/steps/PersonaStep', () => ({
  LIFESTYLE_OPTIONS: [{ id: 'parent' }, { id: 'military' }], resolvePersonaEmoji: () => '🙂',
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock('@/components/ui/UnitIconBadge', () => ({ default: () => <span data-unit-badge="" /> }));
vi.mock('@/features/home/components/calendar/MonthlyCalendarGrid', () => ({ default: () => <div data-month-grid="" /> }));
vi.mock('@/features/home/components/agenda/RollingAgenda', () => ({ default: () => <div data-agenda="" /> }));
vi.mock('@/features/home/components/AddWorkoutModal', () => ({ default: () => null }));
vi.mock('@/features/schedule/components/ScheduleBuilderDrawer', () => ({ default: () => null, isScheduleBuilderDrawerEnabled: () => true }));
vi.mock('@/features/workout-engine/shared/utils/running-current-week.utils', () => ({ resolveRunningCurrentWeek: () => 3 }));
vi.mock('@/lib/running-plan-date-range', () => ({ isDateWithinRunningPlan: () => true }));
vi.mock('@/features/home/hooks/useProgramProgress', async (orig) => ({
  ...(await orig<typeof import('@/features/home/hooks/useProgramProgress')>()),
  useProgramProgress: () => programProgress.data,
}));

import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import HeroWorkoutCard, { EquipmentBadgeRow } from '../HeroWorkoutCard';
import { BuildCustomButton } from '../WorkoutSelectionCarousel';
import ProgramStartCarousel from '../start-cards/ProgramStartCarousel';
import ProgramStartSlide from '../start-cards/ProgramStartSlide';
import AddRunningProgramCard from '../start-cards/AddRunningProgramCard';
import AddStrengthProgramCard from '../AddStrengthProgramCard';
import NearbyGroupsRow from '../NearbyGroupsRow';
import MyPersonasSection from '../settings/MyPersonasSection';
import { RacePredictionCard } from '../widgets/RacePredictionCard';
import HomeRunCarouselCard from '../widgets/run-week-v2/HomeRunCarouselCard';
import HomeWalkCarouselCard from '../walk/HomeWalkCarouselCard';
import RunWeekCardV2 from '../widgets/run-week-v2/RunWeekCardV2';
import { MoveConfirmSheetClassic, MoveConfirmSheetV2 } from '../agenda/MoveConfirmSheet';
import { DeleteEntrySheetClassic, DeleteEntrySheetV2 } from '../agenda/DeleteEntrySheet';
import TrainingPlannerOverlay from '../TrainingPlannerOverlay';
import { PreWorkoutCardRenderer } from '../PreWorkoutCardRenderer';
import { ConnectStepsCard } from '../ConnectStepsCard';
import { LoadAdvisorBanner } from '../widgets/LoadAdvisorBanner';
import { ConsistencyWidget } from '../rows/ConsistencyWidget';
import TodayActivityCard from '../TodayActivityCard';
import DoneTodayCard from '../DoneTodayCard';
import StepsSummaryCard from '../widgets/StepsSummaryCard';
import StepsSummaryCardView from '../widgets/StepsSummaryCardView';
import { ProgramProgressCard } from '../widgets/ProgramProgressCard';
import { ProgramProgressRow } from '../rows/ProgramProgressRow';
import type { MockWorkout } from '../../data/mock-schedule-data';
import type { HomeRunSlot } from '../../utils/home-run-slot';
import type { HomeWalkSlot } from '../../utils/home-walk-slot';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T08:40:00')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => {
  userState.profile = null;
  weekly.summary = { categorySessions: { strength: 1, cardio: 1 } };
  Object.assign(volume, { strength: { totalSetsCompleted: 0, weeklyBudget: 0 }, sessionLogs: [] });
  settings.healthPermissionAsked = false;
  health.connected = true;
  Object.assign(live, { stepsToday: 4321, todayActivity: null, isLoading: false });
  activity.today = { steps: 5400, stepsGoal: 8000 };
  activity.resolvedStepGoal = null;
  for (const k of Object.keys(personaSummary)) delete personaSummary[k];
  programProgress.data = null;
  cachedRoute.route = null;
});

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/home-i18n/${name}.html`;
const noop = () => {};
const V = [false, true] as const;
const vName = (v2: boolean) => (v2 ? 'v2' : 'v1');
const inHome = (v2: boolean, el: ReactElement) => <HomeV2Context.Provider value={v2}>{el}</HomeV2Context.Provider>;

const workout: MockWorkout = {
  id: 'w1', title: 'כל הגוף', type: 'strength', difficulty: 2, duration: 35, calories: 200, coins: 200, imageUrl: '',
};

describe('HeroWorkoutCard', () => {
  it.each(V)('strength difficulties + recovery + bodyweight badge, %s', async (v2) => {
    const out = [1, 2, 3].map((d) => html(inHome(v2, <HeroWorkoutCard workout={{ ...workout, difficulty: d as 1 | 2 | 3 }} onStart={noop} userGender="male" />)));
    out.push(html(inHome(v2, <HeroWorkoutCard workout={{ ...workout, isRecovery: true }} onStart={noop} userGender="female" />)));
    out.push(html(<div style={{ position: 'relative' }}><EquipmentBadgeRow icons={[]} showBodyweightFallback /></div>));
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`hero-${vName(v2)}`));
  });
});

describe('BuildCustomButton', () => {
  it.each(['male', 'female', 'other', null] as const)('phrases, gender %s', async (g) => {
    await expect(html(<BuildCustomButton onTap={noop} userGender={g} />)).toMatchFileSnapshot(snap(`build-custom-${g ?? 'unset'}`));
  });
});

describe('program start cards', () => {
  it('carousel + slides + add cards', async () => {
    const out = [
      html(<ProgramStartCarousel order={['strength', 'running']} profile={null} />),
      html(<ProgramStartSlide track="running" profile={null} />),
      html(<AddRunningProgramCard profile={null} />),
      html(<AddStrengthProgramCard profile={null} compact />),
      html(<AddStrengthProgramCard profile={null} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('program-start'));
  });
});

describe('NearbyGroupsRow (loading header)', () => {
  it.each(V)('%s', async (v2) => {
    await expect(html(inHome(v2, <NearbyGroupsRow />))).toMatchFileSnapshot(snap(`nearby-loading-${vName(v2)}`));
  });
});

describe('MyPersonasSection', () => {
  it('rows in every sublabel state', async () => {
    userState.profile = { core: { gender: 'female' }, personas: [{ id: 'military' }, { id: 'parent' }] };
    personaSummary.military = { loading: true, resolved: false, isComplete: false, parts: [] };
    const loading = html(<MyPersonasSection />);
    personaSummary.military = { loading: false, resolved: false, isComplete: false, parts: [] };
    const stale = html(<MyPersonasSection />);
    personaSummary.military = { loading: false, resolved: true, isComplete: false, parts: [] };
    const pending = html(<MyPersonasSection />);
    personaSummary.military = { loading: false, resolved: true, isComplete: true, parts: ['סדיר', 'גדוד 1'] };
    const done = html(<MyPersonasSection />);
    userState.profile = { personas: ['parent', 'student', 'pupil', 'office_worker', 'military', 'vatikim', 'pro_athlete'].map((id) => ({ id })) };
    const full = html(<MyPersonasSection />);
    await expect([loading, stale, pending, done, full].join('\n')).toMatchFileSnapshot(snap('personas'));
  });
});

describe('RacePredictionCard', () => {
  const ready = (history?: unknown[]) => ({
    running: { isUnlocked: true, paceProfile: { basePace: 330, qualityWorkoutsHistory: history }, generatedProgramTemplate: { targetDistance: '10k' } },
  });
  it('empty / ready (no history, faster trend, slower trend) / v1 hidden', async () => {
    userState.profile = { running: { isUnlocked: true } };
    const empty = html(inHome(true, <RacePredictionCard runningProgramsEnabled />));
    userState.profile = ready();
    const plain = html(inHome(true, <RacePredictionCard runningProgramsEnabled />));
    userState.profile = ready([{ date: new Date('2026-10-10T08:00:00'), impactOnBasePaceSeconds: -10 }]);
    const faster = html(inHome(true, <RacePredictionCard runningProgramsEnabled />));
    userState.profile = ready([{ date: new Date('2026-10-10T08:00:00'), impactOnBasePaceSeconds: 10 }]);
    const slower = html(inHome(true, <RacePredictionCard runningProgramsEnabled />));
    const v1 = html(inHome(false, <RacePredictionCard runningProgramsEnabled />));
    await expect([empty, plain, faster, slower, v1].join('\n')).toMatchFileSnapshot(snap('race-prediction'));
  });
});

describe('HomeRunCarouselCard', () => {
  const entry = { workoutId: 'rw1', week: 2, day: 3, category: 'easy_run', workoutName: 'ריצה קלה' };
  const slot = (p: Partial<HomeRunSlot>) => ({ kind: 'today', entry, position: 'first', ...p } as unknown as HomeRunSlot);
  it.each([
    ['today-total-5k', slot({}), { targetDistance: '5k', canonicalWeeks: 8 }],
    ['skipped-10k', slot({ skippedToday: true }), { targetDistance: '10k' }],
    ['next-tomorrow-2k', slot({ kind: 'next', daysAway: 1 }), { targetDistance: '2k', canonicalWeeks: 6 }],
    ['next-days-maintenance', slot({ kind: 'next', daysAway: 4 }), { targetDistance: 'maintenance' }],
    ['next-unknown-dist-no-name', slot({ kind: 'next', entry: { ...entry, workoutName: undefined } }), { targetDistance: 'marathon' }],
    ['today-3k-no-template', slot({}), undefined],
  ] as const)('%s', async (name, s, tpl) => {
    const profile = { running: { generatedProgramTemplate: tpl } } as never;
    await expect(html(<HomeRunCarouselCard slot={s} profile={profile} currentWeek={2} onSkipToday={noop} onUndoSkip={noop} />))
      .toMatchFileSnapshot(snap(`run-card-${name}`));
  });
});

describe('HomeWalkCarouselCard', () => {
  const today = (plannedRun?: unknown, title?: string) =>
    ({ kind: 'today', entry: { date: '2026-10-21', title, startTime: '07:30', plannedRun } } as unknown as HomeWalkSlot);
  it('today (time goal / distance goal / no goal) + gap (goal / no goal)', async () => {
    const out = [
      html(<HomeWalkCarouselCard slot={today({ goal: { type: 'time', value: 30 } })} onStart={noop} onOpenGroup={noop} />),
      html(<HomeWalkCarouselCard slot={today({ goal: { type: 'distance', value: 3 } }, 'הליכת בוקר')} onStart={noop} onOpenGroup={noop} />),
    ];
    activity.today = { steps: 12345 };
    out.push(html(<HomeWalkCarouselCard slot={today()} onStart={noop} onOpenGroup={noop} />));
    activity.resolvedStepGoal = 10000;
    out.push(html(<HomeWalkCarouselCard slot={{ kind: 'gap', missingSteps: 1500, minutes: 14 }} onStart={noop} onOpenGroup={noop} />));
    activity.resolvedStepGoal = null;
    out.push(html(<HomeWalkCarouselCard slot={{ kind: 'gap', missingSteps: 1500, minutes: 14 }} onStart={noop} onOpenGroup={noop} />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('walk-card'));
  });
});

describe('RunWeekCardV2', () => {
  it('done / skipped / upcoming / today (default CTA)', async () => {
    const base = { kind: 'easy' as const, typeLabel: 'ריצה קלה', title: '30 דק׳ ריצה' };
    const out = [
      html(<RunWeekCardV2 {...base} state="done" dayLetter="א" />),
      html(<RunWeekCardV2 {...base} state="skipped" dayLetter={null} />),
      html(<RunWeekCardV2 {...base} state="upcoming" dayLetter="ג" />),
      html(<RunWeekCardV2 {...base} state="today" dayLetter={null} onStart={noop} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('run-week-card'));
  });
});

describe('agenda confirm sheets', () => {
  it('move (classic + v2) + delete (classic + v2), open and closed', async () => {
    const move = { title: 'להזיז את האימון?', fromLabel: '21 אוקטובר', toLabel: '23 אוקטובר', onMoveOnce: noop, onMoveAll: noop, onCancel: noop };
    const out = [
      html(<MoveConfirmSheetClassic open {...move} />),
      html(<MoveConfirmSheetClassic open={false} {...move} />),
      html(<MoveConfirmSheetV2 open {...move} />),
      html(<DeleteEntrySheetClassic open onConfirm={noop} onCancel={noop} />),
      html(<DeleteEntrySheetV2 open onConfirm={noop} onCancel={noop} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('agenda-sheets'));
  });
});

describe('TrainingPlannerOverlay', () => {
  it.each(V)('open header, %s', async (v2) => {
    userState.profile = { running: { activeProgram: { startDate: '2026-10-01' } } };
    await expect(html(inHome(v2, (
      <TrainingPlannerOverlay isOpen onClose={noop} userId="u1" selectedDate="2026-10-21" onDaySelect={noop} />
    )))).toMatchFileSnapshot(snap(`planner-${vName(v2)}`));
  });
});

describe('PreWorkoutCardRenderer (safety net)', () => {
  const suggestion = { id: 's1', generatorId: 'safety-net', title: 'הליכה קלה', subtitle: 'בסיס', structure: { durationMin: 20 } } as unknown as Suggestion;
  it('route cached / steps remaining / not connected / generic', async () => {
    cachedRoute.route = { name: 'לולאת הפארק', distance: 2.345, duration: 28, difficulty: 'easy' };
    const route = html(<PreWorkoutCardRenderer suggestion={suggestion} onStart={noop} stepsRemaining={2500} />);
    cachedRoute.route = null;
    const steps = html(<PreWorkoutCardRenderer suggestion={suggestion} onStart={noop} stepsRemaining={12500} />);
    const connect = html(<PreWorkoutCardRenderer suggestion={suggestion} onStart={noop} healthConnected={false} onConnectSteps={noop} />);
    const generic = html(<PreWorkoutCardRenderer suggestion={suggestion} onStart={noop} stepsRemaining={0} />);
    await expect([route, steps, connect, generic].join('\n')).toMatchFileSnapshot(snap('pre-workout'));
  });
});

describe('ConnectStepsCard', () => {
  it.each([false, true])('asked=%s, compact + card', async (asked) => {
    settings.healthPermissionAsked = asked;
    const out = [html(<ConnectStepsCard onConnect={noop} variant="compact" />), html(<ConnectStepsCard onConnect={noop} />)];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`connect-steps-asked-${asked}`));
  });
});

describe('LoadAdvisorBanner', () => {
  it.each([
    ['budget', { totalSetsCompleted: 95, weeklyBudget: 100 }, []],
    ['push', { totalSetsCompleted: 20, weeklyBudget: 100 }, [{ programId: 'push', setsCompleted: 16 }, { programId: 'pull', setsCompleted: 4 }]],
    ['pull', { totalSetsCompleted: 20, weeklyBudget: 100 }, [{ programId: 'push', setsCompleted: 4 }, { programId: 'back', setsCompleted: 16 }]],
    ['on-track', { totalSetsCompleted: 60, weeklyBudget: 100 }, []],
    ['none', { totalSetsCompleted: 0, weeklyBudget: 100 }, []],
  ] as const)('%s', async (name, strength, logs) => {
    Object.assign(volume, { strength, sessionLogs: logs });
    await expect(html(<LoadAdvisorBanner />)).toMatchFileSnapshot(snap(`load-advisor-${name}`));
  });
});

describe('ConsistencyWidget', () => {
  it.each(V)('upsell + done, %s', async (v2) => {
    userState.profile = null;
    const upsell = html(inHome(v2, <ConsistencyWidget />));
    userState.profile = { personas: [{ id: 'parent' }], running: { activeProgram: {}, weeklyFrequency: 3 } };
    const done = html(inHome(v2, <ConsistencyWidget />));
    await expect([upsell, done].join('\n')).toMatchFileSnapshot(snap(`consistency-${vName(v2)}`));
  });
});

describe('TodayActivityCard + DoneTodayCard', () => {
  const cards = [
    { key: 'a', category: 'strength' as const, title: 'אימון כוח', minutes: 35, streak: 2 },
    { key: 'b', category: 'cardio' as const, title: 'ריצה קלה', minutes: 24, streak: 0, workoutType: 'running' },
    { key: 'c', category: 'steps' as const, title: 'יעד הצעדים הושלם', minutes: 0, stepsAchieved: 10234, streak: 0 },
  ];
  it('each category + the done-today list (v1 null, v2)', async () => {
    const out = cards.map((c) => html(<TodayActivityCard {...c} />));
    out.push(html(<TodayActivityCard key="d" category="steps" title="צעדים" minutes={0} streak={0} />));
    out.push(html(inHome(false, <DoneTodayCard cards={cards} workouts={[]} />)));
    out.push(html(inHome(true, <DoneTodayCard cards={cards} workouts={[]} />)));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('today-activity'));
  });
});

describe('StepsSummaryCard', () => {
  it.each(V)('connected / not asked / declined / stale, compact + default, %s', async (v2) => {
    const out: string[] = [];
    for (const variant of ['compact', 'default'] as const) {
      health.connected = true;
      out.push(html(inHome(v2, <StepsSummaryCard variant={variant} />)));
      health.connected = false;
      settings.healthPermissionAsked = false;
      out.push(html(inHome(v2, <StepsSummaryCard variant={variant} />)));
      settings.healthPermissionAsked = true;
      out.push(html(inHome(v2, <StepsSummaryCard variant={variant} />)));
      live.todayActivity = { date: '2026-10-20', stepsGoal: 12000 };
      out.push(html(inHome(v2, <StepsSummaryCard variant={variant} />)));
      live.todayActivity = null;
    }
    out.push(html(<StepsSummaryCardView variant="compact" displaySteps="1,234" steps={1234} goal={10000} percentage={12} connectPromptLabel={null} ariaLabel="x" onOpen={noop} />));
    out.push(html(<StepsSummaryCardView variant="default" displaySteps="—" steps={null} goal={10000} percentage={0} connectPromptLabel={null} ariaLabel="x" onOpen={noop} />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`steps-${vName(v2)}`));
  });
});

describe('ProgramProgressCard + ProgramProgressRow', () => {
  it.each(V)('normal / max level / locked / master / ghost row, %s', async (v2) => {
    const base = { programName: 'כל הגוף', iconKey: 'muscle', currentLevel: 4, maxLevel: 25, progressPercent: 37 };
    const out = [
      html(inHome(v2, <ProgramProgressCard {...base} />)),
      html(inHome(v2, <ProgramProgressCard {...base} currentLevel={25} />)),
      html(inHome(v2, <ProgramProgressCard {...base} state="locked_prereq" lockedHint="השלם את השאלון" onLockedHintTap={noop} />)),
      html(inHome(v2, <ProgramProgressCard {...base} state="not_started_master" lockedHint="לא מוצג" />)),
      html(inHome(v2, <ProgramProgressRow />)),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`program-progress-${vName(v2)}`));
  });
});
