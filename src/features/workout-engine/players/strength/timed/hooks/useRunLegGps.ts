'use client';

/**
 * useRunLegGps — GPS distance of a run item inside a round (board U-E3).
 * Watches the position only while a run item is current (`legKey` non-null;
 * a new key = a new visit, the distance restarts at 0) and always clears the
 * watch. "סיימתי" stays available, so a phone without GPS is never stuck.
 */
import { useEffect, useRef, useState } from 'react';
import { clearWatch, watchPosition } from '@/lib/services/location.service';
import { addRunFix, EMPTY_TRACK, type RunTrack } from '../logic/timed-feedback';

export function useRunLegGps(legKey: string | null, onDistance: (distanceM: number) => void): number {
  const cb = useRef(onDistance);
  cb.current = onDistance;
  const [distanceM, setDistanceM] = useState(0);

  useEffect(() => {
    setDistanceM(0);
    if (!legKey) return;
    let track: RunTrack = EMPTY_TRACK;
    const id = watchPosition((p) => {
      const next = addRunFix(track, { lat: p.lat, lng: p.lng });
      const grew = next.distanceM > track.distanceM;
      track = next;
      if (!grew) return;
      setDistanceM(next.distanceM);
      cb.current(next.distanceM);
    });
    return () => clearWatch(id);
  }, [legKey]);

  return distanceM;
}
