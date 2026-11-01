'use client';

/**
 * useUnifiedGps — the unified frame's GPS state (enable_unified_player_v1, canvas 9ב) from the
 * running store. Ticks once a second so "lost" shows even when no sample arrives to re-render.
 */

import { useEffect, useState } from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { unifiedGps, type UnifiedGps } from '../../shared/v2/run-chrome/unified-chrome-logic';

export function useUnifiedGps(enabled: boolean): UnifiedGps {
  const status = useRunningPlayer((s) => s.gpsStatus);
  const hasHadGoodFix = useRunningPlayer((s) => s.hasHadGoodFix);
  const lastFixAt = useRunningPlayer((s) => s.lastFixAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return unifiedGps({ status, hasHadGoodFix, lastFixAt, now });
}
