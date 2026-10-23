/**
 * i18n wave 3B — parity of every call site that moved its unit strings ("ק״מ", "דק׳", "שע׳", "מ׳", "צעדים", …) and
 * weekday names (long "ראשון" / short "א׳" / letter "א") into the `common` catalog (keys `units.*`, `weekdays.*`).
 *
 * `fixtures/units-weekdays-wave3b-before.json` was recorded from UNMODIFIED origin/main (RECORD_W3B_PARITY=1);
 * this test replays the same inputs against the migrated code and requires byte-identical output.
 * The clock and the time zone are pinned: CI runs in UTC, the app in Asia/Jerusalem (PR #744).
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatDistanceKm, formatEta, groupedRowLines } from '@/features/parks/core/services/search-groups';
import { formatBannerDistance } from '@/features/parks/core/services/nav-banner';
import { formatMinutes as hybridMinutes } from '@/features/parks/core/components/hybrid/hybrid-format';
import getDistanceStr from '@/features/parks/lib/distance-str';
import { buildShareTemplateData, formatDurationMin, type ShareImageInput } from '@/features/social/services/share-image';
import { cardioPostStats } from '@/features/social/services/feed-cardio-stats';
import { buildShareModel, shareDateLabel } from '@/features/social/share-v2/model';
import { consistencyDay, missedLine } from '@/features/progression-hub/v2/utils/consistency-days';
import { compareHeadline, compareRows } from '@/features/progression-hub/v2/utils/period-compare';
import { formatMinutes as hubMinutes, relativeDay } from '@/features/progression-hub/v2/utils/progress-format';
import { RUN_DIST_LABEL } from '@/features/progression-hub/v2/utils/running-plan-progress';
import { recommendWalkPlan, stepGapWalk, walkTargetLabelHe } from '@/features/schedule/walking/walkPlan';
import {
  plannedWalkTargetHe, walkPieceSubtitle, walkRampLine, walkRecommendationTitle, walkStepsHint, walkWeekDays, walkWeekSubtitle,
} from '@/features/schedule/walking/walkWeekView';
import { whenLabelHe } from '@/features/schedule/walking/nearbyWalkingGroup';
import { REMINDER_LEAD_OPTIONS, reminderPreviewTitle } from '@/features/schedule/utils/reminderOptIn';
import { detailLineHe } from '@/features/schedule/week-builder/adapters/shared';
import { DAY_LABELS as GROUP_DAY_LABELS } from '@/features/arena/components/group-details/utils/group-details-logic';
import { DAYS, DAYS_FULL } from '@/features/arena/components/create-group-wizard/wizard-constants';
import { groupScheduleLabel } from '@/features/search/providers/community';
import { buildWeekDots, weekDotsFromStates } from '@/components/ui/v2/summary';
import { renderScheduleReasonHe, type ScheduleReason } from '@/features/schedule/engine/reasons';
import { dayNameHe, renderV2ReasonHe, type V2Reason } from '@/features/schedule/engine-v2/reasonsV2';
import { bucketTooltipLabel } from '@/features/activity/lib/steps-analytics.logic';
import { dayLettersLine, recommendationTitle } from '@/features/schedule/utils/runWeekRecommendation';

const FIXTURE = path.resolve(__dirname, 'fixtures/units-weekdays-wave3b-before.json');
const RECORD = process.env.RECORD_W3B_PARITY === '1';
const originalTz = process.env.TZ;
const NOW = new Date('2026-10-24T10:00:00+03:00'); // Saturday

const KM = [0, 1, 2, 10, 0.05, 0.5, 0.95, 0.999, 99.95, 99.99, 100, 120.4, 999, 1000, 12.34, 1234.5];
const METERS = [0, 1, 50, 99, 99.5, 100, 149, 150, 999, 1000, 1049, 1500, 12345, -5, Number.NaN];
const MINUTES = [0, 1, 5, 59, 60, 61, 120, 599, 600, 601, 1000, 1234];
const STEPS = [0, 1, 99, 1000, 2400, 3300, 12345];
const DAYS7 = [0, 1, 2, 3, 4, 5, 6];

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const record = (key: string, fn: () => unknown) => {
    try { out[key] = fn(); } catch (e) { out[key] = `THROWS ${(e as Error).constructor.name}`; }
  };

  for (const km of [...KM, null, undefined, -1, Number.NaN, Infinity]) {
    record(`searchDistance ${String(km)}`, () => formatDistanceKm(km as number));
    record(`groupedRow route ${String(km)}`, () => groupedRowLines({ _source: 'route', text: 'שדרות הרצל · תל אביב', routeKm: km as number } as never));
  }
  record('groupedRow park', () => groupedRowLines({ _source: 'park', text: 'גינת הרצל · תל אביב' } as never));
  for (const m of [...MINUTES, null, 1.5, 719]) {
    record(`eta ${String(m)}`, () => formatEta(m as number));
    record(`hubMinutes ${String(m)}`, () => hubMinutes(m as number));
  }
  for (const m of METERS) {
    record(`banner ${m}`, () => formatBannerDistance(m));
    record(`distanceStr ${m}`, () => getDistanceStr(m));
  }
  for (const s of [undefined, 0, 1, 29, 30, 31, 59, 60, 89, 90, 120, 3600]) record(`hybridMinutes ${s}`, () => hybridMinutes(s));

  // share image (canvas data) + share v2 model
  const cardio = (over: Partial<ShareImageInput>): ShareImageInput => ({ kind: 'cardio', durationMinutes: 30, ...over });
  for (const km of [undefined, 0, 1, 5.04, 10, 12.34, 1234.5]) {
    for (const pace of [undefined, 0, 300, 330, 599]) {
      const input = cardio({ distanceKm: km, paceSecPerKm: pace, streakDays: 3, parkName: 'פארק', dateMs: NOW.getTime() });
      for (const tpl of ['run-stats', 'run-clean', 'run-route']) record(`shareData ${km} ${pace} ${tpl}`, () => buildShareTemplateData(input, tpl));
      record(`shareModel ${km} ${pace}`, () => buildShareModel({ ...input, paceSplits: [300, 310], routeShape: [0, 0, 1, 1, 2, 2] } as never));
    }
  }
  for (const min of [0, 1, 59, 60, 61, 125, 1000]) {
    record(`formatDurationMin ${min}`, () => formatDurationMin(min));
    record(`shareData strength ${min}`, () => buildShareTemplateData({ kind: 'strength', durationMinutes: min, streakDays: 4, totalSets: 12, totalReps: 90, topExercises: [] } as never, 'x'));
    record(`shareModel strength ${min}`, () => buildShareModel({ kind: 'strength', durationMinutes: min, streakDays: 4, totalSets: 12, totalReps: 90, topExercises: [], dateMs: NOW.getTime() } as never));
  }
  for (const d of DAYS7) {
    const ms = new Date(2026, 9, 18 + d, 6, 40).getTime(); // Sunday 18.10 + d
    record(`shareDate ${d} time`, () => shareDateLabel(ms, true));
    record(`shareDate ${d} date`, () => shareDateLabel(ms, false));
  }
  record('shareDate bad', () => [shareDateLabel(undefined, true), shareDateLabel(Number.NaN, true), shareDateLabel(0, false)]);
  for (const km of [null, undefined, 0, 1, 12.34, 100]) {
    for (const pace of [null, undefined, 4.5, 5.99, 6]) {
      for (const cat of ['running', 'cycling', 'walking']) {
        record(`cardioStats ${km} ${pace} ${cat}`, () => cardioPostStats({ activityCategory: cat, distanceKm: km, durationMinutes: 45, paceMinPerKm: pace } as never));
      }
    }
  }

  // progression hub
  for (const n of [0, 1, 2, 10, 999, 1000, 12.34, 59.99]) {
    record(`consistencyDay ${n}`, () => {
      const wk = [
        { id: 'a', kind: 'strength', type: 'strength', minutes: n, km: 0, pace: 0, sets: 1, domainSets: {}, date: new Date(2026, 9, 21) },
        { id: 'b', kind: 'run', type: 'running', minutes: 20, km: n, pace: 0, sets: 0, domainSets: {}, date: new Date(2026, 9, 21) },
        { id: 'c', kind: 'walk', type: 'walking', minutes: n, km: 0, pace: 0, sets: 0, domainSets: {}, date: new Date(2026, 9, 21) },
        { id: 'd', kind: 'run', type: 'running', minutes: n, km: 0, pace: 0, sets: 0, domainSets: {}, date: new Date(2026, 9, 21) },
      ];
      const day = { date: '2026-10-21', steps: n * 100, stepsGoal: n % 2 ? 8000 : 0, distanceMeters: 0, activeMinutes: n, minutesByCategory: { strength: 0, cardio: 0, maintenance: n } };
      const d = consistencyDay('2026-10-21', new Date(2026, 9, 21), wk as never, day as never, '2026-10-21');
      return { reasons: d.reasons, minutes: d.minutes, missed: missedLine(d) };
    });
    record(`missedLine ${n}`, () => [
      missedLine({ minutes: n, steps: n * 10, stepsGoal: 8000 } as never),
      missedLine({ minutes: n, steps: n * 10, stepsGoal: 0 } as never),
      missedLine({ minutes: n, steps: 0, stepsGoal: 0 } as never),
    ]);
    record(`hubMinutes int ${n}`, () => hubMinutes(n));
  }
  const summary = (minutes: number, km: number, steps: number) => ({
    minutes, steps, byKind: { strength: { minutes, n: 1 }, run: { km, minutes: 0, n: 1 }, walk: { km, minutes: 0, n: 1 } },
  });
  const range = (s: string, e: string) => ({ start: new Date(s), end: new Date(e) });
  for (const period of ['week', 'month'] as const) {
    for (const [c, p] of [[0, 0], [214, 191], [1234, 0], [5, 50], [100, 100]] as const) {
      record(`compare ${period} ${c} ${p}`, () => {
        const ranges = { current: range('2026-10-18T00:00:00', '2026-10-24T23:59:59'), previous: range('2026-10-11T00:00:00', '2026-10-17T23:59:59') };
        return [
          compareHeadline(period, summary(c, c / 10, c * 20) as never, summary(p, p / 10, p * 20) as never, ranges as never, NOW),
          compareRows(period, summary(c, c / 10, c * 20) as never, summary(p, p / 10, p * 20) as never, ranges as never),
        ];
      });
    }
  }
  for (let back = 0; back < 16; back++) {
    const d = new Date(2026, 9, 24 - back, 12);
    record(`relativeDay ${back}`, () => relativeDay(d, NOW));
  }
  record('RUN_DIST_LABEL', () => RUN_DIST_LABEL);

  // walking
  for (const goal of ['weight_loss', 'health', 'steps', 'belly'] as const) {
    for (const comfort of ['short', 'medium', 'long'] as const) {
      for (const audience of ['senior', 'general', 'athlete'] as const) {
        for (const days of [[], [1], [0, 2, 4], [0, 1, 2, 3, 4, 5, 6]]) {
          record(`walkPlan ${goal} ${comfort} ${audience} ${days.join('')}`, () => {
            const plan = recommendWalkPlan({ goal, comfort, stepGoal: 8000, availableDays: days, audience });
            const addOn = { perWeek: 2, minutes: 15 } as never;
            return {
              reasons: plan.reasonsHe,
              title: walkRecommendationTitle(plan), ramp: walkRampLine(plan),
              sub: walkWeekSubtitle(plan, addOn), sub0: walkWeekSubtitle(plan, null),
              week: plan.weeks[0] && walkWeekDays(plan.weeks[0], addOn),
              pieces: plan.weeks.flatMap((w) => w.walks.map((x) => [walkPieceSubtitle(x), walkTargetLabelHe(x.target)])),
            };
          });
        }
      }
    }
  }
  for (const n of [0, 1, 2.5, 30, 45, 1000]) {
    record(`plannedWalkTarget ${n}`, () => [plannedWalkTargetHe({ goal: { type: 'time', value: n } }), plannedWalkTargetHe({ goal: { type: 'distance', value: n } }), plannedWalkTargetHe({ goal: { type: 'x', value: n } })]);
    record(`walkTargetLabel ${n}`, () => [walkTargetLabelHe({ type: 'time', minutes: n } as never), walkTargetLabelHe({ type: 'distance', km: n } as never)]);
  }
  record('plannedWalkTarget none', () => [plannedWalkTargetHe(null), plannedWalkTargetHe({ goal: { type: 'time', value: 'x' } })]);
  for (const s of STEPS) {
    record(`walkStepsHint ${s}`, () => [walkStepsHint(s, 10000, 3300), walkStepsHint(s, 5000, 1000), walkStepsHint(s, 10000, null), walkStepsHint(s, null, 1000)]);
    record(`stepGap ${s}`, () => stepGapWalk(s, 8000));
  }
  for (const lead of [15, 30, 60] as const) record(`reminderPreview ${lead}`, () => reminderPreviewTitle(lead, 'ריצה קלה', '19:00'));
  record('REMINDER_LEAD_OPTIONS', () => REMINDER_LEAD_OPTIONS);
  for (const m of [undefined, 0, 1, 45, 120]) {
    for (const w of ['morning', 'evening', 'noon']) record(`detailLine ${m} ${w}`, () => detailLineHe(m, w as never));
  }

  // weekdays
  record('GROUP_DAY_LABELS', () => GROUP_DAY_LABELS);
  record('DAYS', () => [DAYS, DAYS_FULL]);
  for (const d of DAYS7) {
    for (const now of DAYS7) {
      record(`whenLabel ${d} ${now}`, () => whenLabelHe({ dayOfWeek: d, time: '19:30' } as never, new Date(2026, 9, 18 + now, 10)));
    }
    record(`dayNameHe ${d}`, () => [dayNameHe(d), dayNameHe(d + 7), dayNameHe(d - 7)]);
    record(`reasonV1 day ${d}`, () => [
      renderScheduleReasonHe({ code: 'QUALITY_RUN_FIRST', day: d } as ScheduleReason),
      renderScheduleReasonHe({ code: 'EASY_DAY_DOUBLED', day: d } as ScheduleReason),
      renderScheduleReasonHe({ code: 'MAKEUP_MISSED', day: d, kind: 'walk' } as ScheduleReason),
      renderScheduleReasonHe({ code: 'LEGS_BEFORE_KEY_RUN', day: d, soft: true, run: 'long' } as ScheduleReason),
    ]);
    record(`reasonV2 day ${d}`, () => [
      renderV2ReasonHe({ code: 'LONG_RUN_PREFERRED_DAY', day: d } as V2Reason),
      renderV2ReasonHe({ code: 'LONG_RUN_LAST_FREE_DAY', day: d } as V2Reason),
      renderV2ReasonHe({ code: 'QUALITY_RUN_FIRST', day: d } as V2Reason),
    ]);
    record(`dayLetters ${d}`, () => dayLettersLine([d, (d + 3) % 7]));
    record(`runRecTitle ${d}`, () => recommendationTitle({ days: [{ dow: d, slot: 'long_run' }, { dow: (d + 1) % 7, slot: 'easy_run' }] } as never));
    record(`bucketTooltip ${d}`, () => bucketTooltipLabel(`2026-10-${18 + d}`));
  }
  record('reasonV1 out of range', () => [
    renderScheduleReasonHe({ code: 'QUALITY_RUN_FIRST', day: 9 } as ScheduleReason),
    renderScheduleReasonHe({ code: 'QUALITY_RUN_FIRST', day: -1 } as ScheduleReason),
    renderScheduleReasonHe({ code: 'LEGS_BEFORE_KEY_RUN', soft: true, run: 'long' } as ScheduleReason),
  ]);
  record('bucketTooltip other', () => [bucketTooltipLabel('2026-10'), bucketTooltipLabel('garbage')]);
  record('groupSchedule', () => [
    groupScheduleLabel({ scheduleSlots: [{ dayOfWeek: 2, time: '19:30' }, { dayOfWeek: 4, time: '20:00' }, { dayOfWeek: 2, time: '07:00' }] } as never),
    groupScheduleLabel({ scheduleSlots: DAYS7.map((d) => ({ dayOfWeek: d, time: '06:00' })) } as never),
    groupScheduleLabel({ schedule: { dayOfWeek: 6, time: '08:00' } } as never),
    groupScheduleLabel({} as never),
  ]);
  for (const todayDay of DAYS7) {
    const today = new Date(2026, 9, 18 + todayDay, 12);
    record(`weekDots ${todayDay}`, () => [buildWeekDots({}, today), buildWeekDots({}, today, { todayDone: true })]);
    record(`weekDotsFromStates ${todayDay}`, () => weekDotsFromStates(['done', 'rest', 'future', 'x', 'done'], today));
  }
  return out;
}

describe('wave 3B — call-site parity (Asia/Jerusalem, pinned clock)', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Jerusalem';
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
  });

  it(RECORD ? 'records the BEFORE snapshot' : 'matches the snapshot recorded from origin/main', () => {
    const now = snapshot();
    if (RECORD) {
      writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n');
      return;
    }
    const before = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(now)).toEqual(Object.keys(before));
    const diffs = Object.keys(before).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(before[k]));
    expect(diffs.map((k) => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(now[k])}`)).toEqual([]);
  });
});
