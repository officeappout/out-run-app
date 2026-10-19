'use client';

/**
 * RunWorkoutOverview — the planned run's overview on the ONE overview drawer
 * (boards M-6a…6i, enable_home_v2). Replaces the #462 briefing for v2 users.
 *
 *   header   #462 run header (+ the chosen route's line on the map)
 *   strip    the journey strip (from the same legs as the axis)
 *   graphs   page 1 intensity · page 2 elevation along the workout (route only)
 *   פירוט    zone ladder · where to run
 *   level    קליל · מאוזן · עוצמתי (M-7d) — the main set's structure only
 *   edits    tappable paces → "התאם קצב" (M-7a); "החלף" on the main set →
 *            "החלף מקטע" (M-7b/7c) — all in RunEdits, owned by the host
 *   axis     "המיקום שלך · יוצאים מכאן" → warm-up → main (group) → cool-down,
 *            or "המסלול שבחרת" → walk there → … → laps note → walk back
 *   CTA      RunOverviewCta (mode chosen by the host)
 *
 * Presentational: the host (home sheet / map layer / Discover) owns the
 * route search, the start paths and the map.
 */

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import { JourneyStrip } from '@/components/ui/v2';
import { useUserStore } from '@/features/user';
import { calculateCalories } from '@/lib/calories.utils';
import OverviewDrawerShell from '@/features/parks/core/components/overview/OverviewDrawerShell';
import OverviewLegAxis from '@/features/parks/core/components/overview/OverviewLegAxis';
import { journeyItemsFromLegs } from '@/features/parks/core/components/overview/overview-legs';
import type { DetentId } from '@/features/parks/core/components/overview/overview-detents';
import { finishClock } from '@/features/parks/core/components/overview/route/route-overview';
import { readElevationSamples } from '../../lib/route-elevation-ahead';
import type { RouteWorkoutScore } from '../../lib/route-fit/types';
import type RunWorkout from '../../types/run-workout.type';
import type { RunWeekContext } from '../../utils/run-preview/run-week';
import { isCustomized, withVariant, type RunEdits } from '../../utils/run-overview/run-edits';
import { buildWorkoutElevation } from '../../utils/run-overview/run-elevation-bands';
import { routeChoiceView } from '../../utils/run-overview/run-route-choice';
import { RunCoachTip, RunSurfaceTiles, RunZoneLadder } from '../preview-v2/RunBriefingParts';
import { useRunOverviewModel } from './useRunOverviewModel';
import RunOverviewHeader from './RunOverviewHeader';
import RunVariantPicker from './RunVariantPicker';
import { ElevationPage, IntensityPage } from './RunOverviewGraphs';
import RunChosenRouteRow from './RunChosenRouteRow';
import RunOverviewCta, { type RunCtaMode } from './RunOverviewCta';
import { useRunOverviewEditor } from './edit/useRunOverviewEditor';

export interface RunOverviewRoute {
  route: Route;
  score: Pick<RouteWorkoutScore, 'fit'> | null;
}

export interface RunWorkoutOverviewProps {
  workout: RunWorkout;
  templateCategory?: string | null;
  week?: RunWeekContext | null;
  /** Level · swapped main set · edited paces (run-edits.ts). */
  edits: RunEdits;
  /** Omit for a read-only overview (no level / pace / swap edits). */
  onEditsChange?: (edits: RunEdits) => void;
  /** The chosen route (suggestion / Discover); null = a free run from here. */
  chosen?: RunOverviewRoute | null;
  origin?: { lat: number; lng: number } | null;
  ctaMode: RunCtaMode;
  /** Show the route line in the header (on the map, board M-6b). */
  routeLineInHeader?: boolean;
  onBack: () => void;
  onStart: () => void;
  onSuggest?: () => void;
  onStartOnRoute?: () => void;
  onClearRoute?: () => void;
  onShowOnMap?: () => void;
  onPickOnMap?: () => void;
  initialDetent?: DetentId;
  snapRequest?: { to: DetentId; n: number } | null;
}

const ROUTE_RAIL_NEXT = '#93C5FD';

export default function RunWorkoutOverview(props: RunWorkoutOverviewProps) {
  const { workout, templateCategory, week, edits, onEditsChange, chosen = null, origin = null, ctaMode } = props;
  const [detailOpen, setDetailOpen] = useState(false);
  const weightKg = useUserStore((s) => (s.profile?.core as { weight?: number } | undefined)?.weight);

  const view = useMemo(() => (chosen ? routeChoiceView(chosen.route, chosen.score, origin) : null), [chosen, origin]);
  const extras = useMemo(() => ({ templateCategory, week }), [templateCategory, week]);
  const om = useRunOverviewModel(workout, edits, extras, view?.walk ?? null);
  const editor = useRunOverviewEditor(workout, om, edits, onEditsChange);

  const elevation = useMemo(() => {
    if (!om || !chosen) return null;
    const samples = readElevationSamples(chosen.route);
    if (!samples) return null;
    try {
      return buildWorkoutElevation(om.active.blocks, om.pace.ctx, samples, { loop: !!view?.loop });
    } catch {
      return null;
    }
  }, [om, chosen, view?.loop]);

  if (!om) return null;
  const { model, legs, variants, pace } = om;
  const walkMin = view?.walk ? view.walk.thereMin + view.walk.backMin : 0;
  const minutes = model.minutes ?? 0;
  const finishText = minutes > 0 ? `מסיים ~${finishClock(Date.now(), minutes + walkMin)}` : null;
  const calories = calculateCalories('running', minutes, weightKg || undefined);

  const graphs = [<IntensityPage key="intensity" model={model} swipeHint={!!elevation} />];
  if (elevation) graphs.push(<ElevationPage key="elevation" geo={elevation} />);

  const hasDetail = (model.kind !== 'interval' && model.ladder.some((z) => z.active)) || model.surfaces.length > 0;

  return (
    <OverviewDrawerShell
      v2
      onBack={props.onBack}
      initialDetent={props.initialDetent}
      snapRequest={props.snapRequest}
      header={<RunOverviewHeader model={model} finishText={finishText} customized={isCustomized(edits)} routeLine={props.routeLineInHeader ? view?.headerLine : null} />}
      strip={<JourneyStrip v2 items={journeyItemsFromLegs(legs)} />}
      graphs={graphs}
      cta={(
        <RunOverviewCta
          mode={ctaMode}
          onStart={props.onStart}
          onStartOnRoute={props.onStartOnRoute}
          onSuggest={props.onSuggest}
          onClearRoute={props.onClearRoute}
          onPickOnMap={props.onPickOnMap}
        />
      )}
    >
      {hasDetail && (
        <>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}
              className="flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]">
              <ChevronDown size={15} style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /> פירוט
            </button>
          </div>
          {detailOpen && (
            <div className="mt-2 flex flex-col gap-4">
              {model.kind !== 'interval' && model.ladder.some((z) => z.active) && <RunZoneLadder items={model.ladder} />}
              <RunSurfaceTiles tiles={model.surfaces} />
            </div>
          )}
        </>
      )}

      {variants && onEditsChange && (
        <RunVariantPicker className="mt-2.5" variants={variants} value={edits.variant} manual={!!om.swap}
          onChange={(k) => onEditsChange(withVariant(edits, k))} ctx={pace.ctx} />
      )}

      <div className="mb-2.5 mt-5 whitespace-nowrap text-[17px] font-black !tracking-[-0.02em] text-v2-ink">מהלך האימון</div>
      <OverviewLegAxis
        v2
        legs={legs}
        origin={chosen && view ? (
          <RunChosenRouteRow
            route={chosen.route}
            view={view}
            calories={calories}
            nextColor={ROUTE_RAIL_NEXT}
            onShowOnMap={props.onShowOnMap}
            onClear={props.onClearRoute}
          />
        ) : undefined}
        originNote={chosen ? undefined : 'יוצאים מכאן · ה-GPS מודד את הדרך'}
        startLabel={chosen ? (view?.walk ? 'תחילת המסלול' : 'תחילת המסלול · כאן') : 'תחילת האימון'}
        endLabel="סיום האימון"
        beforeEnd={view ? (
          <div className="mb-1 whitespace-nowrap pr-14 text-[12px] font-extrabold text-v2-deep">{view.onRouteNote}</div>
        ) : undefined}
        showReturn={!!view?.walk && view.walk.backMin > 0}
        decorations={editor.decorations}
      />
      <div className="mt-3">
        <RunCoachTip text={model.tip} />
      </div>
      {editor.sheets}
    </OverviewDrawerShell>
  );
}
