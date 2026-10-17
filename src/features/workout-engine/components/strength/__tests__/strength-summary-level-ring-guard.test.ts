import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// G8.2 summary guard, rendered for real: StrengthSummaryView (design-v2 4a, #305) server-rendered
// to static markup (node env, no jsdom — same approach as ui/v2's render tests; .ts +
// createElement so no vitest include change is needed). The level ring repeats the program
// name, so with a unique name: 2 occurrences = header + ring, 1 = header only (ring hidden).

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import StrengthSummaryView from '../StrengthSummaryView';

const PROGRAM = 'תוכנית-בדיקה-G82';
const noop = () => {};
const noopAsync = async () => {};

function render(opts: { isReadOnly?: boolean; skipped?: 'no_questionnaire'; gained?: boolean }) {
  // skipped: the exact shape processWorkoutCompletion returns when it skips
  // (skippedNoQuestionnaireResult). gained: the same shape with a real gain (flag OFF / assessed).
  const progressionResult = opts.skipped || opts.gained
    ? ({
        success: true,
        ...(opts.skipped ? { skipped: opts.skipped } : {}),
        activeProgramGain: {
          programId: 'full_body', baseGain: opts.gained ? 4.2 : 0, bonusGain: 0, goalBonusGain: 0,
          masteryBonusGain: 0, totalGain: opts.gained ? 4.2 : 0, newPercent: opts.gained ? 68 : 0, leveledUp: false,
        },
        linkedProgramGains: [],
        volumeBreakdown: { setsPerformed: 0, requiredSets: 0, volumeRatio: 0, isFullVolume: false },
        sessionCompletionPercent: 0,
        goalProgress: [],
        muscleGroupProgress: [],
        trackWriteSucceeded: true,
      } as any)
    : null;
  const props: any = {
    programName: PROGRAM,
    programId: 'upper_body',
    maxLevel: 25,
    isReadOnly: opts.isReadOnly ?? false,
    completedExercises: [],
    analytics: {
      calories: 286, formattedDuration: '38:12', streak: 4, streakFlameType: 'micro',
      liveLevel: 7, livePercent: 64, weeklyStrengthSessions: 2, weeklyGoalSessions: 3,
      coins: 0, daysWithActivity: 4, weeklyMinutes: 142, groupedExercises: [],
    },
    xp: {
      xpStatus: 'awarded', xpEarnedAmount: 120, xpControls: { start: noopAsync, set: noop },
      streakChainReady: false, runAwardXP: noopAsync,
    },
    progression: { progressionResult, showLevelUpModal: false, setShowLevelUpModal: noop },
    email: {
      showEmailDrawer: false, showInlineAccount: false, setShowInlineAccount: noop,
      handleEmailCaptured: noopAsync, dismissEmailDrawer: noop,
    },
    evaluatedGoals: [],
    visibleSuggestions: [],
    onAcceptSuggestion: noop,
    onDismissSuggestion: noop,
    showLifestyleCTA: false,
    onScheduleLifestyle: noop,
    onDismissLifestyle: noop,
    isFinishing: false,
    onPrimaryAction: noop,
  };
  return renderToStaticMarkup(createElement(StrengthSummaryView, props));
}

const count = (html: string) => html.split(PROGRAM).length - 1;

describe('StrengthSummaryView — G8.2 level-ring guard', () => {
  it('normal live summary (progression ran / flag OFF): header + level ring', () => {
    expect(count(render({}))).toBe(2);
  });
  it('progression skipped — no questionnaire (flag ON): the ring is hidden, the header stays', () => {
    expect(count(render({ skipped: 'no_questionnaire' }))).toBe(1);
  });
  it('history view: ring hidden as before', () => {
    expect(count(render({ isReadOnly: true }))).toBe(1);
  });
});

// G8.2 follow-up (17.10.2026): the gain card ("פירוט התקדמות", +X%) follows the ring.
const GAIN_CARD = 'פירוט התקדמות';

describe('StrengthSummaryView — G8.2 gain-card guard', () => {
  it('real progression (flag OFF / assessed user): gain card shown, as before', () => {
    const html = render({ gained: true });
    expect(html).toContain(GAIN_CARD);
    expect(html).toContain('+4.2%');
    expect(count(html)).toBe(2); // ring too
  });
  it('progression skipped — no questionnaire (flag ON): no "+0.0%" gain card, no ring', () => {
    const html = render({ skipped: 'no_questionnaire' });
    expect(html).not.toContain(GAIN_CARD);
    expect(html).not.toContain('+0.0%');
    expect(count(html)).toBe(1);
  });
  it('history view: gain card hidden as before', () => {
    expect(render({ isReadOnly: true, gained: true })).not.toContain(GAIN_CARD);
  });
});
