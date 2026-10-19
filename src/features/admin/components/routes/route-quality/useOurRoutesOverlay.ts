'use client';
/** Our mapped routes near the start for the map overlay — loaded only while the toggle is on. */
import { useEffect, useState } from 'react';
import type { OurRouteLine } from '@/lib/route-quality';
import { loadOurRoutesForQuality } from './our-routes-loader';

export function useOurRoutesOverlay(on: boolean, start: { lat: number; lng: number }, targetKm: number, cityName: string) {
  const [lines, setLines] = useState<OurRouteLine[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    setLoading(true);
    loadOurRoutesForQuality(start, targetKm, cityName).then(r => {
      if (!alive) return;
      setLines(r.lines);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [on, start.lat, start.lng, targetKm, cityName]); // eslint-disable-line react-hooks/exhaustive-deps
  return { lines: on ? lines : [], loading: on && loading };
}
