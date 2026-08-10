'use client';

import { useEffect, useRef } from 'react';
import { useMapStore } from '../store/useMapStore';
import { IS_ADAPTIVE_SHED_ENABLED } from '@/config/feature-flags';

/**
 * useAdaptiveShed — the reactive half of the map-watchdog design
 * (.claude/plans/cryptic-munching-gadget.md, §5C). Reacts to
 * `useMapStore.pressureLevel` (computed by `useMapPerfMonitor` from FPS /
 * native memoryWarning / webglcontextlost — already hysteresis-protected at
 * the source, so this hook needs no timers of its own) by hiding partner
 * markers under sustained critical pressure, and restoring them on recovery.
 *
 * Restore never overrides a user's own choice: `liveUsersVisible` is only
 * flipped back to `true` if THIS hook was the one that flipped it to `false`
 * (tracked via `shedHidPartnersRef`). A user who had manually hidden
 * partners via the layers panel before pressure ever hit critical is left
 * exactly as they set it, on both entry and recovery.
 *
 * Known accepted edge case: if the user manually re-enables partner
 * visibility WHILE pressure is still 'critical', the shed does not fight
 * them immediately — it only re-evaluates on the NEXT `pressureLevel`
 * transition (this hook reads `liveUsersVisible` imperatively via
 * `getState()` rather than subscribing to it, specifically so a
 * user-initiated toggle doesn't itself re-trigger this effect).
 *
 * No-ops entirely when `IS_ADAPTIVE_SHED_ENABLED` is false.
 */
export function useAdaptiveShed(): void {
  const pressureLevel = useMapStore((s) => s.pressureLevel);
  const setLiveUsersVisible = useMapStore((s) => s.setLiveUsersVisible);
  const shedHidPartnersRef = useRef(false);

  useEffect(() => {
    if (!IS_ADAPTIVE_SHED_ENABLED) return;

    if (pressureLevel === 'critical') {
      if (useMapStore.getState().liveUsersVisible) {
        shedHidPartnersRef.current = true;
        setLiveUsersVisible(false);
      }
    } else if (shedHidPartnersRef.current) {
      shedHidPartnersRef.current = false;
      setLiveUsersVisible(true);
    }
  }, [pressureLevel, setLiveUsersVisible]);

  // Unmount safety: if the map unmounts while the shed is actively hiding
  // partners, restore visibility so a future mount doesn't inherit a hidden
  // state with no live pressureLevel signal driving it back.
  useEffect(() => {
    return () => {
      if (shedHidPartnersRef.current) {
        shedHidPartnersRef.current = false;
        setLiveUsersVisible(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
