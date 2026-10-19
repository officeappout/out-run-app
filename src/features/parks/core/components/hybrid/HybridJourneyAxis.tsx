'use client';

/**
 * HybridJourneyAxis — the vertical mixed-modality spine ("מהלך האימון") of the
 * route + stops overview. Since 19.10.2026 it is a CONSUMER of the generic
 * overview axis: it maps the composed plan's segments to overview legs
 * (buildHybridLegs) and renders them through OverviewLegAxis, supplying its
 * own station card (HybridStationCard) and the route's single questionnaire
 * line. Output is byte-identical to the pre-split axis (parity snapshots in
 * overview/__tests__). Pure presentational — no engine calls.
 */

import { useState } from 'react';
import { Info, ChevronLeft } from 'lucide-react';
import type { HybridPlannedSegment } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { formatMinutes } from './hybrid-format'; // shared duration formatter (point 19)
import { routeQuestionnaireLine } from './route-questionnaire-line';
import { useUserStore } from '@/features/user';
import OverviewLegAxis from '../overview/OverviewLegAxis';
import type { OverviewLeg } from '../overview/overview-legs';
import HybridStationCard from './HybridStationCard';

const ZONE_LABEL: Record<string, string> = {
  jogging: 'ריצה קלה', easy: 'קל', recovery: 'שחרור', walk: 'הליכה',
  tempo: 'טמפו', long_run: 'ריצה ממושכת', fartlek_medium: 'פרטלק', fartlek_fast: 'פרטלק מהיר',
};

/**
 * Segments → overview legs. Round-trip walk legs are DISPLAY-ONLY transport legs
 * (never plan segments: HybridPlannedSegment.kind stays 'aerobic' | 'strength'
 * because that union feeds the run, history, weekly load and the summary).
 * `aerobicKind` = the session's kind, the strip's fallback glyph for a leg
 * without its own aerobicType.
 */
export function buildHybridLegs(
  segments: HybridPlannedSegment[],
  opts: { stationName?: string; walkLegs?: { thereMin: number; backMin: number } | null; aerobicKind?: string },
): OverviewLeg[] {
  const { stationName, walkLegs, aerobicKind } = opts;
  const legs: OverviewLeg[] = [];
  const aerCount = segments.filter((s) => s.kind === 'aerobic').length;
  let aerIdx = 0;
  if (walkLegs && walkLegs.thereMin > 0) legs.push({ kind: 'transport', key: 'walk-there', phase: 'there', label: 'הליכה אל המסלול', minutes: walkLegs.thereMin });
  segments.forEach((seg, i) => {
    if (seg.kind !== 'aerobic') {
      legs.push({ kind: 'station', key: `stn${i}`, subtype: seg.domainFocus, durationSec: seg.durationSec, ref: i });
      return;
    }
    aerIdx += 1;
    const pace = seg.targetPaceSecPerKm ? (seg.targetPaceSecPerKm.min + seg.targetPaceSecPerKm.max) / 2 : 0;
    // Moovit-style: the verb is the ACTIVITY (walk/run) and the title is the DESTINATION.
    const action = (seg.aerobicType ?? 'walking') === 'running' ? 'ריצה' : 'הליכה';
    const base = { kind: 'aerobic' as const, key: `leg${i}`, activity: seg.aerobicType, stripActivity: seg.aerobicType ?? aerobicKind, durationSec: seg.durationSec, distanceKm: seg.distanceKm, paceSecPerKm: pace };
    if (stationName) {
      const legTitle = aerIdx === 1 ? `אל ${stationName}` : aerIdx === aerCount ? 'חזרה לנקודת ההתחלה' : 'המשך';
      legs.push({
        ...base, layout: 'destination', title: legTitle,
        // פעולה · מרחק · זמן (הפועל = הפעילות)
        meta: [{ key: 'all', icon: 'activity', text: <>{action} · {seg.distanceKm != null ? seg.distanceKm.toFixed(2) : '—'} ק״מ · {formatMinutes(seg.durationSec)}</> }],
      });
      return;
    }
    // David, 23.09.2026, bug #4: was hardcoded "רגל ריצה" even for a walking leg.
    legs.push({
      ...base, layout: 'standard',
      title: <>{action} · מקטע {aerIdx}</>,
      badge: ZONE_LABEL[String(seg.zone)] ?? 'אירובי',
      meta: [
        ...(seg.distanceKm != null ? [{ key: 'km', icon: 'distance' as const, text: <>{seg.distanceKm.toFixed(2)} ק״מ</> }] : []),
        ...(seg.durationSec != null ? [{ key: 'min', icon: 'time' as const, text: formatMinutes(seg.durationSec) }] : []),
      ],
      loopNote: i === segments.length - 1,
    });
  });
  if (walkLegs && walkLegs.backMin > 0) legs.push({ kind: 'transport', key: 'walk-back', phase: 'back', label: 'הליכה חזרה', minutes: walkLegs.backMin });
  return legs;
}

interface AxisProps {
  segments: HybridPlannedSegment[];
  /**
   * The destination park/station name, when the session has one — any hybrid card
   * (design-unification, 05.08.2026). When set, aerobic legs render Moovit-style
   * (destination title + an activity-derived verb). Undefined (e.g. a bodyweight/A3
   * fallback with no real station) → the standard leg rendering.
   */
  stationName?: string;
  /** Full-park warmup section — reuse SectionHeader's skip pill + collapse chevron. The
   *  skip is REAL (useHybridRun strips the warmup from the run); state lives in the overview. */
  isWarmupActive?: boolean;
  isWarmupExpanded?: boolean;
  onToggleWarmupActive?: () => void;
  onToggleWarmupExpanded?: () => void;
  /** Tap an exercise → the real preview detail drawer (owned by the parent). */
  onExerciseTap?: (we: EngineWorkoutExercise) => void;
  /** Swap the exercise at [segIndex][exIndex] → the real replacement modal (parent). */
  onSwapExercise?: (segIndex: number, exIndex: number, we: EngineWorkoutExercise) => void;
  /**
   * Domain-assessment gate (David, 23-24.09.2026): tap-through for the route's
   * questionnaire line — the same mechanism as the session-level A3 banner
   * (DiscoverLayer's onAssessmentLink → startMiniDomainAssessment).
   */
  onSegmentAssessmentLink?: (domains?: string[]) => void;
  /** Round-trip walk legs (route_stops, Phase 2b), minutes. Display-only; omit/0 → no row. */
  walkLegs?: { thereMin: number; backMin: number } | null;
  /** Home v2 (enable_home_v2) look, read by HybridOverviewScreen. Omitted/false = today's axis. */
  v2?: boolean;
}

export default function HybridJourneyAxis({
  segments,
  stationName,
  isWarmupActive,
  isWarmupExpanded,
  onToggleWarmupActive,
  onToggleWarmupExpanded,
  onExerciseTap,
  onSwapExercise,
  onSegmentAssessmentLink,
  walkLegs,
  v2 = false,
}: AxisProps) {
  // G2.1 (Sderot pilot): ONE neutral, gendered questionnaire line for the whole route —
  // the union of every station's assessmentNudge AND needsAssessment domains. Locked
  // stations show only a neutral locked state (HybridStationCard).
  const userGender = useUserStore((s) => s.profile?.core?.gender) as 'male' | 'female' | 'other' | undefined;
  const questionnaireLine = routeQuestionnaireLine(segments, userGender);

  // Station super-collapse (point 20): per station, keyed by segment index; default open.
  const [collapsedStations, setCollapsedStations] = useState<Record<number, boolean>>({});
  const toggleStation = (idx: number) =>
    setCollapsedStations((m) => ({ ...m, [idx]: !m[idx] }));

  const legs = buildHybridLegs(segments, { stationName, walkLegs });
  const ordinals: Record<number, number> = {};
  legs.forEach((l) => { if (l.kind === 'station') ordinals[l.ref] = Object.keys(ordinals).length + 1; });

  return (
    <OverviewLegAxis
      v2={v2}
      legs={legs}
      top={questionnaireLine && (
        <button
          type="button"
          onClick={() => onSegmentAssessmentLink?.(questionnaireLine.domains)}
          className="w-full flex items-center gap-2 mb-3 rounded-xl text-[12px] font-bold text-start active:scale-[0.98] transition-transform"
          style={{ background: '#fff', border: '1px dashed #CBD5E1', color: '#00C9F2', padding: '9px 12px' }}
        >
          <Info size={15} className="flex-shrink-0" style={{ color: '#9CA3AF' }} />
          <span className="flex-1 underline underline-offset-2">{questionnaireLine.text}</span>
          <ChevronLeft size={15} className="flex-shrink-0" style={{ color: '#9CA3AF' }} />
        </button>
      )}
      renderStation={(leg) => (
        <HybridStationCard
          seg={segments[leg.ref]}
          segIndex={leg.ref}
          ordinal={ordinals[leg.ref]}
          stationName={stationName}
          collapsed={!!collapsedStations[leg.ref]}
          onToggleCollapsed={() => toggleStation(leg.ref)}
          isWarmupActive={isWarmupActive}
          isWarmupExpanded={isWarmupExpanded}
          onToggleWarmupActive={onToggleWarmupActive}
          onToggleWarmupExpanded={onToggleWarmupExpanded}
          onExerciseTap={onExerciseTap}
          onSwapExercise={onSwapExercise}
        />
      )}
    />
  );
}
