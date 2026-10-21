'use client';

/**
 * The route drawer (route mode, #490) with the reverse entry (board M-6j,
 * enable_home_v2 — mounted only where RouteOverviewOverlay already is):
 * when a planned run exists for today and workoutFitForRoute says it fits
 * this route, a small "יש לך היום: … · מתאים ב-N סיבובים" card offers
 * "לאימון הזה כאן", which switches the SAME drawer to today's workout on
 * this route (M-5c view = RunWorkoutOverview with the route chosen). Hidden
 * when it doesn't fit or there's no run today.
 */

import { useMemo, useState } from 'react';
import type { Route } from '@/features/parks/core/types/route.types';
import RouteOverviewOverlay, { type RouteOverviewOverlayProps } from '@/features/parks/core/components/overview/route/RouteOverviewOverlay';
import { buildWorkoutRouteNeeds, workoutFitForRoute } from '../../lib/route-fit';
import type { ScorableRoute } from '../../lib/route-fit/score-route-for-workout';
import type RunWorkout from '../../types/run-workout.type';
import { applyRunEdits, NO_RUN_EDITS, type RunEdits } from '../../utils/run-overview/run-edits';
import { useRunPaceContext } from './useRunOverviewModel';
import { useRunPreviewModel } from '../preview-v2/useRunPreviewModel';
import { useTodayPlannedRun, type TodayPlannedRun } from './useTodayPlannedRun';
import TodayWorkoutFitCard from './TodayWorkoutFitCard';
import RunWorkoutOverview from './RunWorkoutOverview';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export interface RouteOverviewWithTodayRunProps extends Omit<RouteOverviewOverlayProps, 'renderTopCard' | 'renderWorkoutView'> {
  /** Start today's planned run (the runner's edits applied) on this route. */
  onStartWorkoutOnRoute: (route: Route, workout: RunWorkout, at: { week: number; day: number }) => void;
}

export default function RouteOverviewWithTodayRun({ onStartWorkoutOnRoute, ...overlay }: RouteOverviewWithTodayRunProps) {
  const t = useT(player);
  const today = useTodayPlannedRun(true);
  const pace = useRunPaceContext();
  const [edits, setEdits] = useState<RunEdits>(NO_RUN_EDITS);
  const { route, userLocation = null } = overlay;

  const verdict = useMemo(() => {
    if (!today) return null;
    try {
      const needs = buildWorkoutRouteNeeds(
        { blocks: today.workout.blocks, category: today.workout.category, templateCategory: today.templateCategory },
        pace.ctx,
        { startAt: new Date(), origin: userLocation },
      );
      return workoutFitForRoute(route as ScorableRoute, needs);
    } catch {
      return null;
    }
  }, [today, pace.ctx, route, userLocation]);
  const extras = useMemo(() => ({ templateCategory: today?.templateCategory }), [today?.templateCategory]);
  const model = useRunPreviewModel(today?.workout ?? null, extras);

  const fits = !!(today && verdict?.fits && model);
  return (
    <RouteOverviewOverlay
      {...overlay}
      renderTopCard={fits ? (open) => (
        <TodayWorkoutFitCard model={model!} fitLabel={verdict!.label ?? t('run.overview.fitFallback')} onOpen={open} />
      ) : undefined}
      renderWorkoutView={fits ? (back) => (
        <RouteWorkoutView
          today={today!}
          route={route}
          score={{ fit: verdict!.fit }}
          origin={userLocation}
          edits={edits}
          onEditsChange={setEdits}
          onBack={back}
          onStart={() => onStartWorkoutOnRoute(route, applyRunEdits(today!.workout, edits, pace.ctx), { week: today!.week, day: today!.day })}
        />
      ) : undefined}
    />
  );
}

function RouteWorkoutView({ today, route, score, origin, edits, onEditsChange, onBack, onStart }: {
  today: TodayPlannedRun;
  route: Route;
  score: { fit: ReturnType<typeof workoutFitForRoute>['fit'] };
  origin: { lat: number; lng: number } | null;
  edits: RunEdits;
  onEditsChange: (e: RunEdits) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const week = useMemo(() => ({ week: today.week, day: today.day }), [today.week, today.day]);
  return (
    <RunWorkoutOverview
      workout={today.workout}
      templateCategory={today.templateCategory}
      week={week}
      edits={edits}
      onEditsChange={onEditsChange}
      chosen={{ route, score }}
      origin={origin}
      ctaMode="route"
      onBack={onBack}
      onStart={onStart}
      onStartOnRoute={onStart}
      onClearRoute={onBack}
    />
  );
}
