/**
 * i18n wave 2 (namespace `player`, keys `strengthSummary.*` / `dopamine.*`): the strength post-workout
 * screens — StrengthSummaryView (v1 and v2 / enable_home_v2 branches) with its shared children
 * (LevelGoalsChecklist, ProgramSuggestionCard, LifestyleCTA, EmailCaptureDrawer, LevelUpModal), the v2
 * sections (StrengthSummaryV2Sections, TimedResultCardsV2) and StrengthDopamineScreen.
 * The snapshots below were recorded BEFORE the extraction from unmodified origin/main.
 *
 * Static markup (react-dom/server, node env). `<!-- -->` is stripped before comparing (react-dom/server's
 * separator between adjacent text nodes — `רמה {n}` is two nodes before, one `t()` string after; not
 * rendered text). React `useId` ids are normalised. StrengthDopamineScreen's status line changes only
 * in timers after mount (effects don't run in a static render) — those strings are pinned by the key
 * test (src/lib/i18n/__tests__/player-strength-summary-he.test.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/content/programs/core/program.service', () => ({ getProgramByTemplateId: async () => null }));
vi.mock('@/features/user/onboarding/components/steps/AccountSecureStep', () => ({
  default: () => <div data-stub="account-secure" />,
}));
vi.mock('@/features/generation-review/components/ReportProblemButton', () => ({
  default: () => <div data-stub="report-problem" />,
}));

import StrengthSummaryView, { type StrengthSummaryV2Data, type StrengthSummaryViewProps } from '../StrengthSummaryView';
import StrengthDopamineScreen from '../StrengthDopamineScreen';
import LevelGoalsChecklist from '../components/LevelGoalsChecklist';
import ProgramSuggestionCard from '../components/ProgramSuggestionCard';
import LifestyleCTA from '../components/LifestyleCTA';
import EmailCaptureDrawer from '../components/EmailCaptureDrawer';
import LevelUpModal from '../components/LevelUpModal';
import TimedResultCardsV2 from '../components/v2/TimedResultCardsV2';
import { PhaseBreakdownV2, SummaryHeroV2, StreakCardV2 } from '../components/v2/StrengthSummaryV2Sections';
import type { ExerciseSummary, PhaseSummary, SessionTotals } from '../utils/phase-summary';
import type { TimedBlockRecord } from '@/features/workout-engine/engines/timed/timed-record';

const html = (el: ReactElement) =>
  renderToStaticMarkup(el)
    .replaceAll('<!-- -->', '')
    .replace(/done-[A-Za-z0-9]+/g, 'done-ID')
    .replace(/:R[A-Za-z0-9]*:/g, ':ID:');
const snap = (name: string) => `./__snapshots__/strength-summary-i18n/${name}.html`;
const noop = () => {};
const noopAsync = async () => {};

// ── fixtures ────────────────────────────────────────────────────────────────

const ex = (key: string, over: Partial<ExerciseSummary> = {}): ExerciseSummary => ({
  key,
  name: `תרגיל ${key}`,
  unit: 'reps',
  plannedSets: 3,
  doneSets: 3,
  total: 30,
  sets: [
    { done: 10, target: 10, mark: 'full' },
    { done: 10, target: 10, mark: 'full' },
    { done: 8, target: 10, mark: 'partial' },
  ],
  status: 'done',
  improvedBy: null,
  best: 10,
  previousBest: null,
  ...over,
});

const totals = (over: Partial<SessionTotals> = {}): SessionTotals => ({
  setsDone: 17,
  setsPlanned: 18,
  reps: 168,
  workSeconds: 0,
  exercisesDone: 6,
  exercisesTotal: 6,
  completionPercent: 94,
  ...over,
});

const PHASES: PhaseSummary[] = [
  {
    phase: 'warmup',
    blocks: [{ id: 'w1', title: 'חימום כללי', exercises: [ex('w', { sets: [{ done: 30, target: 30, mark: 'full' }], unit: 'seconds' })] }],
    totals: { setsDone: 1, setsPlanned: 1, reps: 0, workSeconds: 30, exercisesDone: 1, exercisesTotal: 1 },
  },
  {
    phase: 'main',
    blocks: [
      { id: 'm1', title: 'בלוק א', protocol: 'superset', exercises: [ex('a', { improvedBy: 2, best: 12, previousBest: 10 }), ex('b')] },
      { id: 'm2', title: '', exercises: [ex('c', { status: 'skipped', doneSets: 0, sets: [] })] },
      { id: 'm3', title: '', protocol: 'pyramid', exercises: [ex('d')] },
      { id: 'm4', title: 'סיום', protocol: 'unknown_proto', exercises: [ex('e')] },
    ],
    totals: { setsDone: 12, setsPlanned: 13, reps: 150, workSeconds: 0, exercisesDone: 4, exercisesTotal: 5 },
  },
  {
    phase: 'cooldown',
    blocks: [{ id: 'c1', title: '', exercises: [ex('s1'), ex('s2')] }],
    totals: { setsDone: 4, setsPlanned: null, reps: 18, workSeconds: 0, exercisesDone: 2, exercisesTotal: 2 },
  },
];

const AMRAP: TimedBlockRecord = {
  protocol: 'amrap', segmentId: 's1', plannedSec: 600, activeSec: 600,
  amrap: { fullRounds: 4, partialReps: 16, partialTarget: 34, roundTimesSec: [131, 140, 152, 149] },
};
const AMRAP_ONE: TimedBlockRecord = {
  protocol: 'amrap', segmentId: 's2', plannedSec: 300, activeSec: 300,
  amrap: { fullRounds: 1, partialReps: 0, partialTarget: 0, roundTimesSec: [280] },
};
const AMRAP_LATE: TimedBlockRecord = {
  protocol: 'amrap', segmentId: 's3', plannedSec: 1200, activeSec: 1200,
  amrap: { fullRounds: 11, partialReps: 5, partialTarget: 0, roundTimesSec: [] },
};
const EMOM: TimedBlockRecord = {
  protocol: 'emom', segmentId: 's4', plannedSec: 240, activeSec: 240,
  emom: {
    minutes: [
      { status: 'done', reps: 10, workSec: 42 },
      { status: 'partial', reps: 8, workSec: null, target: 10 },
      { status: 'missed', reps: null, workSec: null },
      { status: 'done', reps: 10, workSec: 50 },
    ],
  },
};
const EMOM_NOTE_NO_TARGET: TimedBlockRecord = {
  protocol: 'emom', segmentId: 's5', plannedSec: 120, activeSec: 120,
  emom: { minutes: [{ status: 'partial', reps: null, workSec: null }, { status: 'missed', reps: null, workSec: null }] },
};
const TABATA: TimedBlockRecord = {
  protocol: 'tabata', segmentId: 's6', plannedSec: 240, activeSec: 240, tabata: { intervals: 7, intervalsTotal: 8 },
};

const GOALS = [
  { id: 'g1', exerciseName: 'מתח', targetValue: 12, unit: 'reps', label: '12 מתח', progressBonus: 5, achieved: true, bestValue: 12 },
  { id: 'g2', exerciseName: 'פלאנק', targetValue: 60, unit: 'seconds', label: 'פלאנק דקה', progressBonus: undefined, achieved: false, bestValue: 40 },
] as never[];

const SUGGESTIONS = [
  { ruleId: 'r1', targetProgramId: 'pull_up' },
  { ruleId: 'r2', targetProgramId: 'handstand' },
] as never[];

const progressionResult = (leveledUp: boolean) =>
  ({
    success: true,
    activeProgramGain: {
      programId: 'upper_body', baseGain: 4, bonusGain: 1, goalBonusGain: 2, masteryBonusGain: 0,
      totalGain: 7, newPercent: leveledUp ? 3 : 71, leveledUp, newLevel: leveledUp ? 8 : 7,
    },
    linkedProgramGains: [],
    volumeBreakdown: { setsPerformed: 17, requiredSets: 18, volumeRatio: 0.94, isFullVolume: false },
    sessionCompletionPercent: 94,
    goalProgress: [],
    muscleGroupProgress: [],
    trackWriteSucceeded: true,
  }) as never;

function viewProps(opts: {
  v2?: StrengthSummaryV2Data;
  isReadOnly?: boolean;
  isFinishing?: boolean;
  withDelete?: boolean;
  email?: 'closed' | 'intro' | 'inline';
  levelUp?: boolean;
  suggestions?: number;
  lifestyle?: boolean;
  goals?: boolean;
  programName?: string;
}): StrengthSummaryViewProps {
  return {
    programName: opts.programName ?? 'כוח פלג גוף עליון',
    programId: 'upper_body',
    maxLevel: 25,
    isReadOnly: opts.isReadOnly ?? false,
    completedExercises: [
      { id: 'e1', name: 'סיבובי כתפיים', category: 'warmup', sets: [20], totalReps: 20 },
      { id: 'e2', name: 'מתח אוסטרלי', category: 'main', sets: [12, 12, 10], totalReps: 34, isPersonalRecord: true },
    ],
    analytics: {
      calories: 286, formattedDuration: '38:12', streak: 4, streakFlameType: 'micro',
      liveLevel: 7, livePercent: 64, weeklyStrengthSessions: 2, weeklyGoalSessions: 3,
      coins: 0, daysWithActivity: 4, weeklyMinutes: 142, groupedExercises: {},
    },
    xp: {
      xpStatus: 'awarded', xpEarnedAmount: 120, xpControls: { start: noopAsync, set: noop },
      streakChainReady: false, runAwardXP: noopAsync,
    },
    progression: {
      progressionResult: progressionResult(!!opts.levelUp),
      showLevelUpModal: !!opts.levelUp,
      setShowLevelUpModal: noop,
    },
    email: {
      showEmailDrawer: (opts.email ?? 'closed') !== 'closed',
      showInlineAccount: opts.email === 'inline',
      setShowInlineAccount: noop,
      handleEmailCaptured: noopAsync,
      dismissEmailDrawer: noop,
    },
    evaluatedGoals: opts.goals === false ? [] : GOALS,
    visibleSuggestions: SUGGESTIONS.slice(0, opts.suggestions ?? 0),
    onAcceptSuggestion: noop,
    onDismissSuggestion: noop,
    showLifestyleCTA: !!opts.lifestyle,
    onScheduleLifestyle: noop,
    onDismissLifestyle: noop,
    ...(opts.withDelete ? { onDelete: noop } : {}),
    isFinishing: !!opts.isFinishing,
    onPrimaryAction: noop,
    ...(opts.v2 ? { v2: opts.v2 } : {}),
  } as unknown as StrengthSummaryViewProps;
}

const V2: StrengthSummaryV2Data = {
  phases: PHASES,
  timedResults: [AMRAP, AMRAP_ONE, AMRAP_LATE, EMOM, EMOM_NOTE_NO_TARGET, TABATA],
  totals: totals(),
  week: { categoryLabel: 'אימוני כוח השבוע', sessions: 2, plannedSessions: 3, minutes: 142, whoMinutes: 150 },
  streakWeek: {
    days: [
      { label: 'א', state: 'done' },
      { label: 'ב', state: 'today' },
    ] as never,
    best: 6,
  },
};

// ── StrengthSummaryView ─────────────────────────────────────────────────────

describe('StrengthSummaryView', () => {
  it('v1 (enable_home_v2 off): live, read-only, finishing, with every overlay', async () => {
    const out = [
      html(<StrengthSummaryView {...viewProps({ suggestions: 1, lifestyle: true, email: 'intro', levelUp: true })} />),
      html(<StrengthSummaryView {...viewProps({ isFinishing: true, suggestions: 2, email: 'inline' })} />),
      html(<StrengthSummaryView {...viewProps({ isReadOnly: true, withDelete: true, goals: false })} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('view-v1'));
  });

  it('v2 (enable_home_v2 on): live + history, timed cards, empty breakdown', async () => {
    const out = [
      html(<StrengthSummaryView {...viewProps({ v2: V2, suggestions: 2, lifestyle: true, levelUp: true })} />),
      html(<StrengthSummaryView {...viewProps({ v2: V2, isFinishing: true })} />),
      html(
        <StrengthSummaryView
          {...viewProps({
            v2: { phases: [], totals: totals({ reps: 0, workSeconds: 95, setsPlanned: null, completionPercent: null }), week: null, streakWeek: null },
            isReadOnly: true,
            withDelete: true,
          })}
        />,
      ),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('view-v2'));
  });
});

// ── v2 sections on their own (states the full view doesn't reach) ───────────

describe('v2 sections', () => {
  it('hero: reps / work seconds / nothing, calories 0', async () => {
    const out = [
      html(<SummaryHeroV2 formattedDuration="12:00" calories={0} totals={totals({ reps: 0, workSeconds: 0 })} phases={PHASES} />),
      html(<SummaryHeroV2 formattedDuration="12:00" calories={1234} totals={totals({ reps: 0, workSeconds: 3725 })} phases={PHASES} />),
      html(<SummaryHeroV2 formattedDuration="1:02:00" calories={99} totals={totals({ reps: 1234, setsPlanned: null })} phases={PHASES} />),
      html(<StreakCardV2 streak={3} best={5} days={V2.streakWeek!.days} week={V2.week} />),
      html(<PhaseBreakdownV2 phases={PHASES} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('v2-sections'));
  });

  it('timed cards', async () => {
    await expect(html(<TimedResultCardsV2 results={V2.timedResults!} />)).toMatchFileSnapshot(snap('timed-cards'));
  });
});

// ── shared children ─────────────────────────────────────────────────────────

describe('shared children', () => {
  it('goals, suggestions, lifestyle, email, level-up', async () => {
    const out = [
      html(<LevelGoalsChecklist evaluatedGoals={GOALS} />),
      html(<ProgramSuggestionCard suggestions={SUGGESTIONS.slice(0, 1)} onAccept={noop} onDismiss={noop} />),
      html(<ProgramSuggestionCard suggestions={SUGGESTIONS} onAccept={noop} onDismiss={noop} />),
      html(<LifestyleCTA onSchedule={noop} onDismiss={noop} />),
      html(<EmailCaptureDrawer isOpen showInlineAccount={false} onShowInlineAccount={noop} onCapture={noop} onDismiss={noop} />),
      html(<LevelUpModal isOpen programName="כוח" newLevel={12} onClose={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('children'));
  });
});

// ── StrengthDopamineScreen ──────────────────────────────────────────────────

describe('StrengthDopamineScreen', () => {
  it('first frame: default / custom celebration, loading / data', async () => {
    const bonuses = [{ id: 'b1', label: '+3% השלמה', percentage: 3, position: 'top-right' as const }];
    const out = [
      html(<StrengthDopamineScreen initialProgress={40} currentLevel={7} programName="אימון כוח" enableHaptics={false} />),
      html(
        <StrengthDopamineScreen
          initialProgress={95}
          currentLevel={12}
          programName="כוח פלג גוף עליון"
          bonuses={bonuses}
          volumeBreakdown={{ setsPerformed: 18, requiredSets: 18, isFullVolume: true }}
          celebrationMessage="הודעה מהניהול"
          enableHaptics={false}
        />,
      ),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('dopamine'));
  });
});
