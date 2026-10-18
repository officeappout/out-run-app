/**
 * Planned quality run → paceProfile self-correction (pure part).
 *
 * The running engine's self-correction (recordQualityWorkout /
 * processSelfCorrection in running-engine.service.ts) existed but nothing
 * called it, so basePace — and every race prediction built on it — stayed
 * frozen at the onboarding value. This module turns a finished PLANNED run
 * into the one input recordQualityWorkout needs (average pace over the
 * quality blocks + their target zone), with guards so a bad recording never
 * moves basePace:
 *
 *   - only a planned workout the engine marks as quality
 *     (RunWorkout.isQualityWorkout) and only its quality blocks
 *     (RunBlock.isQualityExercise, pace mode, not a synthesized rest,
 *     a zone with a percentage rule — not the fixed walk zone)
 *   - a block counts only when at least half of it was done and it has
 *     ≥ 30 s and ≥ 100 m of recorded movement
 *   - the run needs ≥ 2 min and ≥ 400 m of such quality running
 *   - GPS: at least one good fix, not the dev simulator
 *   - paused most of the time (active time < half of wall time) → ignored
 *   - pace must be plausible for the zone (within −15 % / +20 % of its
 *     bounds) — beyond that it is a GPS artefact, not a performance
 *   - at most ONE recorded quality run per calendar day
 *
 * Free (non-planned) runs are NOT fed: the engine has no rule for them.
 *
 * The Firestore write lives in pace-profile-write.service.ts.
 */

import type { PaceMapConfig, PaceProfile, RunZoneType } from '../types/running.types';
import type { RunBlock } from '../../players/running/types/run-block.type';
import type { RunWorkout } from '../../players/running/types/run-workout.type';
import {
  computeZones,
  paceMapKeyForProfile,
  recordQualityWorkout,
  type SelfCorrectionResult,
} from './running-engine.service';

/** Per-block actuals the running player keeps (blockElapsed* at block end). */
export interface PlannedBlockResult {
  blockIndex: number;
  elapsedSeconds: number;
  elapsedMeters: number;
}

export interface QualityRunSession {
  /** Active (un-paused) session seconds — useSessionStore.totalDuration. */
  activeSeconds: number;
  /** Wall-clock seconds since the session started. */
  wallSeconds: number;
  hadGoodGpsFix: boolean;
  isSimulated: boolean;
}

export type QualityRunSummary =
  | { ok: true; avgPaceSecPerKm: number; targetZone: RunZoneType; qualitySeconds: number; qualityMeters: number }
  | { ok: false; reason: string };

export const MIN_BLOCK_SECONDS = 30;
export const MIN_BLOCK_METERS = 100;
export const MIN_BLOCK_COMPLETION = 0.5;
export const MIN_QUALITY_SECONDS = 120;
export const MIN_QUALITY_METERS = 400;
export const MIN_ACTIVE_RATIO = 0.5;
export const PLAUSIBLE_FASTER = 0.85;
export const PLAUSIBLE_SLOWER = 1.2;
/** Stored history is trimmed to the newest N records (count keeps the total). */
export const MAX_HISTORY_RECORDS = 60;

function isScoredBlock(b: RunBlock | undefined, profile: PaceProfile, config: PaceMapConfig): b is RunBlock & { zoneType: RunZoneType } {
  if (!b || !b.isQualityExercise || b._isSynthesizedRest || !b.zoneType) return false;
  if ((b.blockMode ?? 'pace') !== 'pace') return false;
  const table = config[paceMapKeyForProfile(profile.profileType)];
  const rule = table?.[b.zoneType];
  if (!rule || (rule.fixedMinSeconds != null && rule.fixedMaxSeconds != null)) return false;
  return true;
}

function blockCompletion(b: RunBlock, r: PlannedBlockResult): number {
  if (b.durationSeconds && b.durationSeconds > 0) return r.elapsedSeconds / b.durationSeconds;
  if (b.distanceMeters && b.distanceMeters > 0) return r.elapsedMeters / b.distanceMeters;
  return 0;
}

/**
 * Average pace over the counted quality blocks of the dominant zone (the
 * zone with the most counted seconds), or why the run doesn't count.
 */
export function summarizeQualityRun(
  workout: RunWorkout | null | undefined,
  results: readonly PlannedBlockResult[],
  session: QualityRunSession,
  profile: PaceProfile,
  config: PaceMapConfig,
): QualityRunSummary {
  if (!workout || !workout.isQualityWorkout) return { ok: false, reason: 'not_quality_workout' };
  if (!(profile.basePace > 0)) return { ok: false, reason: 'no_base_pace' };
  if (session.isSimulated) return { ok: false, reason: 'simulated' };
  if (!session.hadGoodGpsFix) return { ok: false, reason: 'no_good_gps' };
  if (!(session.wallSeconds > 0) || session.activeSeconds / session.wallSeconds < MIN_ACTIVE_RATIO) {
    return { ok: false, reason: 'mostly_paused' };
  }

  const byZone = new Map<RunZoneType, { seconds: number; meters: number }>();
  const seen = new Set<number>();
  for (const r of results) {
    if (seen.has(r.blockIndex)) continue; // a block jumped back to is counted once
    const b = workout.blocks[r.blockIndex];
    if (!isScoredBlock(b, profile, config)) continue;
    if (!(r.elapsedSeconds >= MIN_BLOCK_SECONDS) || !(r.elapsedMeters >= MIN_BLOCK_METERS)) continue;
    if (blockCompletion(b, r) < MIN_BLOCK_COMPLETION) continue;
    seen.add(r.blockIndex);
    const acc = byZone.get(b.zoneType) ?? { seconds: 0, meters: 0 };
    acc.seconds += r.elapsedSeconds;
    acc.meters += r.elapsedMeters;
    byZone.set(b.zoneType, acc);
  }

  let best = null as { zone: RunZoneType; seconds: number; meters: number } | null;
  byZone.forEach((v, zone) => {
    if (!best || v.seconds > best.seconds) best = { zone, ...v };
  });
  if (!best || best.seconds < MIN_QUALITY_SECONDS || best.meters < MIN_QUALITY_METERS) {
    return { ok: false, reason: 'too_little_quality_running' };
  }

  const avgPaceSecPerKm = best.seconds / (best.meters / 1000);
  const { minPace, maxPace } = computeZones(profile.basePace, profile.profileType, config)[best.zone];
  if (avgPaceSecPerKm < minPace * PLAUSIBLE_FASTER || avgPaceSecPerKm > maxPace * PLAUSIBLE_SLOWER) {
    return { ok: false, reason: 'implausible_pace' };
  }

  return {
    ok: true,
    avgPaceSecPerKm: Math.round(avgPaceSecPerKm),
    targetZone: best.zone,
    qualitySeconds: best.seconds,
    qualityMeters: Math.round(best.meters),
  };
}

/** Legacy / partial Firestore shapes → a complete PaceProfile. null without a basePace. */
export function normalizePaceProfile(raw: unknown): PaceProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PaceProfile>;
  if (typeof p.basePace !== 'number' || !(p.basePace > 0)) return null;
  const history = Array.isArray(p.qualityWorkoutsHistory) ? p.qualityWorkoutsHistory : [];
  return {
    basePace: p.basePace,
    profileType: p.profileType === 1 || p.profileType === 2 || p.profileType === 3 || p.profileType === 4 ? p.profileType : 2,
    qualityWorkoutsHistory: history,
    qualityWorkoutCount: typeof p.qualityWorkoutCount === 'number' && p.qualityWorkoutCount >= 0
      ? p.qualityWorkoutCount
      : history.length,
    lastSelfCorrectionDate: typeof p.lastSelfCorrectionDate === 'string' ? p.lastSelfCorrectionDate : null,
  };
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export type ApplyQualityRunResult =
  | { applied: true; updatedProfile: PaceProfile; selfCorrection: SelfCorrectionResult | null }
  | { applied: false; reason: string };

/**
 * Record one counted quality run on the profile (per-day cap), via the
 * engine's own recordQualityWorkout — so basePace moves only by its rule,
 * once every 3 quality runs. History is trimmed to the newest records.
 */
export function applyQualityRun(
  profile: PaceProfile,
  workoutId: string,
  summary: Extract<QualityRunSummary, { ok: true }>,
  config: PaceMapConfig,
  now: Date,
): ApplyQualityRunResult {
  const today = localDayKey(now);
  const recordedToday = profile.qualityWorkoutsHistory.some((r) => {
    const t = new Date(r?.date as string);
    return !Number.isNaN(t.getTime()) && localDayKey(t) === today;
  });
  if (recordedToday) return { applied: false, reason: 'already_recorded_today' };

  const { updatedProfile, selfCorrection } = recordQualityWorkout(
    profile,
    workoutId,
    summary.avgPaceSecPerKm,
    summary.targetZone,
    config,
    now,
  );
  const history = updatedProfile.qualityWorkoutsHistory;
  return {
    applied: true,
    updatedProfile: {
      ...updatedProfile,
      qualityWorkoutsHistory: history.length > MAX_HISTORY_RECORDS ? history.slice(-MAX_HISTORY_RECORDS) : history,
    },
    selfCorrection,
  };
}
