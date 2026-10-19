'use client';

/**
 * HybridOverviewScreen — the pre-run "מבט-על" for a composed hybrid session
 * (route + stops / full park / budget split). Since 19.10.2026 it is ONE
 * CONSUMER of the generic overview drawer (overview/OverviewDrawerShell —
 * the draggable 3-detent sheet over the LIVE map) and its leg axis
 * (HybridJourneyAxis → OverviewLegAxis). STABILITY: renders the SAME
 * composed plan that will run — no re-compose. Output is byte-identical to
 * the pre-split screen in both flag states (overview/__tests__ parity).
 */

import { useState, useEffect, useMemo } from 'react';
import { Ruler, MapPin, Info, ChevronLeft, ChevronDown } from 'lucide-react';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import CaloriesChip from '@/components/ui/CaloriesChip';
import WeightInlineRow from '@/components/ui/WeightInlineRow';
import HybridJourneyAxis, { buildHybridLegs } from './HybridJourneyAxis';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';
import { HYBRID_AER as AER } from './hybrid-colors'; // single source (point 15)
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';
import { ROUTE_STOPS_ROUND_TRIP_KEY, readRoundTripPref, displayTotalMin, buildWalkLegsGeoJSON } from '@/features/workout-engine/hybrid/round-trip';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import { JourneyStrip, WorkoutOverviewHeader } from '@/components/ui/v2';
import OverviewDrawerShell from '../overview/OverviewDrawerShell';
import OverviewStartButton from '../overview/OverviewStartButton';
import RoundTripPill from '../overview/RoundTripPill';
import { journeyItemsFromLegs } from '../overview/overview-legs';
import ReportProblemButton from '@/features/generation-review/components/ReportProblemButton';
import { aerobicKindLabel } from '@/features/workout-engine/hybrid/aerobic-kind';

const ACCENT = '#00ADEF';
const STR_TINT = '#ECFEFF', STR_TEXT = '#0E7490'; // cyan tint/text from color-system.md (no new hex)

function Chip({ icon, children, tint, v2 = false }: { icon: React.ReactNode; children: React.ReactNode; tint?: string; v2?: boolean }) {
  if (v2) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring">
        <span style={{ color: tint ?? ACCENT }}>{icon}</span>{children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-white rounded-lg text-[12.5px] font-bold"
      style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '6px 11px', color: '#374151' }}>
      <span style={{ color: tint ?? ACCENT }}>{icon}</span>{children}
    </span>
  );
}

interface Props {
  composed: ComposedHybridSession;
  cityName?: string;
  onStart: () => void;
  onBack: () => void;
  /** Tap an exercise → the real preview detail drawer (owned by DiscoverLayer). */
  onExerciseTap?: (we: any) => void;
  /** Swap at [segIndex][exIndex] → the real replacement modal (owned by DiscoverLayer). */
  onSwapExercise?: (segIndex: number, exIndex: number, we: any) => void;
  /**
   * needs-assessment link follow-up: present ONLY when `composed.assessmentDomains`
   * is set (the fallback banner is the needsAssessment message, never a real rest
   * day) — renders the A3 banner below as a real link to the mini-questionnaire
   * (owned by DiscoverLayer, via startMiniDomainAssessment) instead of a dead end.
   */
  /**
   * Domain-assessment gate (David, 23-24.09.2026): now also invoked PER SEGMENT
   * from a locked station card (HybridJourneyAxis), passing that segment's own
   * assessmentDomains. Called with no args (or an empty array) for the
   * session-level banner below — the owner (DiscoverLayer) falls back to
   * `composed.assessmentDomains` in that case, unchanged from before.
   */
  onAssessmentLink?: (domains?: string[]) => void;
}

export default function HybridOverviewScreen({ composed, cityName, onStart, onBack, onExerciseTap, onSwapExercise, onAssessmentLink }: Props) {
  const { fallbackHint, aerobicKind } = composed;
  // Home v2 (enable_home_v2): the design-lab drawer — v2 surface sheet, white cards,
  // tinted segmented difficulty, round white icon button, the single gradient CTA.
  // Flag off = today's drawer, byte-for-byte.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  // Difficulty carousel (full-park only): 3 pre-composed bolt plans, swap by index —
  // NO re-compose. `plan` = the active bolt; budget-split cards have no `bolts` and
  // keep their single `composed.plan` unchanged.
  const [boltIndex, setBoltIndex] = useState(composed.bolts?.selectedIndex ?? 1);
  const plan = composed.bolts ? composed.bolts.plans[boltIndex] : composed.plan;
  const selectBolt = (i: number) => {
    setBoltIndex(i);
    if (composed.bolts) {
      // Keep the shared composed object in sync so the SAME object shown in the
      // overview is the one that runs at start (compose-once; see runHybridPlan).
      composed.bolts.selectedIndex = i;
      composed.plan = composed.bolts.plans[i];
    }
  };
  const t = plan.totals;
  // Round-trip (Phase 2, route_stops + published-route backbone only): walk-there + walk-back
  // are ADDED ON TOP of the workout minutes, for display. Default ON; durable pref.
  const roundTripLegs = composed.roundTrip ?? null;
  const [roundTripOn, setRoundTripOn] = useState<boolean>(readRoundTripPref);
  const toggleRoundTrip = () => {
    const next = !roundTripOn;
    setRoundTripOn(next);
    setOnboardingPref(ROUTE_STOPS_ROUND_TRIP_KEY, next ? '1' : '0');
  };
  const workoutMin = Math.round((t.aerobicMin ?? 0) + (t.strengthMin ?? 0));
  const totalMin = displayTotalMin(workoutMin, roundTripLegs, roundTripOn);

  // Route description (point 11). ⚠️ TEMPORARY placeholder copy, generated from the
  // composed plan. The real per-route descriptions will come from the ADMIN PANEL —
  // do NOT invest in this wording; replace the whole string when the panel source
  // lands. Neutral "מסלול" on purpose — this comment predates the full-park/route-stops
  // split and used to say "not a loop" because the ONLY shape back then was out-and-back
  // (composeFullParkWorkout). That's no longer true: composeHybridPlan's default branch
  // is an anchor-biased LOOP and composeRouteStopsWorkout's backbone is literally named
  // 'generated_loop' (verified 07-08.08.2026) — "מסלול" stays neutral now because this
  // screen renders all 3 route shapes, not because the route is never a loop.
  const stationCount = plan.segments.filter((s) => s.kind === 'strength').length;
  const stationsLabel = stationCount === 1 ? 'תחנת כוח אחת' : `${stationCount} תחנות כוח`;
  const routeDesc = `מסלול של ${t.distanceKm != null ? t.distanceKm.toFixed(1) : '—'} ק״מ עם ${stationsLabel} בדרך${cityName ? `, ב${cityName}` : ''}.`;

  // Point 15: strength-station positions as fractions (0..1) along the WALKING route
  // (cumulative aerobic km / total aerobic km). Fed to the map so it can paint the
  // green→blue→green line-gradient at each station — same source as the axis colors.
  const routeStationFracs = useMemo(() => {
    const total = plan.segments.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + (s.distanceKm ?? 0), 0);
    if (total <= 0) return [];
    const fracs: number[] = [];
    let km = 0;
    for (const s of plan.segments) {
      if (s.kind === 'aerobic') km += s.distanceKm ?? 0;
      else if (s.kind === 'strength') fracs.push(Math.min(0.999, Math.max(0.001, km / total)));
    }
    return fracs;
  }, [plan]);
  const [showWeightNudge, setShowWeightNudge] = useState(false);
  // "פירוט" progressive-disclosure section (full-park only), collapsed by default.
  const [detailOpen, setDetailOpen] = useState(false);

  // Warmup skip/expand (full-park). Mirrors WorkoutPreviewDrawer's local state; the skip
  // is carried onto the SHARED composed object so the RUN strips the warmup (useHybridRun),
  // not just the display. Undefined composed.isWarmupActive = active (warmup runs).
  const [isWarmupActive, setIsWarmupActive] = useState(composed.isWarmupActive ?? true);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(true);
  const toggleWarmupActive = () =>
    setIsWarmupActive((v) => {
      const next = !v;
      composed.isWarmupActive = next;
      if (!next) setIsWarmupExpanded(false); // skip auto-collapses (matches the drawer)
      return next;
    });
  const toggleWarmupExpanded = () => setIsWarmupExpanded((v) => !v);

  // Estimated finish = now + total workout minutes → "HH:MM" (24h, zero-padded —
  // mirrors the run commute's formatArrivalClock convention). Estimate → "~" prefix.
  const finishAt = new Date(Date.now() + totalMin * 60_000);
  const finishClock = `${finishAt.getHours().toString().padStart(2, '0')}:${finishAt.getMinutes().toString().padStart(2, '0')}`;

  // Header title. route_stops ALSO carries `bolts` (a trio, like full_park) — `bolts`
  // truthiness alone can't tell the two apart. `fullParkRun===false` is the definitive
  // route_stops signal (composeRouteStopsWorkout sets it explicitly; full_park never
  // does, so it falls through to the existing bolts branch). David, 23.09.2026 — bug #2.
  // Domain-assessment gate (David, 23-24.09.2026): zero real stations resolved on this
  // route + unassessed → fallbackHint is set alongside a REAL (non-stub) plan here —
  // "don't call it a stations workout when there are no stations." Plain aerobic-kind
  // title instead; the nudge itself renders via the existing A3 fallback banner below.
  const overviewTitle = composed.fullParkRun === false
    // sessionTitle: enable_hybrid_cards_v2's smart walk ("הליכה + כוח"); absent → unchanged.
    ? (fallbackHint ? aerobicKindLabel(aerobicKind) : (composed.sessionTitle ?? 'מסלול + עצירות'))
    : composed.bolts
    ? (MAP_OVERVIEW_CHROME_V1 ? `אימון מלא בפארק · ${aerobicKindLabel(aerobicKind)} + תחנת כוח` : 'אימון משולב')
    : 'אימון משולב';

  // Moovit-style at-a-glance sequence (RTL): walk-leg (mins) › station › walk-leg …
  // Built from the SAME overview legs the axis renders (buildHybridLegs), through the
  // shared JourneyStrip primitive.
  const showWalkLegs = roundTripOn && roundTripLegs != null;
  const journeyItems = journeyItemsFromLegs(buildHybridLegs(plan.segments, {
    stationName: composed.station?.name,
    walkLegs: showWalkLegs ? { thereMin: roundTripLegs!.walkThereMin, backMin: roundTripLegs!.walkBackMin } : null,
    aerobicKind,
  }));

  // Point 15: publish the station fractions for the map route gradient (cleared on
  // unmount so non-hybrid routes render with their normal flat color).
  const setHybridRouteStations = useMapStore((s) => s.setHybridRouteStations);
  useEffect(() => {
    setHybridRouteStations(routeStationFracs);
  }, [routeStationFracs, setHybridRouteStations]);
  useEffect(() => () => setHybridRouteStations(null), [setHybridRouteStations]);

  // Round-trip walk legs → dashed map overlay (null when the toggle is off / nothing drawable).
  const setHybridWalkLegs = useMapStore((s) => s.setHybridWalkLegs);
  useEffect(() => {
    setHybridWalkLegs(buildWalkLegsGeoJSON(roundTripLegs, roundTripOn));
  }, [roundTripLegs, roundTripOn, setHybridWalkLegs]);
  useEffect(() => () => setHybridWalkLegs(null), [setHybridWalkLegs]);

  return (
    <OverviewDrawerShell
      v2={v2}
      onBack={onBack}
      header={<>
        {/* design-unification (05.08.2026): ONE row for every hybrid card — title ·
            duration · finish. */}
        <WorkoutOverviewHeader
          v2={v2}
          title={overviewTitle}
          meta={[
            { key: 'time', text: `${totalMin} דק׳`, tone: 'primary' },
            { key: 'finish', text: `מסיים ~${finishClock}`, tone: 'secondary' },
          ]}
        />
        {roundTripLegs && (
          <RoundTripPill v2={v2} on={roundTripOn} walkMin={roundTripLegs.walkThereMin + roundTripLegs.walkBackMin} onToggle={toggleRoundTrip} />
        )}
      </>}
      strip={<JourneyStrip items={journeyItems} v2={v2} />}
      cta={<OverviewStartButton v2={v2} label="התחל אימון" ariaLabel="התחל אימון משולב" onClick={onStart} />}
    >
      {/* A3 fallback banner — needs-assessment link follow-up: when
          composed.assessmentDomains is set (needsAssessment, never a real
          rest day), the SAME approved copy (buildNeedsAssessmentResult)
          becomes a real tappable link to the mini-questionnaire instead of
          a dead end — matches the existing nudge-alongside-real-content
          pattern in ProgramsSection.tsx (dashed-border "טרם הוערך" cards)
          and StatsOverview.tsx (chip row, StatsOverview.tsx:1169-1193).
          Comment corrected (09.08.2026): this does NOT match
          WorkoutBuilderSheet, whose unassessed/unenrolled-domain path is a
          hard-blocking showUnlockModal, not a passive nudge beside real
          content — verified directly, not the same pattern. */}
      {fallbackHint && onAssessmentLink && composed.assessmentDomains?.length ? (
        <button
          type="button"
          onClick={() => onAssessmentLink()}
          className="w-full flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold text-start active:scale-[0.98] transition-transform"
          style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}
        >
          <Info size={15} className="flex-shrink-0" />
          <span className="flex-1 underline underline-offset-2">{fallbackHint}</span>
          <ChevronLeft size={15} className="flex-shrink-0" />
        </button>
      ) : fallbackHint && (
        <div className="flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold" style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}>
          <Info size={15} /> {fallbackHint}
        </div>
      )}
      {/* Budget light mode (enable_budget_light_mode): why this session is lighter. Flag off →
          composed.budgetLightNote is never set, nothing renders. */}
      {!fallbackHint && composed.budgetLightNote && (
        <div className="flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold" style={{ background: '#EFF9FE', border: '0.5px solid #BAE6FD', color: '#0369A1', padding: '9px 12px' }}>
          <Info size={15} className="flex-shrink-0" /> <span className="flex-1">{composed.budgetLightNote}</span>
        </div>
      )}

      {/* design-unification (05.08.2026): "פירוט" collapsible (defaultOpen=false) for
          EVERY hybrid card — was full-park-only; budget-split ("הליכה+כוח") used to
          render an always-visible chip row instead. routeDesc/t/showWeightNudge are
          all already computed generically above (not full-park-specific). */}
      <div className="mt-3">
        <button type="button" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}
          className={v2 ? 'flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'flex items-center gap-1 text-[12px] font-black active:scale-[0.98] transition-transform'} style={v2 ? undefined : { color: '#6B7280', letterSpacing: '.03em' }}>
          <ChevronDown size={15} style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /> פירוט
        </button>
        {detailOpen && (
          <div className="mt-2">
            {/* Route description in prose (point 11) — replaces the old location row */}
            <div className={v2 ? 'flex items-start gap-1.5 text-[14px] leading-relaxed mb-2.5 text-v2-ink-2' : 'flex items-start gap-1.5 text-[12.5px] leading-relaxed mb-2.5'} style={v2 ? undefined : { color: '#4B5563' }}>
              <MapPin size={14} style={{ color: v2 ? '#64748b' : '#9CA3AF', flexShrink: 0, marginTop: v2 ? 4 : 2 }} /> {routeDesc}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Chip icon={<Ruler size={15} />} tint={AER} v2={v2}>{t.distanceKm?.toFixed(1)} ק״מ</Chip>
              <CaloriesChip calories={t.estCalories ?? 0} weightDependent onEditWeight={() => setShowWeightNudge(true)} />
            </div>
            {showWeightNudge && <WeightInlineRow onSaved={() => setShowWeightNudge(false)} />}
          </div>
        )}
      </div>

      {/* meta row — difficulty carousel (full-park, קל/בינוני/קשה with emergent
          minutes) or, for budget-split cards, the original static bolts pill */}
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {composed.bolts ? (
          <div className={v2 ? 'flex w-full items-stretch bg-white rounded-full shadow-v2-ring' : 'flex w-full items-stretch bg-white rounded-full'} role="group" aria-label="בחירת עצימות"
            style={v2 ? { padding: 4, gap: 4 } : { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: 3, gap: 3 }}>
            {composed.bolts.labels.map((label, i) => {
              const bt = composed.bolts!.plans[i].totals;
              const bmin = Math.round((bt.aerobicMin ?? 0) + (bt.strengthMin ?? 0));
              const active = i === boltIndex;
              return (
                <button key={label} type="button" onClick={() => selectBolt(i)} aria-pressed={active}
                  className={v2
                    ? `flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full transition-all duration-150 ease-v2 active:scale-[0.97] ${active ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-transparent'}`
                    : 'flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full active:scale-[0.98] transition-all duration-200'}
                  style={v2 ? { padding: '7px 6px' } : { padding: '7px 6px', background: active ? STR_TINT : 'transparent' }}>
                  {/* graduated bolts via the shared DifficultyBolts (reuse, not modified): קליל 1 / מאוזן 2 / עוצמתי 3 */}
                  <DifficultyBolts difficulty={(i + 1) as 1 | 2 | 3} size="sm" />
                  <span className={v2 ? `text-[12.5px] font-extrabold whitespace-nowrap ${active ? 'text-v2-deep' : 'text-v2-ink-2'}` : 'text-[11px] font-bold whitespace-nowrap'} style={v2 ? undefined : { color: active ? STR_TEXT : '#6B7280' }}>
                    {label} · {bmin}׳
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className={v2 ? 'inline-flex items-center bg-white rounded-full shadow-v2-ring' : 'inline-flex items-center bg-white rounded-lg'} style={v2 ? { padding: '5px 12px' } : { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '4px 10px' }}>
            <DifficultyBolts difficulty={2} size="sm" />
          </span>
        )}
      </div>

      {/* axis */}
      <div className={v2 ? 'flex items-center gap-1.5 whitespace-nowrap text-[17px] font-black !tracking-[-0.02em] text-v2-ink mt-5 mb-2.5' : 'flex items-center gap-1.5 text-[12px] font-black mt-4 mb-2'} style={v2 ? undefined : { color: '#6B7280', letterSpacing: '.03em' }}>
        מהלך האימון
      </div>
      {/* v2: provide HomeV2Context so the shared ExerciseCard rows render their v2 look
          (white row + thumbnail, ring instead of border). Value false = today. */}
      <HomeV2Context.Provider value={v2}>
      <HybridJourneyAxis
        v2={v2}
        segments={plan.segments}
        // design-unification (05.08.2026): HybridJourneyAxis is ALREADY purely
        // data-driven on stationName (its own docstring: "Omitted for budget-split
        // cards → legacy rendering unchanged" describes the OLD wiring, not a real
        // constraint) — dropping the composed.bolts gate here unifies leg titles,
        // the zone badge, meta-row format, the station header's collapsibility, and
        // exercise-section grouping for ANY session with a named station, full-park
        // or not. When composed.station is undefined (e.g. a bodyweight/A3 fallback),
        // this still correctly falls through to the legacy rendering — same as it
        // already does for full-park's own (rare) unnamed-station case.
        stationName={composed.station?.name}
        walkLegs={roundTripOn && roundTripLegs ? { thereMin: roundTripLegs.walkThereMin, backMin: roundTripLegs.walkBackMin } : null}
        isWarmupActive={isWarmupActive}
        isWarmupExpanded={isWarmupExpanded}
        onToggleWarmupActive={toggleWarmupActive}
        onToggleWarmupExpanded={toggleWarmupExpanded}
        onExerciseTap={onExerciseTap}
        onSwapExercise={onSwapExercise}
        onSegmentAssessmentLink={onAssessmentLink}
      />
      </HomeV2Context.Provider>
      <ReportProblemButton types={['hybrid_smart_walk', 'hybrid_full_park', 'hybrid_route_stops', 'hybrid_free_aerobic']} wrapperClassName="flex justify-center py-3" />
    </OverviewDrawerShell>
  );
}
