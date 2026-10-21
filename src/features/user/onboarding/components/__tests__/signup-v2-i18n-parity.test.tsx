// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, keys `signup.*`): the v2 signup sub-flows — snapshots recorded
 * BEFORE the extraction, from unmodified origin/main. The extraction commit must render the same
 * Hebrew markup.
 *
 * Covers running-v2 (goal / ability pickers, run count / days / week, the schedule flow, the plan
 * summary and its tiles), strength-v2 (count / week, the schedule flow), walking-v2 (goal / week,
 * the signup flow incl. its save error), add-track (week step, the flow's three error / success
 * paths), entry-whatnow (cards, drawer) and program-path (goal picker, skills step) — male / female,
 * every branch a prop or a tap reaches. jsdom + react-dom/client; framer-motion is replaced by plain
 * elements and the shared children from other areas (StickyActionButton, ReminderOptInStep,
 * AgendaDayCard, AerobicStrengthSlider, NotAloneCard, Sheet) are stubs that print the props this
 * extraction feeds them. `<!-- -->` is stripped before comparing (react-dom/server's separator
 * between adjacent text nodes; react-dom/client emits none — stripped anyway, same rule as the
 * static parity tests).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement, type ReactNode } from 'react';

const S = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  gender: 'male' as 'male' | 'female',
  uid: 'u1' as string | null,
  stepGoal: null as number | null,
  walkSaveFails: false,
  addTrackOk: true,
  router: { push: () => {}, replace: () => {}, back: () => {} },
  addCtx: null as unknown,
  week: null as unknown,
  keepWeek: null as unknown,
}));

vi.mock('framer-motion', async () => (await import('../steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({
  db: {},
  app: {},
  auth: {
    get currentUser() {
      return S.uid ? { uid: S.uid } : null;
    },
  },
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => S.router }));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: S.profile, refreshProfile: async () => {}, _hasHydrated: true });
  const useUserStore = (sel: (s: unknown) => unknown) => sel(state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/features/activity/store/useActivityStore', () => {
  const useActivityStore = (sel: (s: unknown) => unknown) => sel({ resolvedStepGoal: S.stepGoal });
  return { useActivityStore };
});
vi.mock('@/features/analytics/AnalyticsService', () => ({
  Analytics: new Proxy({}, { get: () => async () => {} }),
}));
vi.mock('@/lib/onboardingPrefs', () => ({
  setOnboardingPref: () => {},
  getOnboardingPref: () => null,
  getOnboardingPrefAsync: async () => null,
  removeOnboardingPref: () => {},
}));
vi.mock('@/features/schedule/services/reminderOptIn.service', () => ({
  getPushPermissionState: async () => 'unsupported',
  recordReminderDeferral: () => {},
  requestReminderPermission: async () => false,
  saveReminderOptIn: async () => {},
}));
vi.mock('@/features/user/onboarding/hooks/useWizardIdentity', () => ({
  useWizardIdentity: () => ({ gender: S.gender, firstName: '' }),
}));
vi.mock('@/features/schedule/walking/useNearbyWalkingGroup', () => ({ useNearbyWalkingGroup: () => null }));
vi.mock('@/features/schedule/walking/walkSave.service', () => ({
  saveWalkPlan: async () => {
    if (S.walkSaveFails) throw new Error('boom');
  },
}));
vi.mock('@/features/user/onboarding/hooks/useAddTrackContext', () => ({ useAddTrackContext: () => S.addCtx }));
vi.mock('@/features/schedule/add-track/addTrackWeek', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAddTrackWeek: (_input: unknown, _priority: unknown, keepOnly: boolean) => (keepOnly ? S.keepWeek : S.week),
}));
vi.mock('@/features/user/onboarding/services/add-track-save.service', () => ({
  saveAddTrackWeek: async () =>
    S.addTrackOk ? { ok: true, plan: { sessions: [{ dow: 0 }, { dow: 2 }, { dow: 4 }] } } : { ok: false, plan: null },
  saveAddTrackCalendarSync: async () => {},
}));
vi.mock('@/components/ui/StickyActionButton', () => ({
  default: (p: { label: string; disabled?: boolean; onPress: () => unknown }) => (
    <button data-stub="sticky" disabled={p.disabled} onClick={() => Promise.resolve(p.onPress()).catch(() => {})}>
      {p.label}
    </button>
  ),
}));
vi.mock('@/features/schedule/components/ReminderOptInStep', () => ({
  default: (p: { subtitle: string; sampleWorkoutName: string; sampleTime: string; sampleDetail?: string }) => (
    <div
      data-stub="reminder"
      data-subtitle={p.subtitle}
      data-sample={p.sampleWorkoutName}
      data-time={p.sampleTime}
      data-detail={p.sampleDetail ?? ''}
    />
  ),
}));
vi.mock('@/features/home/components/agenda/AgendaDayCard', () => ({
  default: (p: { date: string }) => <div data-stub="agenda" data-date={p.date} />,
}));
vi.mock('@/features/parks/core/components/hybrid/AerobicStrengthSlider', () => ({
  default: (p: { helperText?: string; aerobicShare: number }) => (
    <div data-stub="slider" data-helper={p.helperText ?? ''} data-share={p.aerobicShare} />
  ),
}));
vi.mock('@/features/schedule/walking/components/NotAloneCard', () => ({ default: () => <div data-stub="not-alone" /> }));
vi.mock('@/components/ui/v2', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Sheet: (p: { open: boolean; ariaLabel?: string; children?: ReactNode }) =>
    p.open ? (
      <div data-stub="sheet" data-aria={p.ariaLabel ?? ''}>
        {p.children}
      </div>
    ) : null,
}));

import { mount, type Mounted } from '../steps/__tests__/i18n-dom-harness';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import type { DynamicQuestionNode } from '@/features/user/onboarding/engine/DynamicOnboardingEngine';
import type { RunWeekDay, RunWeekRecommendation } from '@/features/schedule/utils/runWeekRecommendation';
import type { StrengthWeekRecommendation } from '@/features/schedule/utils/strengthWeekRecommendation';
import type { AddTrackWeekView } from '@/features/schedule/add-track/addTrackWeek';
import { chooseWhatNowCards, whatNowRouteCopy } from '@/features/user/onboarding/services/entry-whatnow';
import { GOAL_IMAGE_CONFIG, initialGoalImage } from '@/features/user/onboarding/constants/program-path-goal-images';
import { RunningAbilityPickerV2, RunningGoalPickerV2 } from '../running-v2/RunningChoiceV2';
import RunningPlanSummaryV2 from '../running-v2/RunningPlanSummaryV2';
import RunCountStep from '../running-v2/signup-schedule/RunCountStep';
import RunDaysStep from '../running-v2/signup-schedule/RunDaysStep';
import RunWeekStep from '../running-v2/signup-schedule/RunWeekStep';
import RunSignupScheduleFlow from '../running-v2/signup-schedule/RunSignupScheduleFlow';
import StrengthCountStep from '../strength-v2/signup-schedule/StrengthCountStep';
import StrengthWeekStep from '../strength-v2/signup-schedule/StrengthWeekStep';
import StrengthSignupScheduleFlow from '../strength-v2/signup-schedule/StrengthSignupScheduleFlow';
import WalkGoalStep from '../walking-v2/WalkGoalStep';
import WalkSignupFlow from '../walking-v2/WalkSignupFlow';
import AddTrackWeekStep from '../add-track/AddTrackWeekStep';
import AddTrackFlow from '../add-track/AddTrackFlow';
import WhatNowDrawer from '../entry-whatnow/WhatNowDrawer';
import ProgramPathV2View from '../program-path/ProgramPathV2View';
import ProgramPathSkillsStepV2 from '../program-path/ProgramPathSkillsStepV2';

const snap = (name: string) => `./__snapshots__/signup-v2-i18n/${name}.html`;
const noop = () => {};
const STORE_DEFAULTS = { ...useOnboardingStore.getState() };
let m: Mounted | null = null;

async function render(el: ReactElement): Promise<Mounted> {
  m?.unmount();
  m = await mount(el);
  return m;
}
const sticky = () => document.querySelector('[data-stub="sticky"]') as Element;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  S.profile = null;
  S.gender = 'male';
  S.uid = 'u1';
  S.stepGoal = null;
  S.walkSaveFails = false;
  S.addTrackOk = true;
  sessionStorage.clear();
  useOnboardingStore.setState({ ...STORE_DEFAULTS });
});
afterEach(() => {
  m?.unmount();
  m = null;
});

// ── running-v2 ─────────────────────────────────────────────────────────

const GOAL_Q = {
  id: 'q_run_goal',
  answers: [
    { id: 'a_run_goal_start', text: 'להתחיל לרוץ' },
    { id: 'a_run_goal_improve', text: 'לשפר זמן' },
    { id: 'a_run_goal_maintain', text: 'לשמור על כושר' },
    { id: 'a_other', text: 'אחר', imageUrl: 'https://x/y.png' },
  ],
} as unknown as DynamicQuestionNode;
const ABILITY_Q = {
  id: 'q_run_ability',
  answers: ['none', '5_15', '15_30', '30_45', '45_plus', 'bogus'].map((tier) => ({
    id: `a_${tier}`,
    text: `תשובה ${tier}`,
    metadata: { abilityTier: tier },
  })),
} as unknown as DynamicQuestionNode;
const answerText = (a: { text: string }) => a.text;

describe('RunningChoiceV2', () => {
  it('goal picker: with / without walking, male / female, picked / not', async () => {
    const out: string[] = [];
    for (const isFemale of [false, true]) {
      for (const walking of [undefined, { onChoose: noop }]) {
        for (const selected of [undefined, 'a_run_goal_improve', '__walking']) {
          out.push(
            (
              await render(
                <RunningGoalPickerV2
                  question={GOAL_Q}
                  title="מה המטרה?"
                  description="תיאור"
                  selectedAnswerId={selected}
                  onAnswer={noop}
                  answerText={answerText}
                  isFemale={isFemale}
                  walking={walking}
                />,
              )
            ).html(),
          );
        }
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('running-goal-picker'));
  });

  it('ability picker: male / female, picked / not', async () => {
    const out: string[] = [];
    for (const isFemale of [false, true]) {
      for (const selected of [undefined, 'a_15_30']) {
        out.push(
          (
            await render(
              <RunningAbilityPickerV2
                question={ABILITY_Q}
                title="ignored"
                selectedAnswerId={selected}
                onAnswer={noop}
                answerText={answerText}
                isFemale={isFemale}
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('running-ability-picker'));
  });
});

describe('Run signup steps', () => {
  it('count: recommended / other, with / without notes', async () => {
    const out: string[] = [];
    for (const frequency of [3, 4]) {
      for (const notes of [undefined, ['סיבה אחת', 'סיבה שתיים']]) {
        out.push(
          (
            await render(
              <RunCountStep
                recommendationTitle="3 ריצות"
                planLine="תוכנית 10 ק״מ · 8 שבועות"
                notes={notes}
                recommendedFrequency={3}
                frequency={frequency}
                onFrequency={noop}
                onNext={noop}
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('run-count'));
  });

  it('days: done / one left / several left, default and custom header', async () => {
    const out: string[] = [];
    const dates = [18, 19, 20, 21, 22, 23, 24];
    for (const days of [[0, 2, 4], [0, 2], [0]]) {
      for (const header of [{}, { title: 'מתי נצא להליכה?', subtitle: 'כותרת משנה' }]) {
        out.push(
          (
            await render(
              <RunDaysStep
                frequency={3}
                days={days}
                windows={{ 0: 'evening', 2: 'noon' }}
                dates={dates}
                onToggleDay={noop}
                onWindow={noop}
                onNext={noop}
                {...header}
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('run-days'));
  });

  it('week: long-run chips, rest vs not free, reasons, warnings', async () => {
    const week: RunWeekRecommendation = {
      days: [
        { dow: 0, slot: 'quality_primary', window: 'morning', reasonHe: 'סיבה' },
        { dow: 2, slot: 'easy_run', window: 'evening', reasonHe: null },
        { dow: 5, slot: 'long_run', window: 'noon', reasonHe: null },
      ],
      longRunDow: 5,
      warningsHe: ['אזהרה'],
    } as unknown as RunWeekRecommendation;
    const out: string[] = [];
    out.push((await render(<RunWeekStep subtitle="ריצה · מוכן" week={week} days={[0, 2, 3, 5]} dates={[1, 2, 3, 4, 5, 6, 7]} onLongRunDay={noop} onConfirm={noop} />)).html());
    out.push(
      (
        await render(
          <RunWeekStep subtitle="x" week={{ ...week, longRunDow: null, warningsHe: [] }} days={[0]} dates={[1, 2, 3, 4, 5, 6, 7]} onLongRunDay={noop} onConfirm={noop} />,
        )
      ).html(),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap('run-week'));
  });

  it('flow: every sub-step × plan distance', async () => {
    const out: string[] = [];
    for (const answers of [
      { targetDistance: '10k', runningPlanWeeks: 8 },
      { targetDistance: 'maintenance' },
      { targetDistance: '42k', runningPlanWeeks: 12 },
      {},
    ]) {
      sessionStorage.setItem('onboarding_running_answers', JSON.stringify(answers));
      for (const sub of [0, 1, 2, 3]) {
        out.push(`<!-- ${JSON.stringify(answers)} sub ${sub} -->`);
        out.push((await render(<RunSignupScheduleFlow sub={sub} setSub={noop} onDone={noop} />)).html());
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('run-flow'));
  });
});

describe('RunningPlanSummaryV2', () => {
  const weekDays: RunWeekDay[] = [
    { dow: 0, slot: 'quality_primary', window: 'morning', reasonHe: null },
    { dow: 3, slot: 'easy_run', window: 'evening', reasonHe: null },
    { dow: 5, slot: 'long_run', window: 'noon', reasonHe: null },
  ];
  it('create / view, maintenance title, with / without days and pace', async () => {
    const out: string[] = [];
    for (const answers of [
      { targetDistance: '10k', paceInputSeconds: 3000 },
      { targetDistance: 'maintenance' },
    ]) {
      for (const days of [weekDays, []]) {
        out.push(
          (
            await render(
              <RunningPlanSummaryV2
                answers={answers}
                distLabel="10 ק״מ"
                weeks={12}
                frequency={3}
                endDateShort="12.12"
                weekDays={days}
                timesLine="ערב 19:00"
                onEditDays={noop}
                onGenerate={noop}
              />,
            )
          ).html(),
        );
      }
    }
    out.push(
      (
        await render(
          <RunningPlanSummaryV2
            answers={{ targetDistance: '5k' }}
            distLabel="5 ק״מ"
            weeks={8}
            frequency={3}
            endDateShort="01.12"
            weekDays={weekDays}
            timesLine={null}
            mode="view"
            progress={{ currentWeek: 3, done: 5, dueSoFar: 7 }}
            onBack={noop}
          />,
        )
      ).html(),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap('run-summary'));
  });
});

// ── strength-v2 ────────────────────────────────────────────────────────

describe('Strength signup', () => {
  it('count step: every history pick, recommended / other', async () => {
    const out: string[] = [];
    for (const history of [null, 'none', '1-2', '3+'] as const) {
      for (const frequency of [3, 4]) {
        out.push(
          (
            await render(
              <StrengthCountStep
                recommendationTitle="3 ימים"
                whyLine="סיבה"
                notes={['הערה']}
                planLine="כוח · כל הגוף"
                recommendedFrequency={3}
                frequency={frequency}
                onFrequency={noop}
                history={history}
                onHistory={noop}
                question="שאלה"
                onNext={noop}
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('strength-count'));
  });

  it('week step: warning / full-recovery note / no note', async () => {
    const base = {
      days: [
        { dow: 0, items: ['FULL_BODY'], window: 'evening', minutes: 45, reasonHe: 'סיבה א' },
        { dow: 3, items: ['FULL_BODY'], window: 'morning', minutes: 45, reasonHe: '' },
      ],
      warningsHe: [],
      recoveryHours: 48,
    } as unknown as StrengthWeekRecommendation;
    const coming = Array.from({ length: 7 }, (_, i) => ({ dow: (i + 3) % 7, iso: `2026-10-${21 + i}` }));
    const out: string[] = [];
    for (const week of [
      base,
      { ...base, warningsHe: ['אזהרה'] },
      { ...base, days: [base.days[0], { ...base.days[1], dow: 1 }] },
    ]) {
      for (const frequency of [3, 7]) {
        out.push(
          (
            await render(
              <StrengthWeekStep
                subtitle="כוח · מוכן"
                week={week as StrengthWeekRecommendation}
                coming={coming as never}
                userId="u1"
                frequency={frequency}
                onFrequency={noop}
                onAddRun={noop}
                onConfirm={noop}
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('strength-week'));
  });

  it('flow: every sub-step × gender', async () => {
    const out: string[] = [];
    for (const gender of ['male', 'female'] as const) {
      S.gender = gender;
      for (const sub of [0, 1, 2]) {
        out.push(`<!-- ${gender} sub ${sub} -->`);
        out.push((await render(<StrengthSignupScheduleFlow sub={sub} setSub={noop} onConfirmed={noop} onAddRun={noop} />)).html());
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('strength-flow'));
  });
});

// ── walking-v2 ─────────────────────────────────────────────────────────

describe('Walking signup', () => {
  it('goal step: goals, step goal ≥ 1000, add-on 2 / 3 per week, on / off', async () => {
    const out: string[] = [];
    for (const goal of [null, 'steps', 'health'] as const) {
      for (const stepGoal of [null, 12345]) {
        for (const addOn of [null, { minutes: 10, perWeek: 2 }, { minutes: 15, perWeek: 3 }]) {
          out.push(
            (
              await render(
                <WalkGoalStep
                  goal={goal}
                  onGoal={noop}
                  comfort="short"
                  onComfort={noop}
                  stepGoal={stepGoal}
                  addOn={addOn as never}
                  addOnOn={addOn?.perWeek === 2}
                  onAddOn={noop}
                  onNext={noop}
                />,
              )
            ).html(),
          );
        }
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('walk-goal'));
  });

  it('flow: every sub-step, then the save error', async () => {
    const out: string[] = [];
    for (const sub of [0, 1, 2, 3]) {
      out.push(`<!-- sub ${sub} -->`);
      out.push((await render(<WalkSignupFlow sub={sub} setSub={noop} onDone={noop} />)).html());
    }
    S.walkSaveFails = true;
    const r = await render(<WalkSignupFlow sub={2} setSub={noop} onDone={noop} />);
    await r.click(sticky());
    out.push('<!-- save error -->', r.html());
    await expect(out.join('\n')).toMatchFileSnapshot(snap('walk-flow'));
  });
});

// ── add-track ──────────────────────────────────────────────────────────

const ADD_WEEK = {
  days: [
    { dow: 0, sessions: [{ kind: 'run', slot: 'quality_primary', nameHe: 'ריצת איכות', status: 'new', noteHe: 'חדש כי' }] },
    { dow: 1, sessions: [] },
    { dow: 2, sessions: [{ kind: 'strength', slug: 'full_body', nameHe: 'כל הגוף', status: 'moved', fromDow: 1, noteHe: 'הוזז: ב׳' }] },
    { dow: 3, sessions: [{ kind: 'strength', slug: 'upper_body', nameHe: 'פלג עליון', status: 'kept', noteHe: 'נשאר' }] },
    { dow: 4, sessions: [{ kind: 'run', slot: 'long_run', nameHe: 'ארוכה', status: 'kept', noteHe: null }] },
    { dow: 5, sessions: [] },
    { dow: 6, sessions: [] },
  ],
  titleHe: 'נוסיף ריצה',
  newCount: 1,
  movedCount: 1,
  warningsHe: ['אזהרה'],
  plan: {},
} as unknown as AddTrackWeekView;

describe('Add track', () => {
  it('week step: both tracks × keep-only × error / warnings', async () => {
    const out: string[] = [];
    for (const added of ['running', 'strength'] as const) {
      for (const keepOnly of [false, true]) {
        for (const priority of ['strength_first', 'run_first', 'balanced'] as const) {
          out.push(
            (
              await render(
                <AddTrackWeekStep
                  added={added}
                  week={ADD_WEEK}
                  dates={[1, 2, 3, 4, 5, 6, 7]}
                  times={{ run: '07:00', strength: '19:00' }}
                  priority={priority}
                  share={0.5}
                  onShare={noop}
                  keepOnly={keepOnly}
                  onToggleKeepOnly={keepOnly || priority === 'balanced' ? noop : null}
                  error={keepOnly ? 'שגיאה' : null}
                  onConfirm={noop}
                />,
              )
            ).html(),
          );
        }
      }
    }
    out.push(
      (
        await render(
          <AddTrackWeekStep
            added="running"
            week={{ ...ADD_WEEK, newCount: 0, warningsHe: [] }}
            dates={[1, 2, 3, 4, 5, 6, 7]}
            times={{ run: '07:00', strength: '19:00' }}
            priority="strength_first"
            share={0.3}
            onShare={noop}
            keepOnly={false}
            onToggleKeepOnly={null}
            error={null}
            onConfirm={noop}
          />,
        )
      ).html(),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap('add-track-week'));
  });

  function Host({ added }: { added: 'running' | 'strength' }) {
    const [sub, setSub] = useState(0);
    return <AddTrackFlow added={added} sub={sub} setSub={setSub} onDone={noop} />;
  }

  it('flow: loading, no account, save failed, saved → reminders (both tracks)', async () => {
    S.week = ADD_WEEK;
    S.keepWeek = { ...ADD_WEEK, movedCount: 0 };
    const out: string[] = [];
    S.addCtx = null;
    out.push('<!-- loading -->', (await render(<Host added="running" />)).html());
    S.addCtx = {
      input: {},
      existingStrengthIds: {},
      newStrengthIds: [],
      times: { run: '07:00', strength: '19:00' },
      isStrengthId: () => false,
    };
    for (const added of ['running', 'strength'] as const) {
      S.uid = null;
      S.addTrackOk = true;
      const r = await render(<Host added={added} />);
      await r.click(sticky());
      out.push(`<!-- ${added}: no account -->`, r.html());
      S.uid = 'u1';
      S.addTrackOk = false;
      await r.click(sticky());
      out.push(`<!-- ${added}: save failed -->`, r.html());
      S.addTrackOk = true;
      await r.click(sticky());
      out.push(`<!-- ${added}: saved -->`, r.html());
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('add-track-flow'));
  });
});

// ── entry-whatnow ──────────────────────────────────────────────────────

describe('WhatNowDrawer', () => {
  it('near park (route first) / far (plan tagged), Kelly on / off, closed', async () => {
    const out: string[] = [];
    const route = { minutes: 30, stops: 2, aerobicKind: 'walking' as const };
    for (const near of [true, false]) {
      const layout = chooseWhatNowCards({ nearestPark: near ? { name: 'גינה', distanceM: 200 } : null, route });
      for (const showKelly of [true, false]) {
        out.push(
          (
            await render(
              <WhatNowDrawer
                open
                layout={layout}
                routeCopy={near ? whatNowRouteCopy(route, 'גינה') : null}
                routeMapUrl={null}
                showKelly={showKelly}
                onAnswer={noop}
              />,
            )
          ).html(),
        );
      }
    }
    const layout = chooseWhatNowCards({ nearestPark: null, route: null });
    out.push((await render(<WhatNowDrawer open={false} layout={layout} routeCopy={null} routeMapUrl={null} showKelly onAnswer={noop} />)).html());
    await expect(out.join('\n')).toMatchFileSnapshot(snap('whatnow'));
  });
});

// ── program-path ───────────────────────────────────────────────────────

describe('Program path v2', () => {
  const images = (g: 'male' | 'female') => ({
    health: initialGoalImage(GOAL_IMAGE_CONFIG[g].health),
    body_focus: initialGoalImage(GOAL_IMAGE_CONFIG[g].body_focus),
    skills: initialGoalImage(GOAL_IMAGE_CONFIG[g].skills),
  });

  it('goal picker: every goal × gender, area tiles, balance note', async () => {
    const out: string[] = [];
    for (const isFemale of [false, true]) {
      for (const selectedGoal of [null, 'health', 'body_focus', 'skills'] as const) {
        out.push(
          (
            await render(
              <ProgramPathV2View
                isFemale={isFemale}
                selectedGoal={selectedGoal}
                onSelectGoal={noop}
                images={images(isFemale ? 'female' : 'male')}
                areaTiles={['upper']}
                onPickAreaTile={noop}
                showMuscleRecommendation={selectedGoal === 'body_focus'}
                muscleBalanceCase={selectedGoal === 'body_focus' ? 'upper_only' : null}
                recommendedTiles={new Set(['legs'] as const)}
                goalNote=""
                onGoalNoteChange={noop}
                noteExamples={['דוגמה']}
                totalSegments={4}
                currentSegment={2}
                onBack={noop}
                onContinue={noop}
                canContinue={selectedGoal !== null}
                continueLabel="המשך"
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('program-path-goal'));
  });

  it('skills step: gender × push / pull tip, not-ready skill, master', async () => {
    const out: string[] = [];
    for (const isFemale of [false, true]) {
      for (const missing of [null, 'push', 'pull'] as const) {
        out.push(
          (
            await render(
              <ProgramPathSkillsStepV2
                isFemale={isFemale}
                selectedSkills={missing ? ['front_lever'] : ['calisthenics_upper']}
                toggleSkill={noop}
                readySkillIds={missing === 'pull' ? new Set<string>() : null}
                showRecommendation={missing !== null}
                missingCategory={missing}
                totalSegments={4}
                currentSegment={3}
                onBack={noop}
                onContinue={noop}
                canContinue
                continueLabel="המשך"
              />,
            )
          ).html(),
        );
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('program-path-skills'));
  });
});
