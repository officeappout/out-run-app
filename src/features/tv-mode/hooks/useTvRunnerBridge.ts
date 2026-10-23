'use client';

import { useEffect } from 'react';
import type { TvMirror } from '../core/types';
import { useTvPhoneStore, type TvParticipantProgress, type TvRemoteControls } from '../phone/phone-store';

/**
 * The ONE call a player makes to take part in TV mode (not wired into StrengthRunner yet — it
 * is being reworked by #768 / #712; wire this after they land):
 *
 *   useTvRunnerBridge({ mirror, controls: { togglePause, next, prev, skipExercise }, progress });
 *
 * - host phone: `mirror` is published to the TV, `controls` drive the phone remote.
 * - participant phone: `progress` shows up in the TV friends row.
 * Does nothing unless this phone is connected to a TV session.
 */
export function useTvRunnerBridge(input: { mirror: TvMirror | null; controls: TvRemoteControls | null; progress?: TvParticipantProgress | null }): void {
  const role = useTvPhoneStore((s) => s.role);
  const { mirror, controls, progress } = input;
  useEffect(() => {
    if (role !== 'host') return;
    useTvPhoneStore.getState().setMirror(mirror, controls);
    return () => useTvPhoneStore.getState().setMirror(null, null);
  }, [role, mirror, controls]);
  useEffect(() => {
    if (role !== 'participant') return;
    useTvPhoneStore.getState().setProgress(progress ?? null);
    return () => useTvPhoneStore.getState().setProgress(null);
  }, [role, progress]);
}
