'use client';

/**
 * RouteOverviewDrawer — a plain route in the ONE overview drawer (route mode,
 * boards M-5a / M-5b; enable_home_v2 only — callers mount it for v2 users and
 * keep RouteDetailSheet otherwise).
 *
 * Same shell as route + stops: header (name · time · distance · finish), the
 * "הלוך וחזור" pill, the journey strip, "פירוט" with the DifficultyBolts pill,
 * the activity trio (walk / run / ride, per-activity time), and the axis with
 * ONE expandable leg (lighting, dedicated path, ascent, calories, elevation,
 * points along the route). Data: only what the route already carries plus the
 * map's walk-to-route time for the focused route.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, MapPin, Navigation, Ruler } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import CaloriesChip from '@/components/ui/CaloriesChip';
import WeightInlineRow from '@/components/ui/WeightInlineRow';
import { IconButton, JourneyStrip, SegmentedPicker, WorkoutOverviewHeader } from '@/components/ui/v2';
import { useToast } from '@/components/ui/Toast';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useUserStore } from '@/features/user';
import { haversineKm } from '@/features/arena/utils/distance';
import { calculateCalories } from '@/lib/calories.utils';
import { computeStartExperienceState, formatTooFarLabels } from '@/features/parks/core/services/start-experience-state';
import { ROUTE_STOPS_ROUND_TRIP_KEY, readRoundTripPref } from '@/features/workout-engine/hybrid/round-trip';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { ActivityGlyph } from '../../hybrid/activity-icons';
import OverviewDrawerShell from '../OverviewDrawerShell';
import OverviewLegAxis from '../OverviewLegAxis';
import OverviewStartButton from '../OverviewStartButton';
import RoundTripPill from '../RoundTripPill';
import { journeyItemsFromLegs } from '../overview-legs';
import RouteLegDetail from './RouteLegDetail';
import {
  ROUTE_ACTIVITIES, activityMinutes, buildRouteLegs, finishClock, initialRouteActivity,
  isLoopRoute, routeDescription, routeWalkLegs, type RouteActivity,
} from './route-overview';
import ReportProblemButton from '@/features/generation-review/components/ReportProblemButton';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export interface RouteOverviewDrawerProps {
  route: Route;
  /** The map's current activity — used when the route has no walk/run/ride type of its own. */
  initialActivity?: string | null;
  userLocation?: { lat: number; lng: number } | null;
  cityName?: string;
  onBack: () => void;
  /** Start this route as the chosen activity (the caller sets the player's mode). */
  onStart: (route: Route, activity: RouteActivity) => void;
  /** Navigate to the trailhead (today's RouteDetailSheet navigate button). */
  onNavigate?: (route: Route) => void;
  /** The full route page (community, arrivals, credits) — RouteDetailSheet. */
  onOpenFullDetails?: () => void;
  /** Top of the body (board M-6j: "יש לך היום … · לאימון הזה כאן"). Omit → nothing. */
  topSlot?: ReactNode;
}

export default function RouteOverviewDrawer({
  route, initialActivity, userLocation, cityName, onBack, onStart, onNavigate, onOpenFullDetails, topSlot,
}: RouteOverviewDrawerProps) {
  const t = useT(map);
  const [activity, setActivity] = useState<RouteActivity>(() => initialRouteActivity(route, initialActivity));
  const [detailOpen, setDetailOpen] = useState(false);
  const [weightNudge, setWeightNudge] = useState(false);
  const [roundTripOn, setRoundTripOn] = useState<boolean>(readRoundTripPref);
  const toggleRoundTrip = () => {
    const next = !roundTripOn;
    setRoundTripOn(next);
    setOnboardingPref(ROUTE_STOPS_ROUND_TRIP_KEY, next ? '1' : '0');
  };
  const weightKg = useUserStore((s) => (s.profile?.core as { weight?: number } | undefined)?.weight);
  const walkToRouteMinutes = useMapStore((s) => s.walkToRouteMinutes);
  const { showToast } = useToast();

  const loop = isLoopRoute(route);
  const walk = routeWalkLegs(walkToRouteMinutes, loop);
  const legs = useMemo(
    () => buildRouteLegs(route, activity, roundTripOn ? walk : null, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, activity, roundTripOn, walk?.thereMin, walk?.backMin, t],
  );
  const routeMin = activityMinutes(route.distance, activity);
  const totalMin = routeMin + (roundTripOn && walk ? walk.thereMin + walk.backMin : 0);
  const calories = calculateCalories(activity, routeMin, weightKg || undefined);

  // Start-experience state (same rule as RouteDetailSheet): too far → toast, no start.
  const startState = computeStartExperienceState(userLocation ?? null, route.path ?? null, walkToRouteMinutes);
  const tooFar = startState === 'off_route_too_far';
  const tooFarLabels = useMemo(() => {
    const start = route.path?.[0];
    const km = userLocation && start ? haversineKm(userLocation.lat, userLocation.lng, start[1], start[0]) : null;
    return formatTooFarLabels(km, walkToRouteMinutes);
  }, [userLocation, route.path, walkToRouteMinutes]);

  const startLabel = t('overview.route.cta.start', { activity });
  const start = () => {
    if (tooFar) { showToast('error', tooFarLabels.toast); return; }
    onStart(route, activity);
  };

  return (
    <OverviewDrawerShell
      v2
      onBack={onBack}
      header={<>
        <WorkoutOverviewHeader
          v2
          title={route.name?.trim() || t('overview.route.nameFallback')}
          meta={[
            { key: 'time', text: t('overview.route.meta.min', { min: String(totalMin) }), tone: 'primary' },
            { key: 'km', text: t('overview.route.meta.km', { km: (route.distance ?? 0).toFixed(1) }), tone: 'secondary' },
            { key: 'finish', text: t('overview.route.meta.finish', { time: finishClock(Date.now(), totalMin) }), tone: 'secondary' },
          ]}
        />
        {walk && <RoundTripPill v2 on={roundTripOn} walkMin={walk.thereMin + walk.backMin} onToggle={toggleRoundTrip} />}
      </>}
      strip={<JourneyStrip v2 items={journeyItemsFromLegs(legs)} />}
      cta={(
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <OverviewStartButton v2 blocked={tooFar} onClick={start}
              label={tooFar ? tooFarLabels.cta : startLabel} ariaLabel={startLabel} />
          </div>
          {onNavigate && (
            <IconButton aria-label={t('overview.route.navigate.label')} size={48} className="shrink-0" onClick={() => onNavigate(route)}>
              <Navigation className="h-[18px] w-[18px] text-v2-deep" />
            </IconButton>
          )}
        </div>
      )}
    >
      {topSlot}
      {/* פירוט (collapsed by default) + the route's difficulty */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}
          className="flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]">
          <ChevronDown size={15} style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /> {t('overview.route.details.toggle')}
        </button>
        <span className="inline-flex shrink-0 items-center rounded-full bg-white shadow-v2-ring" style={{ padding: '5px 12px' }}>
          <DifficultyBolts difficulty={route.difficulty} size="sm" />
        </span>
      </div>
      {detailOpen && (
        <div className="mt-2">
          <div className="mb-2.5 flex items-start gap-1.5 text-[14px] leading-relaxed text-v2-ink-2">
            <MapPin size={14} style={{ color: '#64748b', flexShrink: 0, marginTop: 4 }} /> {routeDescription(route, t, cityName)}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring">
              <Ruler size={15} className="text-v2-deep" />{t('overview.route.meta.km', { km: (route.distance ?? 0).toFixed(1) })}
            </span>
            <CaloriesChip calories={calories} weightDependent onEditWeight={() => setWeightNudge(true)} />
          </div>
          {weightNudge && <WeightInlineRow onSaved={() => setWeightNudge(false)} />}
          {onOpenFullDetails && (
            <button type="button" onClick={onOpenFullDetails}
              className="mt-2.5 inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]">
              {t('overview.route.details.all')} <ChevronLeft size={15} />
            </button>
          )}
        </div>
      )}

      {/* Activity — the same trio shape as the intensity selector, with each activity's time */}
      <SegmentedPicker
        className="mt-2.5"
        ariaLabel={t('overview.route.activityPicker.label')}
        value={activity}
        onChange={setActivity}
        options={ROUTE_ACTIVITIES.map((a) => ({
          key: a,
          label: t('overview.route.activityOption', { activity: a, min: String(activityMinutes(route.distance, a)) }),
          icon: <ActivityGlyph kind="aerobic" subtype={a} className="w-[18px] h-[18px]" />,
        }))}
      />

      <div className="mt-5 mb-2.5 flex items-center gap-1.5 whitespace-nowrap text-[17px] font-black !tracking-[-0.02em] text-v2-ink">
        {t('overview.route.course.title')}
      </div>
      <OverviewLegAxis
        v2
        legs={legs}
        renderLegDetail={() => <RouteLegDetail route={route} calories={calories} />}
      />
      <ReportProblemButton types={['route_loop', 'route_ab']} wrapperClassName="flex justify-center py-3" />
    </OverviewDrawerShell>
  );
}
