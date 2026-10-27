/**
 * i18n batch av (namespaces `onboarding` + `profile`): non-component onboarding copy + progression config.
 * Snapshots recorded BEFORE the extraction from unmodified origin/main (JSON dumps of every output the
 * modules produce for display). The extraction must keep them byte-identical.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import {
  firstRunTourSteps,
  type FirstRunTourId,
} from '../services/first-run-tour';
import { TOUR_CATALOG, tourCatalogEntry } from '../services/tour-catalog';
import {
  chooseWhatNowCards,
  whatNowRouteCopy,
  WHATNOW_KELLY_CHIPS,
  FIRST_WORKOUT_NOTE,
  firstWorkoutNote,
  starterChipsFor,
} from '../services/entry-whatnow';
import {
  AGE_BRACKET_LABELS_HE,
  goalNoteExamples,
  goalNotePlaceholder,
  type AgeBracket,
} from '../utils/goal-note';
import { GOAL_OPTIONS, RUN_GOAL_OPTIONS, ALL_GOAL_OPTIONS } from '../utils/persona-goals';
import { MUSCLE_BALANCE_MESSAGES_HE } from '../utils/muscle-balance';
import { buildPlanContentRows, buildWeeklyVolumePattern, paceTargetRows } from '../utils/running-plan-shape';
import { resolveRunningScheduleCta } from '../utils/running-schedule-cta';
import { EMPTY_REMINDER_PLAN, runningReminderPlan } from '../utils/wizard-reminder-plan';
import { getMissingRequirements } from '../utils/required-setup';
import { buildPriorityGroups } from '../utils/priority-order';
import { V2_SKILL_GROUPS } from '../utils/skill-selection';
import { AREA_TILES } from '../utils/muscle-selection';
import { PROGRAM_CARD_LABELS_HE, MUSCLE_NAME_HE, SKILL_NAME_HE } from '../constants/program-path-labels.constants';
import {
  MUSCLE_CHIP_LABELS,
  SKILL_PROGRAMS,
  MUSCLE_PACKAGES,
} from '../constants/program-path.constants';
import { BUNDLED_GOAL_PHOTOS, GOAL_IMAGE_CONFIG } from '../constants/program-path-goal-images';
import { RUNNING_LABELS, STRENGTH_LABELS } from '../constants/onboarding-phases';
import { HEALTH_QUESTIONS, LEGAL_TEXT } from '../data/health-questions';
import { ENTRY_COPY } from '../components/steps/UnifiedLocation/entry-globe/entry-copy';
import { STAGE_TITLES, getStageTitle } from '@/features/user/progression/config/stage-titles';
import { LEVEL_STAGES, getLevelName } from '@/features/user/progression/config/lemur-stages';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

const snap = (name: string) => `./__snapshots__/av-i18n/${name}.json`;
const dump = (v: unknown) => JSON.stringify(v, null, 1) + '\n';

describe('av parity — services', () => {
  it('first-run tour steps, every tour x gender', async () => {
    const tours: FirstRunTourId[] = ['home', 'map', 'community', 'player', 'route', 'route-player', 'plan'];
    const out: Record<string, unknown> = {};
    for (const tour of tours) for (const gender of ['male', 'female', 'other', null] as const) out[`${tour}/${gender}`] = firstRunTourSteps(tour, gender);
    await expect(dump(out)).toMatchFileSnapshot(snap('first-run-tour'));
  });

  it('tour catalog', async () => {
    await expect(dump({ all: TOUR_CATALOG, unknown: tourCatalogEntry('nope' as never) })).toMatchFileSnapshot(snap('tour-catalog'));
  });

  it('what-now copy', async () => {
    const base = { minutes: 25.4, stops: 3, aerobicKind: 'running' } as never;
    const out = {
      near: chooseWhatNowCards({ nearestPark: { distanceM: 100 }, route: { minutes: 20, stops: 2, aerobicKind: 'walking' } } as never),
      far: chooseWhatNowCards({} as never),
      route: [
        whatNowRouteCopy(base, 'גינת סוטין'),
        whatNowRouteCopy({ minutes: 0.2, stops: null, aerobicKind: 'walking' } as never, null),
        whatNowRouteCopy({ minutes: 30, stops: 1, aerobicKind: 'walking' } as never, '  '),
      ],
      chips: [...WHATNOW_KELLY_CHIPS],
      starter: starterChipsFor('entry'),
      note: [FIRST_WORKOUT_NOTE, firstWorkoutNote(true, false), firstWorkoutNote(true, true)],
    };
    await expect(dump(out)).toMatchFileSnapshot(snap('entry-whatnow'));
  });
});

describe('av parity — utils', () => {
  it('goal note', async () => {
    const brackets: Array<AgeBracket | null> = ['under_18', '18_29', '30_44', '45_59', '60_plus', null];
    const out: Record<string, unknown> = { labels: AGE_BRACKET_LABELS_HE, placeholder: goalNotePlaceholder('לרדת במשקל') };
    for (const b of brackets) for (const g of ['male', 'female', 'other', undefined]) out[`${b}/${g}`] = goalNoteExamples(b, g);
    await expect(dump(out)).toMatchFileSnapshot(snap('goal-note'));
  });

  it('persona goals', async () => {
    await expect(dump({ GOAL_OPTIONS, RUN_GOAL_OPTIONS, ALL_GOAL_OPTIONS })).toMatchFileSnapshot(snap('persona-goals'));
  });

  it('muscle balance + selection + skills', async () => {
    await expect(dump({ MUSCLE_BALANCE_MESSAGES_HE, AREA_TILES, V2_SKILL_GROUPS })).toMatchFileSnapshot(snap('muscle-skill'));
  });

  it('running plan shape', async () => {
    const out: Record<string, unknown> = {};
    for (const goalPath of ['improve_time', 'maintain_fitness', 'start_running']) {
      out[`pace/${goalPath}`] = paceTargetRows({ goalPath, targetDistance: '10k', paceInputSeconds: 3000 });
      for (const [weeks, frequency, easyPaceLabel] of [[10, 3, '6:20–6:50'], [6, 2, null], [24, 4, null], [3, 1, null]] as const) {
        out[`rows/${goalPath}/${weeks}/${frequency}`] = buildPlanContentRows({
          goalPath, frequency, bars: buildWeeklyVolumePattern(weeks, true), easyPaceLabel,
        });
      }
    }
    await expect(dump(out)).toMatchFileSnapshot(snap('running-plan-shape'));
  });

  it('running schedule cta + reminder plan', async () => {
    const out: Record<string, unknown> = {};
    for (const isJIT of [false, true]) for (const isLastStep of [false, true]) for (const scheduleDaysSource of ['user-chosen', 'default']) {
      out[`cta/${isJIT}/${isLastStep}/${scheduleDaysSource}`] = resolveRunningScheduleCta({ isJIT, isLastStep, scheduleDaysSource });
    }
    out.empty = EMPTY_REMINDER_PLAN;
    out.one = runningReminderPlan({ runningScheduleDayIndices: [1], runningScheduleTime: '07:30' });
    out.three = runningReminderPlan({ runningScheduleDayIndices: [0, 2, 4] });
    await expect(dump(out)).toMatchFileSnapshot(snap('running-cta-reminder'));
  });

  it('required setup labels', async () => {
    const p = { equipment: { home: [], outdoor: [], office: [] }, core: { name: '' } } as unknown as UserFullProfile;
    const out = {
      strength: getMissingRequirements(p, 'strength', { requireIdentity: true }),
      running: getMissingRequirements(p, 'running'),
    };
    await expect(dump(out)).toMatchFileSnapshot(snap('required-setup'));
  });

  it('priority groups', async () => {
    const out = buildPriorityGroups({
      cardFocusOrder: ['health', 'skills'],
      muscleFocusIds: ['chest', 'back', 'glutes'],
      skillFocusIds: ['planche', 'front_lever'],
    } as never);
    await expect(dump(out)).toMatchFileSnapshot(snap('priority-order'));
  });
});

describe('av parity — constants + data', () => {
  it('program path constants', async () => {
    await expect(dump({
      PROGRAM_CARD_LABELS_HE, MUSCLE_NAME_HE, SKILL_NAME_HE, MUSCLE_CHIP_LABELS, SKILL_PROGRAMS, MUSCLE_PACKAGES,
      BUNDLED_GOAL_PHOTOS, GOAL_IMAGE_CONFIG,
    })).toMatchFileSnapshot(snap('program-path-constants'));
  });

  it('phase labels, health questions, entry copy, stage titles', async () => {
    await expect(dump({
      RUNNING_LABELS, STRENGTH_LABELS, HEALTH_QUESTIONS, LEGAL_TEXT,
      headline: {
        pre: ENTRY_COPY.headlinePre, goals: ENTRY_COPY.headlineGoals, need: ENTRY_COPY.headlineNeed, nothing: ENTRY_COPY.headlineNothing,
      },
      STAGE_TITLES, stage0: getStageTitle(0), stage11: getStageTitle(11),
      LEVEL_STAGES,
      names: [1, 9, 10, 11].map((l) => ['male', 'female', 'other'].map((g) => getLevelName(l, g as never))),
    })).toMatchFileSnapshot(snap('constants-misc'));
  });
});
