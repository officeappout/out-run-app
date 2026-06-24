'use client';

import { useEffect } from 'react';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { resolveSessionGoal } from '@/features/arena/utils/resolveSessionGoal';

/**
 * Side-effect hook — bridges group session goal into the running player.
 *
 * Call this once inside the active running screen. It reads sessionGoal
 * (from the attendance doc) and myPersonalGoal (from member_statuses) out
 * of useSharedSession, resolves the effective goal, and writes it into
 * useRunningPlayer.setSessionGoal().
 *
 * When both values are undefined (solo run / no group session), this hook
 * is a no-op — it does not clear a goal that was set via another path.
 */
export function useGroupSessionGoal(): void {
  const sessionGoal = useSharedSession((s) => s.sessionGoal);
  const myPersonalGoal = useSharedSession((s) => s.myPersonalGoal);
  const setSessionGoal = useRunningPlayer((s) => s.setSessionGoal);

  useEffect(() => {
    // Skip entirely when no group session is loaded yet.
    if (sessionGoal === undefined && myPersonalGoal === undefined) return;

    const resolved = resolveSessionGoal(myPersonalGoal, sessionGoal);
    setSessionGoal(resolved);
  }, [sessionGoal, myPersonalGoal, setSessionGoal]);
}
