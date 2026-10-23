/**
 * Persist the paceProfile after a planned quality run.
 *
 * One transaction on the owner's users/{uid} doc: read the CURRENT
 * running.paceProfile from the server (never the possibly stale local
 * copy), apply the run (pace-self-correction.service → the engine's
 * recordQualityWorkout), write back only `running.paceProfile`.
 * `running.*` is owner-writable under firestore.rules (no protected group
 * covers it) — the same field the onboarding sync already writes.
 */

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { PaceMapConfig, PaceProfile } from '../types/running.types';
import {
  applyFreeRunPositive,
  applyQualityRun,
  normalizePaceProfile,
  type QualityRunSummary,
} from './pace-self-correction.service';

export type PaceProfileWriteResult =
  | { written: true; paceProfile: PaceProfile; basePaceChangedBy: number }
  | { written: false; reason: string };

export async function writeQualityRunToPaceProfile(
  db: Firestore,
  uid: string,
  workoutId: string,
  summary: Extract<QualityRunSummary, { ok: true }>,
  config: PaceMapConfig,
  now: Date = new Date(),
): Promise<PaceProfileWriteResult> {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizePaceProfile(snap.data()?.running?.paceProfile);
    if (!current) return { written: false, reason: 'no_pace_profile' } as const;

    const res = applyQualityRun(current, workoutId, summary, config, now);
    if (!res.applied) return { written: false, reason: res.reason } as const;

    tx.update(ref, { 'running.paceProfile': res.updatedProfile });
    return {
      written: true,
      paceProfile: res.updatedProfile,
      basePaceChangedBy: res.updatedProfile.basePace - current.basePace,
    } as const;
  });
}


/**
 * A covered FREE run (enable_run_done_state_v1): the same transaction, positive-only
 * (applyFreeRunPositive — never makes the targets slower). `summary` comes from summarizeFreeRun.
 */
export async function writeFreeRunToPaceProfile(
  db: Firestore,
  uid: string,
  workoutId: string,
  summary: Extract<QualityRunSummary, { ok: true }>,
  config: PaceMapConfig,
  now: Date = new Date(),
): Promise<PaceProfileWriteResult> {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizePaceProfile(snap.data()?.running?.paceProfile);
    if (!current) return { written: false, reason: 'no_pace_profile' } as const;
    const res = applyFreeRunPositive(current, workoutId, summary, config, now);
    if (!res.applied) return { written: false, reason: res.reason } as const;
    tx.update(ref, { 'running.paceProfile': res.updatedProfile });
    return {
      written: true,
      paceProfile: res.updatedProfile,
      basePaceChangedBy: res.updatedProfile.basePace - current.basePace,
    } as const;
  });
}
