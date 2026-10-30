'use client';

import { useCallback } from 'react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import { useSessionGoalProgress } from '../../../hooks/useSessionGoalProgress';
import type { ContinuousGoal } from '../../../lib/continuous-run';
import { aerobicLabel, rateMetricFor } from '../../../lib/aerobic-activity';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useComboFlowV1 } from '@/features/workout-engine/hybrid/v2/combo/useComboFlowV1';
import { aerobicMode, normalizeActivity, routeTitle } from '../../../lib/aerobic-player-view';

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
  // enable_combo_flow_v1 (boards PlayerFreeRun / PlayerMetrics, M26): one player for every walk, run
  // and ride. The title is the route's name, else "{activity} free" for walks too.
  const comboOn = useComboFlowV1();
  const sessionMode = useRunningPlayer((s) => s.sessionMode);
  const routeName = useRunningPlayer((s) => s.guidedRouteName);
  const routeKm = useRunningPlayer((s) => s.guidedRouteDistanceKm);
  const mode = aerobicMode(sessionMode, routeName);
  const activity = normalizeActivity(activityType);
  const freeTitle = t('run.free.title.ride', { activity: aerobicLabel(activityType) });

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
    title: comboOn
      ? routeTitle(mode, routeName) ?? freeTitle
      : activityType === 'cycling' ? freeTitle : t('run.free.title.run'),
    /** enable_combo_flow_v1: the per-activity drawer (aerobic-player-view). */
    combo: comboOn ? { mode, activity, routeKm: Number.isFinite(routeKm) ? (routeKm as number) : null } : null,
    laps,
    goal,
    pause,
    resume,
    lap,
    stop,
  };
}
