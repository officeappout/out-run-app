/**
 * Race prediction (home v2 widget) — pure helpers.
 *
 * The ONLY input is the real value the running engine already stores on the
 * user: `running.paceProfile.basePace` (seconds per km). It is set by the
 * running onboarding bridge (calibrateBasePace on the result the runner
 * typed, or the beginner estimate from continuous minutes) and is the same
 * number every other prediction surface in the app reads (RunProgressCircle,
 * RunDetailsDrawer, RaceAndKmCarousel).
 *
 * Model = the shared one in workout-engine/core/services/race-prediction.service
 * (also used by the plan's race-day workout): Riegel from basePace, with the
 * reference distance = the plan's target distance (5 km when unknown):
 *   T(d) = basePace × refKm × (d / refKm)^1.06
 * So the main distance (= refKm) is simply basePace × refKm.
 *
 * basePace moves after planned quality runs (pace-self-correction.service →
 * recordQualityWorkout), so the number follows the runner's recent runs.
 *
 * Trend: `paceProfile.qualityWorkoutsHistory[].impactOnBasePaceSeconds` is
 * what the self-correction step stamps when it moves basePace. Summing the
 * impacts dated inside the last 30 days gives basePace 30 days ago. No dated
 * impact in the window → no trend (we never invent one).
 */

import {
  predictRaceSeconds,
  targetDistanceKm,
} from '@/features/workout-engine/core/services/race-prediction.service';

// One model for every surface — see race-prediction.service.ts.
export {
  RIEGEL_EXPONENT,
  predictRaceSeconds,
  targetDistanceKm,
} from '@/features/workout-engine/core/services/race-prediction.service';

export const HALF_MARATHON_KM = 21.0975;

/** Distances shown in the secondary row (the main one is filtered out). */
export const RACE_DISTANCES_KM = [5, 10, HALF_MARATHON_KM] as const;

/** "5 ק״מ" / "21.1 ק״מ" */
export function formatDistanceLabel(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ק״מ`;
}

/** Clock text: under an hour "24:35", otherwise "1:52:10". Seconds rounded. */
export function formatRaceClock(totalSeconds: number): string {
  if (!(totalSeconds > 0)) return '--:--';
  const total = Math.round(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Big-number display: clock value + Hebrew unit (דק׳ under an hour, שע׳ above). */
export function formatRaceTime(totalSeconds: number): { value: string; unit: string } {
  const value = formatRaceClock(totalSeconds);
  return { value, unit: Math.round(totalSeconds) >= 3600 ? 'שע׳' : 'דק׳' };
}

/** "5:35" per km. */
export function formatPacePerKm(secPerKm: number): string {
  if (!(secPerKm > 0)) return '--:--';
  return formatRaceClock(secPerKm);
}

export interface PaceHistoryRecord {
  date?: unknown;
  impactOnBasePaceSeconds?: unknown;
}

function toMillis(d: unknown): number | null {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.getTime();
  if (typeof d === 'string' || typeof d === 'number') {
    const t = new Date(d).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (d && typeof d === 'object' && typeof (d as { toMillis?: unknown }).toMillis === 'function') {
    return (d as { toMillis: () => number }).toMillis();
  }
  return null;
}

/**
 * basePace as it was `days` ago, reconstructed from the self-correction
 * impacts stamped inside the window. null when there is no dated, non-zero
 * impact in the window (no history → no trend chip).
 */
export function basePaceDaysAgo(
  currentBasePace: number,
  history: readonly PaceHistoryRecord[] | null | undefined,
  now: Date,
  days = 30,
): number | null {
  if (!(currentBasePace > 0) || !history?.length) return null;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  let sum = 0;
  let found = false;
  for (const r of history) {
    const t = toMillis(r?.date);
    const impact = typeof r?.impactOnBasePaceSeconds === 'number' ? r.impactOnBasePaceSeconds : 0;
    if (t === null || t <= cutoff || t > now.getTime() || !impact) continue;
    sum += impact;
    found = true;
  }
  if (!found) return null;
  const past = currentBasePace - sum;
  return past > 0 ? past : null;
}

export interface RacePredictionInput {
  basePace?: number | null;
  targetDistance?: unknown;
  history?: readonly PaceHistoryRecord[] | null;
  /** running.isUnlocked / activeProgram / lastWorkoutDate — "is a runner". */
  isRunner: boolean;
  /** enable_running_programs — only gates the empty-state CTA. */
  runningProgramsEnabled: boolean;
  now: Date;
}

export interface RaceRow {
  km: number;
  label: string;
  seconds: number;
}

export type RacePredictionView =
  | { state: 'hidden' }
  | { state: 'empty' }
  | {
      state: 'ready';
      main: RaceRow;
      others: RaceRow[];
      basePace: number;
      /** main-distance seconds now minus 30 days ago (negative = faster). null = no history. */
      trendSeconds: number | null;
      /** At least one dated quality run is recorded → the number follows recent runs. */
      basedOnRuns: boolean;
    };

/**
 * Who sees what:
 *   - a real basePace → the prediction (running-programs flag NOT required:
 *     the value is the user's own data)
 *   - a runner without basePace → the inviting empty state, but only when
 *     running programs are on (its CTA leads into the running questionnaire,
 *     the only thing that produces a basePace today)
 *   - everyone else → hidden
 */
export function selectRacePrediction(input: RacePredictionInput): RacePredictionView {
  const basePace = typeof input.basePace === 'number' ? input.basePace : 0;
  if (!(basePace > 0)) {
    return input.isRunner && input.runningProgramsEnabled ? { state: 'empty' } : { state: 'hidden' };
  }
  const refKm = targetDistanceKm(input.targetDistance);
  const row = (km: number): RaceRow => ({
    km,
    label: formatDistanceLabel(km),
    seconds: predictRaceSeconds(basePace, refKm, km),
  });
  const main = row(refKm);
  const others = RACE_DISTANCES_KM.filter((km) => Math.abs(km - refKm) > 0.01).map(row);

  const past = basePaceDaysAgo(basePace, input.history, input.now);
  let trendSeconds: number | null = null;
  if (past !== null) {
    const delta = Math.round(main.seconds - predictRaceSeconds(past, refKm, refKm));
    trendSeconds = delta === 0 ? null : delta;
  }

  const basedOnRuns = !!input.history?.some((r) => toMillis(r?.date) !== null);

  return { state: 'ready', main, others, basePace, trendSeconds, basedOnRuns };
}

/** Trend chip parts: clock of the change + direction word. */
export function formatTrend(trendSeconds: number): { clock: string; label: string; faster: boolean } {
  const faster = trendSeconds < 0;
  return { clock: formatRaceClock(Math.abs(trendSeconds)), label: faster ? 'מהר יותר' : 'איטי יותר', faster };
}
