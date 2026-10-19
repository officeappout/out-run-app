'use client';

/**
 * HybridPlayerV2Context — mounts the hybrid sequencer for the home-v2 hybrid
 * player (enable_home_v2) and keeps it in step with useHybridRun
 * (hybrid-v2-sync.ts). Lives ABOVE FreeRunLayer's two-layer shell so the
 * overlay, the mini-player and the list behind (mounted / unmounted as the
 * player is dragged) all read the same state.
 *
 * `enabled: false` (flag off, or no hybrid session) = inert: no plan, no
 * effects, no override — today's hybrid flow is untouched.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { hapticMedium } from '@/lib/haptics';
import { useSessionStore } from '../../core/store/useSessionStore';
import { useRunningPlayer } from '../../players/running/store/useRunningPlayer';
import { useHybridSequencer, type SequencerEventInput } from '../../engines/hooks/useHybridSequencer';
import { reduceSequencer } from '../../engines/hybrid/hybrid-sequencer';
import { finalizeSequencer, legResults, type LegResult, type SequencerView } from '../../engines/hybrid/sequencer.selectors';
import { sequencerStrip } from '../../engines/hybrid/sequencer.strip';
import type { SequencerState } from '../../engines/hybrid/sequencer.types';
import type { StripModel } from '../../engines/strip-item';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import { hybridRunSnapshot, setHybridFinalizeOverride, useHybridRun } from '../useHybridRun';
import { needsLegacyArrive, needsSequencerStart, stationCloseEvents } from './hybrid-v2-sync';

export interface HybridPlayerV2Api {
  enabled: boolean;
  plan: HybridPlannedSegment[];
  names: Record<string, string>;
  state: SequencerState | null;
  view: SequencerView | null;
  strip: StripModel | null;
  legs: LegResult[];
  transitionSec: number;
  /** "הגעתי" (works with or without GPS). */
  arriveNow: () => void;
  /** Skip the station the current leg leads to (before arriving). */
  skipUpcoming: () => void;
  /** "דלג" on the transition card. */
  skipStation: () => void;
  startStationNow: () => void;
  extendTransition: () => void;
  toggleTransitionPause: () => void;
  /** "סיום" — saves the sequencer's result through useHybridRun.finishHybrid. */
  finish: () => void;
}

const EMPTY: HybridPlannedSegment[] = [];
const Ctx = createContext<HybridPlayerV2Api | null>(null);

export function useHybridPlayerV2(): HybridPlayerV2Api | null {
  return useContext(Ctx);
}

export function HybridPlayerV2Provider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const storePlan = useHybridRun((s) => s.plan);
  const names = useHybridRun((s) => s.stationNames);
  const legacyPhase = useHybridRun((s) => s.phase);
  const legacyActive = useHybridRun((s) => s.active);
  const plan = enabled ? storePlan : null;

  const { state, view, dispatch } = useHybridSequencer(plan, {
    enabled,
    onPhase: (phase) => {
      if (phase === 'transition') hapticMedium();
    },
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const phase = state?.phase ?? null;

  // ── Saved result = the sequencer's finalize (finishHybrid reads it) ─────
  useEffect(() => {
    if (!enabled) return;
    setHybridFinalizeOverride(({ cumulativeKm, elapsedSec, atMs }) => {
      const s = stateRef.current;
      if (!s || s.phase === 'idle') return null;
      const final = s.phase === 'done' ? s : reduceSequencer(s, { type: 'FINISH', atMs, cumulativeKm, elapsedSec });
      return finalizeSequencer(final);
    });
    return () => setHybridFinalizeOverride(null);
  }, [enabled]);

  // ── Start with the legacy session ───────────────────────────────────────
  useEffect(() => {
    if (enabled && needsSequencerStart(phase, legacyPhase, legacyActive)) dispatch({ type: 'START' });
  }, [enabled, phase, legacyPhase, legacyActive, dispatch]);

  // ── Run progress → RUN_TICK (a GPS fix only when it is a NEW one) ───────
  // Selectors return constants while disabled, so a normal run never re-renders this provider.
  const totalDistance = useSessionStore((s) => (enabled ? s.totalDistance : 0));
  const totalDuration = useSessionStore((s) => (enabled ? s.totalDuration : 0));
  const lastPosition = useRunningPlayer((s) => (enabled ? s.lastPosition : null));
  const gpsAccuracy = useRunningPlayer((s) => (enabled ? s.gpsAccuracy : null));
  const lastFixRef = useRef<typeof lastPosition>(null);
  useEffect(() => {
    if (!enabled || (phase !== 'run' && phase !== 'cooldown')) return;
    const fresh = lastPosition != null && lastPosition !== lastFixRef.current;
    lastFixRef.current = lastPosition;
    dispatch({
      type: 'RUN_TICK',
      cumulativeKm: Number.isFinite(totalDistance) ? totalDistance : 0,
      elapsedSec: Number.isFinite(totalDuration) ? totalDuration : 0,
      fix: fresh && lastPosition ? { lat: lastPosition.lat, lng: lastPosition.lng, accuracyM: gpsAccuracy ?? null } : null,
    });
  }, [enabled, phase, totalDistance, totalDuration, lastPosition, gpsAccuracy, dispatch]);

  // ── Sequencer arrived → the station runtime opens it ───────────────────
  useEffect(() => {
    if (enabled && needsLegacyArrive(phase, legacyPhase)) useHybridRun.getState().arrive();
  }, [enabled, phase, legacyPhase]);

  // ── Station runtime closed the station → the sequencer closes it too ───
  const prevLegacy = useRef(legacyPhase);
  useEffect(() => {
    const prev = prevLegacy.current;
    prevLegacy.current = legacyPhase;
    const s = stateRef.current;
    if (!enabled || !s) return;
    const actual = hybridRunSnapshot()?.actuals[s.inner.cursor];
    for (const ev of stationCloseEvents(s.phase, prev, legacyPhase, actual)) dispatch(ev as SequencerEventInput);
  }, [enabled, legacyPhase, dispatch]);

  // ── Plan ran out (it ended on a station) → save, like the final "סיום" ──
  useEffect(() => {
    if (enabled && phase === 'done' && useHybridRun.getState().active) void useHybridRun.getState().finishHybrid();
  }, [enabled, phase]);

  const arriveNow = useCallback(() => dispatch({ type: 'ARRIVE_MANUAL' }), [dispatch]);
  const skipUpcoming = useCallback(() => {
    // Through the station (0 s of transition) so the leg closes where the runner is now.
    dispatch({ type: 'ARRIVE_MANUAL' });
    dispatch({ type: 'SKIP_STATION' });
    useHybridRun.getState().skipStation();
  }, [dispatch]);
  const skipStation = useCallback(() => {
    dispatch({ type: 'SKIP_STATION' });
    useHybridRun.getState().skipStation();
  }, [dispatch]);
  const startStationNow = useCallback(() => dispatch({ type: 'START_STATION' }), [dispatch]);
  const extendTransition = useCallback(() => dispatch({ type: 'EXTEND_TRANSITION' }), [dispatch]);
  const toggleTransitionPause = useCallback(() => dispatch({ type: stateRef.current?.paused ? 'RESUME' : 'PAUSE' }), [dispatch]);
  const finish = useCallback(() => void useHybridRun.getState().finishHybrid(), []);

  const strip = useMemo(() => (state && enabled ? sequencerStrip(state) : null), [state, enabled]);
  const legs = useMemo(() => (state && enabled ? legResults(state) : []), [state, enabled]);

  const api = useMemo<HybridPlayerV2Api>(
    () => ({
      enabled: enabled && !!state,
      plan: plan ?? EMPTY,
      names,
      state,
      view,
      strip,
      legs,
      transitionSec: state?.options.transitionSec ?? 20,
      arriveNow,
      skipUpcoming,
      skipStation,
      startStationNow,
      extendTransition,
      toggleTransitionPause,
      finish,
    }),
    [enabled, plan, names, state, view, strip, legs, arriveNow, skipUpcoming, skipStation, startStationNow, extendTransition, toggleTransitionPause, finish],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
