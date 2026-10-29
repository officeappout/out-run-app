'use client';
/**
 * useStartAtPark: applies start-at-park.ts (pilot M5, enable_park_live_v2). Mounted by the
 * classic station layer (arrive = useHybridRun.arrive) and by the v2 player (arrive = its
 * ARRIVE_MANUAL), each passing null when it does not own the arrival.
 */
import { useEffect, useRef } from 'react';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { useParkLiveV2 } from '@/hooks/useParkLiveV2';
import { useRunningPlayer } from '../players/running/store/useRunningPlayer';
import { useHybridRun } from './useHybridRun';
import { nextLeftRadius, shouldStartAtPark } from './start-at-park';

export function useStartAtPark(arrive: (() => void) | null): void {
  const parkLive = useParkLiveV2();
  const phase = useHybridRun((s) => s.phase);
  const isFinalLeg = useHybridRun((s) => s.isFinalLeg);
  const nextStationNumber = useHybridRun((s) => s.nextStationNumber);
  const station = useHybridRun((s) => s.upcomingStation);
  const lastPosition = useRunningPlayer((s) => s.lastPosition);
  const accuracyM = useRunningPlayer((s) => s.gpsAccuracy);
  const leftRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!parkLive || !arrive || doneRef.current || !station || !lastPosition) return;
    const distanceM = haversineMeters(lastPosition.lat, lastPosition.lng, station.lat, station.lng);
    const input = {
      phase, isFinalLeg, nextStationNumber, aerobicType: station.aerobicType,
      distanceM, accuracyM, leftRadius: leftRef.current,
    };
    if (shouldStartAtPark(input)) {
      doneRef.current = true;
      arrive();
      return;
    }
    leftRef.current = nextLeftRadius(leftRef.current, distanceM, accuracyM, station.aerobicType);
  }, [parkLive, arrive, phase, isFinalLeg, nextStationNumber, station, lastPosition, accuracyM]);
}
