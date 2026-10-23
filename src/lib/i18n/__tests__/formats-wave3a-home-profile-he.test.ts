/**
 * i18n wave 3A (formats, home + profile) — Hebrew output must not move.
 *
 * The fixture `fixtures/wave3a-home-profile-snapshots.json` was recorded from the
 * UNMODIFIED origin/main (fb4adef9) before any call site changed:
 *   W3A_RECORD=1 npx vitest run src/lib/i18n/__tests__/formats-wave3a-home-profile-he.test.ts
 * Every run after that compares the current code to those recorded strings.
 * The zone is pinned to Asia/Jerusalem (the app's zone; the CI runner is UTC) and the
 * inputs include month/year boundaries, Fri/Sat, midnight and the 2026-10-25 DST change.
 * Module-private expressions (inside components) are covered one level down, in
 * formats-wave3a-private-he.test.ts, against verbatim copies of the old code.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { doneRowMeta } from '@/features/home/utils/done-workout-rows';
import { buildRecordTiles, dateLabel } from '@/features/profile/components/records/record-tiles';
import { dayMonth, longDate } from '@/features/profile/components/exercise-analytics-v2/exercise-analytics.utils';
import { profile } from '@/messages/ns/profile';
import { makeT } from '../t';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';

const FIXTURE = path.join(__dirname, 'fixtures', 'wave3a-home-profile-snapshots.json');
const RECORD = process.env.W3A_RECORD === '1';

const KMS = [0.1, 0.4, 0.95, 1.0, 5.234, 12.34, 21.0975, 999.99, 1000.5];
const STEPS = [1, 999, 1000, 8400, 12345, 123456];
const MINUTES = [0, 1, 35, 59, 60, 61];
const SECONDS = [59, 60, 3600, 3661];
const PLACES = [0, 1, 999, 1000, 12345.6];

const card = (over: Partial<TodayActivityCardData>): TodayActivityCardData => ({
  key: 'w1', category: 'strength', title: 'x', minutes: 42, streak: 1, ...over,
});

// Local-time constructors so the same calendar day shows in any zone.
const stamps = () => [
  new Date(2026, 0, 1, 0, 0), new Date(2025, 11, 31, 23, 59), new Date(2026, 1, 28, 12), new Date(2026, 2, 1, 0, 0),
  new Date(2026, 9, 23, 18, 30), new Date(2026, 9, 24, 9, 5), new Date(2026, 9, 25, 0, 30), new Date(2026, 9, 25, 12),
  new Date(2026, 9, 26, 0, 0), new Date(2026, 11, 31, 23, 59, 59),
  ...Array.from({ length: 12 }, (_, m) => new Date(2026, m, 15, 12)),
].map((d) => d.getTime());

function compute(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.doneRowMeta = {
    km: KMS.map((km) => doneRowMeta(card({ category: 'cardio', workoutType: 'running', minutes: 35 }), { distance: km })),
    steps: STEPS.map((s) => doneRowMeta(card({ category: 'steps', minutes: 0, stepsAchieved: s }))),
    minutes: MINUTES.map((m) => doneRowMeta(card({ minutes: m }), { setsCompleted: 18 })),
  };
  const now = new Date(2026, 9, 25, 12).getTime();
  const months = Array.from({ length: 12 }, (_, m) => `2026-${String(m + 1).padStart(2, '0')}`);
  out.recordTiles = {
    km: KMS.map((km) => buildRecordTiles({ nowMs: now, records: { longestRunKm: { value: km, at: now - 86_400_000 }, longestWalkKm: { value: km / 2, at: now - 30 * 86_400_000 } } })),
    clock: SECONDS.map((s) => buildRecordTiles({ nowMs: now, records: { fastest5kSec: { value: s, at: now } } })),
    months: months.map((mo) => buildRecordTiles({ nowMs: now, periodTotals: { [mo]: { workouts: 9 } } })),
    streak: PLACES.map((p) => buildRecordTiles({ nowMs: now, longestStreak: p })),
  };
  out.dateLabel = stamps().map((at) => dateLabel(at));
  out.longDate = stamps().map((at) => longDate(at, makeT('he', profile)));
  out.dayMonth = stamps().map((at) => dayMonth(at));
  return out;
}

let prevTz: string | undefined;
beforeAll(() => { prevTz = process.env.TZ; process.env.TZ = 'Asia/Jerusalem'; });
afterAll(() => { if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz; });

describe('wave 3A home + profile — Hebrew output equals the pre-change snapshot', () => {
  it(RECORD ? 'records the snapshot' : 'matches the snapshot', () => {
    const now = compute();
    if (RECORD) {
      fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n');
      return;
    }
    expect(now).toEqual(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
  });
});
