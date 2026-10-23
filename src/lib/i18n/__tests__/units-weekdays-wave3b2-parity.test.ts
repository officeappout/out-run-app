/**
 * i18n wave 3B part 2 — parity of the call sites in home / workout-engine / profile that moved their unit words
 * ("ק״מ", "מ׳", "דק׳", "שע׳", "קמ״ש", "צעדים") and weekday names into the `common` catalog.
 *
 * `fixtures/units-weekdays-wave3b2-before.json` was recorded from the UNMODIFIED tree (RECORD_W3B2_PARITY=1);
 * this test replays the same inputs against the migrated code and requires byte-identical output.
 * The clock and the time zone are pinned (CI runs in UTC, the app in Asia/Jerusalem).
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatDistanceLabel, formatRaceTime } from '@/features/home/utils/race-prediction';
import { buildDoneWorkoutRows, doneRowMeta } from '@/features/home/utils/done-workout-rows';
import { buildRecordTiles } from '@/features/profile/components/records/record-tiles';
import { blockSizeLabel, buildRunDisplayTitle, fmtMeters, fmtSeconds } from '@/features/workout-engine/players/running/utils/run-preview/run-title';
import { accessText } from '@/features/workout-engine/players/running/utils/run-overview/run-route-choice';
import { swapDeltaText } from '@/features/workout-engine/players/running/utils/run-overview/run-swap-alternatives';
import { goalView } from '@/features/workout-engine/players/running/lib/continuous-run';
import { fmtDistance } from '@/features/workout-engine/players/running/lib/planned-rep-results';
import { climbLabel } from '@/features/workout-engine/players/running/lib/route-elevation-ahead';
import { fitDistance } from '@/features/workout-engine/players/running/lib/route-fit/distance-fit';
import { climbReason } from '@/features/workout-engine/players/running/lib/route-fit/climb-match';
import { rateLabels } from '@/features/workout-engine/players/running/lib/aerobic-activity';
import { buildRunStories } from '@/features/workout-engine/players/running/lib/buildRunStories';
import { formatApproxDistance, formatApproxWalkMinutes } from '@/features/workout-engine/hybrid/hybrid-intro-format';
import { runLabel } from '@/features/workout-engine/engines/timed/timed-spec';
import { hybridJourneyItems } from '@/features/workout-engine/engines/preview-strips';
import { aerobicRings, hybridRings, rideRings } from '@/features/workout-engine/summary/v2-summary.mapping';
import { repsTitle, runTypeRings } from '@/features/workout-engine/summary/run-type/run-type.mapping';
import { legTargetText, miniView } from '@/features/workout-engine/hybrid/v2/hybrid-v2-view';
import { listTotals } from '@/features/workout-engine/hybrid/v2/hybrid-v2-list';
import { buildPlannedWalkSlot } from '@/features/workout-engine/hybrid/planned-walk-slot';

const FIXTURE = path.resolve(__dirname, 'fixtures/units-weekdays-wave3b2-before.json');
const RECORD = process.env.RECORD_W3B2_PARITY === '1';
const originalTz = process.env.TZ;
const NOW = new Date('2026-10-24T10:00:00+03:00');

const KM = [0, 1, 2, 10, 0.05, 0.5, 0.95, 0.999, 1.25, 12.34, 99.99, 100, 999, 1000, 21.0975, -1, Number.NaN];
const METERS = [0, 1, 50, 99, 99.5, 100, 149, 150, 400, 999, 1000, 1049, 1500, 2400, 12345, -5, Number.NaN];
const SECONDS = [0, 1, 45, 59, 60, 61, 150, 180, 599, 600, 3599, 3600, 3661, 36000, -5, Number.NaN];
const MINUTES = [0, 1, 2, 10, 59, 60, 61, 600, 999, 1000];
const STEPS = [0, 1, 999, 1000, 8400, 12345];

const block = (over: Record<string, unknown>) => ({ id: 'b', type: 'run', label: 'ריצה', colorHex: '#000', ...over });

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const record = (key: string, fn: () => unknown) => {
    try { out[key] = fn(); } catch (e) { out[key] = `THROWS ${(e as Error).constructor.name}`; }
  };

  // home
  for (const km of KM) record(`raceDistanceLabel ${km}`, () => formatDistanceLabel(km));
  for (const s of SECONDS) record(`raceTime ${s}`, () => formatRaceTime(s));
  for (const locale of ['he', 'en', 'ru'] as const) {
    for (const minutes of MINUTES) {
      for (const km of [undefined, 0, 0.09, 0.1, 5.04, 12.34, 1234.5]) {
        record(`doneMeta ${locale} ${minutes} ${km}`, () => [
          doneRowMeta({ key: 'a', category: 'cardio', minutes, workoutType: 'running' } as never, { id: 'a', distance: km, setsCompleted: minutes % 3 } as never, locale),
          doneRowMeta({ key: 'a', category: 'strength', minutes } as never, { id: 'a', setsCompleted: 12 } as never, locale),
        ]);
      }
    }
    for (const steps of STEPS) {
      record(`doneSteps ${locale} ${steps}`, () => doneRowMeta({ key: 's', category: 'steps', minutes: 0, stepsAchieved: steps } as never, undefined, locale));
    }
  }
  record('doneRows', () => buildDoneWorkoutRows([{ key: 'a', category: 'cardio', minutes: 30, workoutType: 'walking' }, { key: 's', category: 'steps', minutes: 0, stepsAchieved: 8400 }] as never, [{ id: 'a', distance: 3.2 }] as never));

  // profile
  for (const km of [0.04, 1, 5.04, 12.34, 21.0975, 1234.5]) {
    for (const locale of ['he', 'en'] as const) {
      record(`recordTiles ${km} ${locale}`, () => buildRecordTiles({
        records: { fastest5kSec: { value: 1500, at: NOW.getTime() }, longestRunKm: { value: km, at: 1 }, longestWalkKm: { value: km / 2 || 1, at: 1 } } as never,
        longestStreak: 5, nowMs: NOW.getTime(), locale,
      }));
    }
  }

  // engine — run titles and block sizes
  for (const m of METERS) record(`fmtMeters ${m}`, () => fmtMeters(m));
  for (const s of SECONDS) record(`fmtSeconds ${s}`, () => fmtSeconds(s));
  for (const s of SECONDS) {
    record(`blockSize sec ${s}`, () => blockSizeLabel(block({ durationSeconds: s }) as never));
    record(`blockSize m ${s}`, () => blockSizeLabel(block({ distanceMeters: s }) as never));
  }
  for (const kind of ['tempo', 'long', 'easy', 'intervals', 'other'] as const) {
    for (const sec of [0, 30, 600, 1200, 2100, 5400]) {
      record(`runTitle ${kind} ${sec}`, () => buildRunDisplayTitle([block({ durationSeconds: sec }) as never], kind as never, { seconds: sec || null, meters: sec * 3 || null }));
      record(`runTitle ${kind} m ${sec}`, () => buildRunDisplayTitle([block({ distanceMeters: sec }) as never], kind as never, { seconds: null, meters: sec }));
    }
    record(`runTitle ${kind} reps`, () => buildRunDisplayTitle([block({ type: 'interval', distanceMeters: 400 }), block({ type: 'recovery', durationSeconds: 90 }), block({ type: 'interval', distanceMeters: 400 }), block({ type: 'recovery', durationSeconds: 90 })] as never, kind as never, { seconds: 1200, meters: 3000 }));
  }
  for (const km of [null, ...KM]) record(`accessText ${km}`, () => accessText(km));
  for (const d of [null, undefined, 0, 59, 60, 90, 120, 300, -90, -600, 3600]) {
    record(`swapDelta ${d}`, () => [
      swapDeltaText({ deltaSec: d as never, equalVolume: false, current: false }),
      swapDeltaText({ deltaSec: d as never, equalVolume: true, current: false }),
      swapDeltaText({ deltaSec: d as never, equalVolume: true, current: true }),
    ]);
  }
  for (const type of ['time', 'distance'] as const) {
    for (const [target, current] of [[600, 0], [600, 120], [600, 600], [1800, 59], [5, 0], [5, 1.234], [5, 4.5], [5, 5], [10.5, 3], [0, 0]]) {
      record(`goalView ${type} ${target} ${current}`, () => goalView({ type, target, current }));
    }
  }
  for (const m of [...METERS, null, undefined]) record(`fmtDistance ${m}`, () => fmtDistance(m as number));
  for (const inM of [0, 29, 30, 300, 304, 999, 1000, 1049, 2500]) {
    for (const gradePct of [3, 6, 9.5]) record(`climbLabel ${inM} ${gradePct}`, () => climbLabel({ inM, gradePct, lengthM: 200 }));
  }
  record('climbLabel null', () => climbLabel(null));
  for (const startM of [null, 0, 1200, 1250, 5000]) {
    for (const lengthM of [null, 45, 300, 304]) {
      for (const source of ['profile', 'maxGrade']) {
        record(`climbReason ${startM} ${lengthM} ${source}`, () => climbReason({ startM, lengthM, avgGradePct: 6.4, source, meetsSpec: true } as never));
      }
    }
  }
  for (const shape of ['loop', 'out_and_back', 'point_to_point'] as const) {
    for (const D of [0.2, 0.5, 1, 1.5, 2.4, 5, 10, 25]) {
      for (const target of [null, 0, 1, 2, 3, 5, 7.5, 10, 21.1]) {
        record(`fitDistance ${shape} ${D} ${target}`, () => fitDistance({ distance: D, routeShape: shape, path: [] } as never, target));
      }
    }
  }
  for (const metric of ['pace', 'speed'] as const) record(`rateLabels ${metric}`, () => rateLabels(metric));
  const storyCtx = (over: Record<string, unknown>) => ({ totalDistance: 0, ...over }) as never;
  for (const dist of [0, 0.004, 1, 1.234, 12.5]) {
    for (const goal of [undefined, { type: 'distance', value: 5 }, { type: 'distance', value: 0 }, { type: 'time', value: 600 }, { type: 'distance', value: 10.25 }]) {
      record(`stories ${dist} ${JSON.stringify(goal)}`, () => buildRunStories(storyCtx({ totalDistance: dist, sessionGoal: goal })).map((s) => [s.id, s.label, s.getValue(storyCtx({ totalDistance: dist, sessionGoal: goal, groupTotalDistance: dist, groupGoalTarget: 5, groupActiveCount: 3, elapsedSeconds: 60, currentPace: 330, averagePace: 340 }))]));
    }
  }
  for (const m of METERS) record(`introDistance ${m}`, () => formatApproxDistance(m));
  for (const s of SECONDS) {
    for (const kind of ['walking', 'running', 'cycling'] as const) record(`introMinutes ${s} ${kind}`, () => formatApproxWalkMinutes(s, kind));
  }
  for (const m of [...METERS, undefined]) record(`runLabel m ${m}`, () => runLabel({ distanceM: m }));
  for (const s of [...SECONDS, undefined]) record(`runLabel s ${s}`, () => runLabel({ durationSec: s }));
  record('runLabel custom', () => runLabel({ label: 'x', distanceM: 5 }));
  for (const km of [undefined, 0, 0.4, 1, 2.5, 10]) {
    record(`journey ${km}`, () => hybridJourneyItems([{ kind: 'aerobic', distanceKm: km, aerobicType: 'running' }, { kind: 'aerobic', distanceKm: km, durationSec: 600, aerobicType: 'walking' }] as never));
  }

  // summary mappings
  for (const km of [undefined, 0, 0.5, 5.123, 42.195]) {
    for (const pace of [undefined, 0, 5.5, 6.0166]) {
      record(`aerobicRings ${km} ${pace}`, () => aerobicRings({ distance: km, pace, duration: 1800 }));
      record(`runTypeRings ${km} ${pace}`, () => (['intervals', 'easy', 'long', 'free'] as const).map((k) => runTypeRings({ distance: km, pace, duration: 1800, blockResults: [{ plannedDistanceMeters: 400, avgPaceSec: 300 }, { plannedDistanceMeters: 400, avgPaceSec: 310 }], runMeta: { plannedReps: 6, category: 'intervals', mainBand: { min: 5, max: 6 } } } as never, k)));
    }
    for (const climb of [undefined, 0, 12.4, 350]) {
      record(`rideRings ${km} ${climb}`, () => rideRings({ distance: km, duration: 3600, elevationGain: climb }));
    }
    record(`hybridRings ${km}`, () => hybridRings({
      segments: [{ kind: 'aerobic', planned: { distanceKm: km } }, { kind: 'strength', planned: { sets: 9 } }] as never,
      summary: { segmentCount: 2, completedAerobicSegments: 1, completedStrengthSegments: 1, totalActualDistanceKm: km ?? 0, totalStrengthSets: 4, totalActualDurationSec: 1800 } as never,
    }));
  }
  for (const t of [60, 90, 120, 180, 600]) {
    record(`repsTitle ${t}`, () => [
      repsTitle([{ plannedDurationSeconds: t }, { plannedDurationSeconds: t }] as never, 6),
      repsTitle([{ plannedDistanceMeters: t * 10 }, { plannedDistanceMeters: t * 10 }] as never),
    ]);
  }
  for (const seg of [null, { distanceKm: 2.4 }, { distanceKm: 0.4 }, { durationSec: 30 }, { durationSec: 600 }, {}]) {
    record(`legTarget ${JSON.stringify(seg)}`, () => legTargetText(seg as never));
  }
  for (const km of [0, 1, 4.4, 12.345]) {
    record(`miniView ${km}`, () => miniView({ phase: 'leg', cursor: 0 } as never, [{ kind: 'aerobic', aerobicType: 'running', distanceKm: 2 }] as never, {}, 1688, km));
    record(`listTotals ${km}`, () => listTotals([], 1688, km));
  }
  for (const [type, value] of [['time', 30], ['time', 45], ['distance', 2.5], ['distance', 0.4], ['steps', 5], ['time', 0]] as const) {
    record(`plannedWalkSlot ${type} ${value}`, () => buildPlannedWalkSlot({ kind: 'today', entry: { date: '2026-10-24', entryId: 'e', plannedRun: { goal: { type, value } } } } as never));
  }
  return out;
}

describe('wave 3B part 2 — call-site parity (Asia/Jerusalem, pinned clock)', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Jerusalem';
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
  });

  it(RECORD ? 'records the BEFORE snapshot' : 'matches the snapshot recorded before the migration', () => {
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
