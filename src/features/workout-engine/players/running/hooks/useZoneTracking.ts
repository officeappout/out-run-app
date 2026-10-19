'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../store/useRunningPlayer';
import {
  EMPTY_ZONE_TIME,
  accumulateZoneTime,
  createZoneTracker,
  pushPaceSample,
  zoneTimePercent,
  type ZoneStatus,
  type ZoneTarget,
  type ZoneTimeAcc,
  type ZoneTrackerState,
} from '../lib/continuous-run';

export interface ZoneTracking {
  status: ZoneStatus;
  /** 15 s rolling pace, sec/km (null without valid samples). */
  rollingPaceSec: number | null;
  /** Time in zone of the current block, 0–100 (null until 10 s scored). */
  inZonePct: number | null;
}

const IDLE: ZoneTracking = { status: 'unknown', rollingPaceSec: null, inZonePct: null };

/**
 * Samples the live pace once a second (session ACTIVE seconds as the clock,
 * so a pause neither ages the window nor adds zone time) into the pure
 * tracker. One time-in-zone accumulator per `zoneKey` (the block index):
 * changing block starts a fresh window, and coming back to a block keeps
 * its tally. Read-only — nothing is stored or written.
 */
export function useZoneTracking(zone: ZoneTarget | null, zoneKey: number): ZoneTracking {
  const trackerRef = useRef<ZoneTrackerState>(createZoneTracker());
  const accRef = useRef<Map<number, ZoneTimeAcc>>(new Map());
  const lastTRef = useRef<number | null>(null);
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const [view, setView] = useState<ZoneTracking>(IDLE);

  const zoneSig = zone ? `${zone.minSec}-${zone.maxSec}` : 'none';
  useEffect(() => {
    trackerRef.current = createZoneTracker();
    lastTRef.current = null;
    setView({ ...IDLE, inZonePct: zoneTimePercent(accRef.current.get(zoneKey) ?? EMPTY_ZONE_TIME) });
  }, [zoneKey, zoneSig]);

  useEffect(() => {
    const id = setInterval(() => {
      const session = useSessionStore.getState();
      if (session.status !== 'active') return;
      const t = Number.isFinite(session.totalDuration) ? session.totalDuration : 0;
      const prevT = lastTRef.current;
      lastTRef.current = t;
      if (prevT !== null && t <= prevT) return; // clock did not move
      const paceMin = useRunningPlayer.getState().currentPace;
      const paceSec = Number.isFinite(paceMin) && paceMin > 0 ? paceMin * 60 : 0;
      const next = pushPaceSample(trackerRef.current, t, paceSec, zoneRef.current);
      trackerRef.current = next;
      const acc = accumulateZoneTime(accRef.current.get(zoneKey) ?? EMPTY_ZONE_TIME, next.status, prevT === null ? 0 : t - prevT);
      accRef.current.set(zoneKey, acc);
      setView({ status: next.status, rollingPaceSec: next.rollingPaceSec, inZonePct: zoneTimePercent(acc) });
    }, 1000);
    return () => clearInterval(id);
  }, [zoneKey]);

  return view;
}
