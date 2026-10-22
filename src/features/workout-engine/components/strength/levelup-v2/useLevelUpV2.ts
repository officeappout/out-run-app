'use client';

/**
 * Level-up v2 controller (enable_levelup_v2). Disabled → does nothing at all
 * (no reads, no state changes): the page renders the legacy dopamine screen.
 *
 * 1. While the workout runs: pre-load the engine inputs (reads only).
 * 2. On "finish": compute the result on the device at once (pure, shared with
 *    the service) — no waiting for the ~15 background writes.
 * 3. When the stored result lands: "שומר…" → "נשמר"; if it differs from the
 *    preview, swap to the stored number silently (at most two numbers ever).
 */
import { useEffect, useRef, useState } from 'react';
import type { WorkoutCompletionResult, WorkoutExerciseResult } from '@/features/user/core/types/progression.types';
import {
  computeLevelUpPreview,
  outcomeFromStored,
  sameOutcome,
  type LevelPoint,
  type LevelUpInputs,
  type LevelUpOutcome,
} from '@/features/user/progression/services/levelup-preview';
import { loadLevelUpInputs, readStoredTrack } from '@/features/user/progression/services/levelup-inputs.service';
import type { SaveState } from './SaveStatusPill';

/** How long "finish" may wait for still-loading inputs before the calm state. */
const INPUTS_GRACE_MS = 1200;

export interface UseLevelUpV2Params {
  enabled: boolean;
  uid: string | undefined;
  programId: string;
  planExerciseIds: string[];
  isRecovery: boolean;
  /** flowState === 'dopamine' — the session is finished. */
  finished: boolean;
  /** The engine input for this session (built once on finish). */
  exerciseResults: WorkoutExerciseResult[] | null;
  progressionResult: WorkoutCompletionResult | null;
  progressionFailed: boolean;
  fallback: LevelPoint;
}

export interface LevelUpV2State {
  outcome: LevelUpOutcome | null;
  /** False only during the short grace wait for inputs (the screen hides its copy). */
  ready: boolean;
  saveState: SaveState;
}

export function useLevelUpV2(p: UseLevelUpV2Params): LevelUpV2State {
  const [inputs, setInputs] = useState<LevelUpInputs | null | undefined>(undefined); // undefined = loading
  const [outcome, setOutcome] = useState<LevelUpOutcome | null>(null);
  const [graceOver, setGraceOver] = useState(false);
  const loadKeyRef = useRef<string | null>(null);
  const previewDoneRef = useRef(false);
  const reconciledRef = useRef<WorkoutCompletionResult | null>(null);

  const planKey = p.planExerciseIds.join(',');

  // 1. Pre-load (reads only) while the workout runs.
  useEffect(() => {
    if (!p.enabled || p.isRecovery || !p.uid || !p.programId) return;
    const key = `${p.uid}|${p.programId}|${planKey}`;
    if (loadKeyRef.current === key) return;
    loadKeyRef.current = key;
    let alive = true;
    setInputs(undefined);
    void loadLevelUpInputs(p.uid, p.programId, p.planExerciseIds).then((v) => {
      if (alive) setInputs(v);
    });
    return () => {
      alive = false;
      // Let a remount with the same key load again.
      if (loadKeyRef.current === key) loadKeyRef.current = null;
    };
    // planKey stands in for planExerciseIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.enabled, p.isRecovery, p.uid, p.programId, planKey]);

  // Grace timer: finish with inputs still loading → calm state after a beat.
  useEffect(() => {
    if (!p.enabled || !p.finished || inputs !== undefined) return;
    const timer = setTimeout(() => setGraceOver(true), INPUTS_GRACE_MS);
    return () => clearTimeout(timer);
  }, [p.enabled, p.finished, inputs]);

  // 2. Instant preview on finish.
  useEffect(() => {
    if (!p.enabled || !p.finished || p.isRecovery || previewDoneRef.current) return;
    if (!inputs || !p.exerciseResults) return;
    if (reconciledRef.current) return; // the stored result already won
    previewDoneRef.current = true;
    try {
      setOutcome(computeLevelUpPreview(inputs, p.exerciseResults));
    } catch (e) {
      console.warn('[LevelUpV2] preview failed — calm state:', e);
    }
  }, [p.enabled, p.finished, p.isRecovery, inputs, p.exerciseResults]);

  // 3. Reconcile with the stored result.
  useEffect(() => {
    const stored = p.progressionResult;
    if (!p.enabled || !p.finished || !stored || reconciledRef.current === stored) return;
    if (inputs === undefined && !graceOver) return; // wait for inputs (or the grace) first
    reconciledRef.current = stored;
    let alive = true;
    void (async () => {
      const ins = inputs ?? null;
      let masterTrack: LevelPoint | null = null;
      if (stored.success && stored.childDomainGains?.length && p.uid) {
        const keys = [ins?.kind === 'master' ? ins.averaging?.masterSlug : undefined, p.programId].filter(
          (k): k is string => !!k,
        );
        masterTrack = await readStoredTrack(p.uid, keys);
      }
      if (!alive) return;
      const storedOutcome = outcomeFromStored(ins, stored, p.fallback, masterTrack);
      if (!storedOutcome) return;
      previewDoneRef.current = true;
      setOutcome((cur) => (sameOutcome(cur, storedOutcome) ? cur : storedOutcome));
    })();
    return () => {
      alive = false;
      if (reconciledRef.current === stored) reconciledRef.current = null;
    };
    // fallback is read once at reconcile time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.enabled, p.finished, p.progressionResult, inputs, graceOver, p.uid, p.programId]);

  const saveState: SaveState = (() => {
    // Recovery / empty log: the page never starts the write — nothing to save.
    if (p.isRecovery || p.progressionFailed || p.exerciseResults?.length === 0) return 'hidden';
    const r = p.progressionResult;
    if (!r) return 'saving';
    return r.success && r.trackWriteSucceeded !== false ? 'saved' : 'hidden';
  })();

  const ready = p.isRecovery || outcome !== null || inputs === null || (inputs !== undefined && inputs.kind === 'skipped') || graceOver || !!p.progressionResult;
  return { outcome, ready, saveState };
}
