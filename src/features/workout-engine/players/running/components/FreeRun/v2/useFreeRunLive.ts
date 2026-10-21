'use client';

import { useCallback } from 'react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useSessionGoalProgress } from '../../../hooks/useSessionGoalProgress';
import type { ContinuousGoal } from '../../../lib/continuous-run';
import { aerobicLabel, rateMetricFor } from '../../../lib/aerobic-activity';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

/**
 * Live free-run values + actions for the v2 free-run pieces (overlay, mini
 * player, laps layer). Same stores and actions today's FreeRun UI uses —
 * pause / resume via the session store, lap + finish via the running player.
 */
export function useFreeRunLive() {
  const t = useT(player);
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const status = useSessionStore((s) => s.status);
  const pauseSession = useSessionStore((s) => s.pauseSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const totalCalories = useRunningPlayer((s) => s.totalCalories);
  const currentPace = useRunningPlayer((s) => s.currentPace);
  const laps = useRunningPlayer((s) => s.laps);
  const activityType = useRunningPlayer((s) => s.activityType);
  const progress = useSessionGoalProgress();

  // Calorie goals have no hero / remaining text in this layout — shown as no goal.
  const goal: ContinuousGoal | null =
    progress && (progress.type === 'time' || progress.type === 'distance')
      ? { type: progress.type, target: progress.targetValue, current: progress.currentValue }
      : null;

  const vibrate = (ms: number) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  };
  const pause = useCallback(() => {
    vibrate(12);
    pauseSession();
  }, [pauseSession]);
  const resume = useCallback(() => {
    vibrate(12);
    resumeSession();
  }, [resumeSession]);
  const lap = useCallback(() => {
    useRunningPlayer.getState().triggerLap();
    vibrate(15);
  }, []);
  const stop = useCallback(async () => {
    await useRunningPlayer.getState().finishWorkout();
  }, []);

  return {
    totals: {
      durationSec: Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0,
      distanceKm: Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0,
      calories: Number.isFinite(totalCalories) && totalCalories > 0 ? totalCalories : 0,
    },
    currentPaceSec: Number.isFinite(currentPace) && currentPace > 0 ? currentPace * 60 : 0,
    isPaused: status === 'paused',
    /** 'speed' for a ride (enable_home_v2 cycling), else 'pace'. */
    metric: rateMetricFor(activityType),
    /** "ריצה חופשית" / "רכיבה חופשית" — today's free-run title for walks and runs. */
    title: activityType === 'cycling' ? t('run.free.title.ride', { activity: aerobicLabel(activityType) }) : t('run.free.title.run'),
    laps,
    goal,
    pause,
    resume,
    lap,
    stop,
  };
}
