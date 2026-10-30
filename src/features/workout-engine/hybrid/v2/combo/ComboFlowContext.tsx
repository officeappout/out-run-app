'use client';

/**
 * ComboFlowProvider — runs the stage-change choreography (combo-choreography.ts) for the hybrid v2
 * player under enable_combo_flow_v1. Mounted inside HybridPlayerV2Provider, so the overlay, the
 * list behind and the station host all read one { kind, stage }. Flag off (or no hybrid session)
 * → kind and stage stay null and nothing in the player changes.
 *
 * Purely visual: the sequencer never waits for it. `skip()` (a tap) ends the current run at once.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useHybridPlayerV2 } from '../HybridPlayerV2Context';
import { comboSteps, detectComboTransition, type ComboPoint, type ComboStage, type ComboStep, type ComboTransitionKind } from './combo-choreography';
import { useComboFlowV1 } from './useComboFlowV1';

/** The session-list drop / dot move is not wired yet (next stage of the build): only the start chip is timed. */
export const COMBO_LAYER_WIRED = false;

export interface ComboFlowApi {
  on: boolean;
  kind: ComboTransitionKind | null;
  stage: ComboStage | null;
  /** Bumps on every new run (chip keys). */
  runId: number;
  skip: () => void;
}

const OFF: ComboFlowApi = { on: false, kind: null, stage: null, runId: 0, skip: () => {} };
const Ctx = createContext<ComboFlowApi>(OFF);

export function useComboFlow(): ComboFlowApi {
  return useContext(Ctx);
}

interface Run {
  id: number;
  kind: ComboTransitionKind;
  steps: ComboStep[];
}

export function ComboFlowProvider({ children }: { children: React.ReactNode }) {
  const api = useHybridPlayerV2();
  const flag = useComboFlowV1();
  const on = flag && !!api?.enabled;
  const reduce = !!useReducedMotion();
  const phase = api?.view?.phase ?? null;
  const cursor = api?.view?.cursor ?? 0;

  const prevRef = useRef<ComboPoint | null>(null);
  const idRef = useRef(0);
  const [run, setRun] = useState<Run | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const point = phase ? { phase, cursor } : null;
    const prev = prevRef.current;
    prevRef.current = point;
    if (!on || !point) return;
    const kind = detectComboTransition(prev, point);
    if (!kind) return;
    const steps = comboSteps(kind, { withLayer: COMBO_LAYER_WIRED, reducedMotion: reduce });
    if (!steps.length) return;
    idRef.current += 1;
    setRun({ id: idRef.current, kind, steps });
    setStep(0);
  }, [on, phase, cursor, reduce]);

  useEffect(() => {
    if (!run) return;
    const current = run.steps[step];
    if (!current) {
      setRun(null);
      return;
    }
    const timer = setTimeout(() => setStep((i) => i + 1), current.ms);
    return () => clearTimeout(timer);
  }, [run, step]);

  const skip = useCallback(() => setRun(null), []);

  const value = useMemo<ComboFlowApi>(
    () => (on ? { on, kind: run?.kind ?? null, stage: run?.steps[step]?.stage ?? null, runId: run?.id ?? 0, skip } : OFF),
    [on, run, step, skip],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
