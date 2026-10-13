'use client';

/**
 * HybridJourneyAxis — the vertical mixed-modality spine ("מהלך האימון") for the
 * hybrid overview (Phase ב). The ONE new brick in the overview inventory: a
 * vertical timeline alternating aerobic run-legs (green) ↔ strength stations
 * (amber), pinned to hybrid-workout-overview.html (frame A1). Pure presentational
 * — renders a composed HybridPlan; no engine calls.
 */

import { useState, type CSSProperties } from 'react';
import { Clock, Ruler, Repeat, ChevronDown, Lock, Info, ChevronLeft, LocateFixed } from 'lucide-react';
import type { HybridPlannedSegment } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import ExerciseCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard';
import PyramidStepCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/PyramidStepCard';
import type { PyramidStep } from '@/features/workouts/components/workout-preview-drawer/types';
import { getLocalizedText } from '@/features/content/exercises';
import SectionHeader from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/SectionHeader';
import { groupExercisesIntoSections } from '@/features/workouts/components/workout-preview-drawer/utils/section-grouping.utils';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { findMethodForLocation } from '@/features/content/exercises/core/exercise.types';
import { ActivityGlyph } from './activity-icons'; // single source for both axes (points 13/17)
import { formatMinutes } from './hybrid-format'; // shared duration formatter (point 19)
import { HYBRID_AER as AER, HYBRID_STR as STR, HYBRID_WALK as WALK } from './hybrid-colors'; // single source (point 15)

const ACCENT = '#00ADEF'; // "המיקום שלך" origin / return nodes
const AER_TINT = '#ECFDF5', AER_TEXT = '#047857';
const STR_TINT = '#ECFEFF', STR_TEXT = '#0E7490'; // cyan tint/text (same hue as STR)

// Station super-collapse (point 20): domainFocus → "main muscle group" label.
const DOMAIN_LABEL: Record<string, string> = {
  push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', legs_core: 'רגליים וליבה', core: 'ליבה',
};

/** Station label by activity (route-stops Bug 3b): stretch/core stops show their own
 *  label; a strength/undefined station is byte-identical (domain → "משיכה"/… else "כוח"). */
function stationNounLabel(seg: { activityType?: string; domainFocus?: string }): string {
  const at = seg.activityType;
  if (at === 'stretch' || at === 'mobility' || at === 'yoga') return 'מתיחות';
  if (at === 'core') return 'ליבה';
  return DOMAIN_LABEL[seg.domainFocus ?? ''] ?? 'כוח';
}
/** "action" phrasing for the expanded Meta row — "אימון כוח" for strength, else the
 *  stop's own action. Strength/undefined → unchanged. */
function stationActionLabel(seg: { activityType?: string }): string {
  const at = seg.activityType;
  if (at === 'stretch' || at === 'mobility' || at === 'yoga') return 'מתיחות ושחרור';
  if (at === 'core') return 'אימון ליבה';
  return 'אימון כוח';
}

const ZONE_LABEL: Record<string, string> = {
  jogging: 'ריצה קלה', easy: 'קל', recovery: 'שחרור', walk: 'הליכה',
  tempo: 'טמפו', long_run: 'ריצה ממושכת', fartlek_medium: 'פרטלק', fartlek_fast: 'פרטלק מהיר',
};
const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Resolve the exercise's park image (offline-safe: empty string when none). */
function hybridImage(we: any): string {
  try {
    const ex = we?.exercise;
    if (!ex) return '';
    // Prefer the ENGINE-selected method (we.method) — ContextualEngine.findMatchingMethod
    // already resolved the correct location-matched, Bunny-aware method, so the review
    // stays consistent with the in-workout player instead of re-selecting via the
    // legacy-blind findMethodForLocation (which could return a home method via mapping).
    const method = we?.method ?? findMethodForLocation(ex, 'park') ?? ex.execution_methods?.[0];
    return resolveExerciseMedia(ex, method).imageUrl ?? '';
  } catch { return ''; }
}

function Node({ kind, nextColor, subtype }: { kind: 'aerobic' | 'strength'; nextColor: string; subtype?: string }) {
  const color = kind === 'aerobic' ? AER : STR;
  return (
    <div className="relative flex flex-col items-center flex-shrink-0" style={{ width: 44 }}>
      {/* Continuous spine (point 5): one 6px rail per node, colored by activity
          (aerobic=green · strength=cyan) and blended to the NEXT node's color, so
          the whole axis reads as ONE line through every station — like Moovit's
          orange bar. Sits BEHIND the circle and overshoots the inter-row gap
          (card mb-3 ≈ 12px); the overshoot is hidden by the opaque next circle/dot. */}
      <span aria-hidden style={{
        position: 'absolute', zIndex: 0, left: '50%', transform: 'translateX(-50%)',
        top: 22, bottom: -20, width: 6, borderRadius: 3,
        background: `linear-gradient(to bottom, ${color} 0%, ${color} 45%, ${nextColor} 100%)`,
      }} />
      <div className="relative rounded-full flex items-center justify-center text-white"
        style={{ zIndex: 1, width: 44, height: 44, background: color, border: '3px solid #fff', boxShadow: `0 4px 12px ${color}66` }}>
        {/* point 18: icon enlarged 20→26 (circle is 44px, room to breathe) */}
        <ActivityGlyph kind={kind} subtype={subtype} className="w-[26px] h-[26px]" />
      </div>
    </div>
  );
}
/**
 * Round-trip structure (Phase 2b) — all DISPLAY-ONLY, rendered from `walkLegs`, NOT from
 * `segments`. HybridPlannedSegment.kind stays 'aerobic' | 'strength' on purpose: that union
 * feeds the run (orchestrator, useHybridRun), history, weekly load and the summary, and a
 * 'walk' segment there would be RUN and credited.
 *
 * Axis order: המיקום שלך › [transport: הליכה אל המסלול] › תחילת המסלול › …route segments… ›
 * סיום המסלול › [transport: הליכה חזרה] › המיקום שלך. Transport legs are a dotted connector + a small
 * walk icon (not a node) so they read as getting-there, apart from the route's solid legs.
 */
function Rail({ kind = 'solid', from, to, top = 0, bottom = 0 }: {
  kind?: 'solid' | 'dotted'; from: string; to?: string; top?: number | string; bottom?: number | string;
}) {
  const base: CSSProperties = { position: 'absolute', zIndex: 0, left: '50%', transform: 'translateX(-50%)', top, bottom };
  if (kind === 'dotted') {
    return <span aria-hidden style={{ ...base, width: 0, borderLeft: `3px dotted ${from}`, opacity: 0.55 }} />;
  }
  const end = to ?? from;
  return <span aria-hidden style={{ ...base, width: 6, borderRadius: 3, background: `linear-gradient(to bottom, ${from} 0%, ${from} 45%, ${end} 100%)` }} />;
}

/** "המיקום שלך" — origin (first) / return (last) node: filled, accent. */
function YourLocationRow({ variant, railBelowDotted, railAboveDotted, firstColorBelow }: {
  variant: 'origin' | 'return';
  railBelowDotted?: boolean;
  railAboveDotted?: boolean;
  firstColorBelow?: string;
}) {
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 40 }}>
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 44, alignSelf: 'stretch' }}>
        {variant === 'origin'
          ? (railBelowDotted
              ? <Rail kind="dotted" from={WALK} top="50%" bottom={0} />
              : <Rail from={ACCENT} to={firstColorBelow ?? AER} top="50%" bottom={0} />)
          : (railAboveDotted
              ? <Rail kind="dotted" from={WALK} top={0} bottom="50%" />
              : <Rail from={AER} to={ACCENT} top={0} bottom="50%" />)}
        <div className="relative rounded-full flex items-center justify-center text-white"
          style={{ zIndex: 1, width: 28, height: 28, background: ACCENT, border: '3px solid #fff', boxShadow: `0 0 0 1.5px ${ACCENT}` }}>
          <LocateFixed size={14} />
        </div>
      </div>
      <span className="text-[12.5px] font-black" style={{ color: '#0369A1' }}>המיקום שלך</span>
    </div>
  );
}

/** "תחילת המסלול" / "סיום המסלול" — thin labelled divider, rail continues through it. */
function RouteDivider({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 30 }}>
      <div className="relative flex-shrink-0" style={{ width: 44, alignSelf: 'stretch' }}>
        <Rail from={from} to={to} top={0} bottom={0} />
      </div>
      <div className="flex-1 flex items-center gap-2">
        <span aria-hidden style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        <span className="text-[10.5px] font-extrabold whitespace-nowrap" style={{ color: '#6B7280' }}>{label}</span>
        <span aria-hidden style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
      </div>
    </div>
  );
}

/** Transport leg: dotted connector + small walk icon (no node), faded, with a muted tag. */
function TransportRow({ label, minutes }: { label: string; minutes: number }) {
  return (
    <div className="flex items-center gap-3" style={{ minHeight: 46 }}>
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 44, alignSelf: 'stretch' }}>
        <Rail kind="dotted" from={WALK} top={0} bottom={0} />
        <span className="relative rounded-full flex items-center justify-center bg-white" style={{ zIndex: 1, width: 26, height: 26, color: WALK }}>
          <span className="inline-flex" style={{ opacity: 0.7 }}><ActivityGlyph kind="aerobic" subtype="walking" className="w-[17px] h-[17px]" /></span>
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap" style={{ opacity: 0.75 }}>
        <span className="text-[12.5px] font-bold" style={{ color: '#6B7280' }}>{label}</span>
        <span className="text-[11px] font-bold" style={{ color: '#9CA3AF' }}>{formatMinutes(minutes * 60)}</span>
        <span className="text-[10px] font-extrabold rounded-full" style={{ padding: '1px 7px', background: '#F3F4F6', color: '#9CA3AF' }}>מעבר</span>
      </div>
    </div>
  );
}
function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: '#374151' }}>
    <span style={{ color: '#9CA3AF' }}>{icon}</span>{children}</span>;
}

/**
 * CardGroup — a superset's exercise cards. When `superset` is true they sit
 * inside a subtle slate ENCLOSURE (point 5, David's pick): the grouping reads
 * from the container, NOT a colored bar — so the axis spine stays the only
 * vertical line (no competing cyan bar). Non-superset lists render bare.
 */
function CardGroup({ superset, children }: { superset: boolean; children: React.ReactNode }) {
  if (!superset) return <div className="flex flex-col gap-2">{children}</div>;
  return (
    <div className="flex flex-col gap-2 mt-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 8 }}>
      {children}
    </div>
  );
}

interface AxisProps {
  segments: HybridPlannedSegment[];
  /**
   * The destination park/station name, when the session has one — any hybrid card,
   * not just full-park (design-unification, 05.08.2026: HybridOverviewScreen now
   * passes this for every card, not only `composed.bolts`-carrying ones). When set,
   * aerobic legs render Moovit-style (destination title + an activity-derived verb)
   * instead of the legacy "רגל {action} N — יציאה". Undefined (e.g. a bodyweight/A3
   * fallback with no real station) → legacy rendering unchanged.
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
   * Domain-assessment gate (David, 23-24.09.2026): tap-through for a locked
   * station card's CTA — reuses the EXACT same mechanism as the session-level
   * A3 fallback banner (HybridOverviewScreen owns that one; DiscoverLayer's
   * onAssessmentLink → startMiniDomainAssessment), just called with THIS
   * segment's own assessmentDomains instead of falling back to the session's.
   */
  onSegmentAssessmentLink?: (domains?: string[]) => void;
  /**
   * Round-trip walk legs (route_stops, Phase 2b), minutes. Display-only rows before the first and
   * after the last plan segment; never part of `segments` (see the round-trip rows above). Omit/0 → no row.
   */
  walkLegs?: { thereMin: number; backMin: number } | null;
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
}: AxisProps) {
  const aerCount = segments.filter((s) => s.kind === 'aerobic').length;
  let aerIdx = 0, strIdx = 0;
  const walkThere = walkLegs && walkLegs.thereMin > 0 ? walkLegs.thereMin : 0;
  const walkBack = walkLegs && walkLegs.backMin > 0 ? walkLegs.backMin : 0;
  const firstSegColor = segments[0]?.kind === 'strength' ? STR : AER;

  // G2.1 fix (Sderot field test, 10.10.2026): this used to render the amber
  // equipment-tabata nudge INSIDE the segments.map() below, once per qualifying
  // strength station — stacking a warning-styled banner down the whole axis for a
  // no-questionnaire user, even though doing ad-hoc station work here is legitimate,
  // not a problem. Hoisted to one route-level, softer prompt instead (styling matches
  // ProgramsSection.tsx's "טרם הוערך" dashed-border nudge, not the locked-card warning).
  const assessmentNudgeDomains = Array.from(new Set(
    segments.flatMap((s) => s.content?.assessmentNudge?.assessmentDomains ?? []),
  ));
  const hasAssessmentNudge = assessmentNudgeDomains.length > 0;

  // Station super-collapse (point 20): per-station-card. Keyed by segment index;
  // default expanded (absent = open). Collapsed → a summary card instead of the
  // warmup+strength sections. Independent per station.
  const [collapsedStations, setCollapsedStations] = useState<Record<number, boolean>>({});
  const toggleStation = (idx: number) =>
    setCollapsedStations((m) => ({ ...m, [idx]: !m[idx] }));
  return (
    <div dir="rtl">
      {hasAssessmentNudge && (
        <button
          type="button"
          onClick={() => onSegmentAssessmentLink?.(assessmentNudgeDomains)}
          className="w-full flex items-center gap-2 mb-3 rounded-xl text-[12px] font-bold text-start active:scale-[0.98] transition-transform"
          style={{ background: '#fff', border: '1px dashed #CBD5E1', color: '#00C9F2', padding: '9px 12px' }}
        >
          <Info size={15} className="flex-shrink-0" style={{ color: '#9CA3AF' }} />
          <span className="flex-1 underline underline-offset-2">רוצים אימון מותאם יותר? השלימו שאלון כוח</span>
          <ChevronLeft size={15} className="flex-shrink-0" style={{ color: '#9CA3AF' }} />
        </button>
      )}

      <YourLocationRow variant="origin" railBelowDotted={walkThere > 0} firstColorBelow={AER} />
      {walkThere > 0 && <TransportRow label="הליכה אל המסלול" minutes={walkThere} />}
      <RouteDivider label="תחילת המסלול" from={AER} to={firstSegColor} />

      {segments.map((seg, i) => {
        const last = i === segments.length - 1;
        // Spine colour continues to the NEXT node (the "סיום המסלול" divider on the last leg).
        const nextColor = last ? AER : (segments[i + 1].kind === 'aerobic' ? AER : STR);
        if (seg.kind === 'aerobic') {
          aerIdx += 1;
          const pace = seg.targetPaceSecPerKm ? (seg.targetPaceSecPerKm.min + seg.targetPaceSecPerKm.max) / 2 : 0;
          // Moovit-style (full-park): the verb is the ACTIVITY (walk/run) — kills the
          // "רגל ריצה" vs "הליכה" contradiction — and the title is the DESTINATION.
          const action = (seg.aerobicType ?? 'walking') === 'running' ? 'ריצה' : 'הליכה';
          const legTitle = stationName
            ? (aerIdx === 1 ? `אל ${stationName}` : aerIdx === aerCount ? 'חזרה לנקודת ההתחלה' : 'המשך')
            // David, 23.09.2026, bug #4: was hardcoded "רגל ריצה" even for a
            // walking leg — `action` (above) already resolves the real activity.
            : `${action} · מקטע ${aerIdx}`;
          return (
            <div key={i} className="flex gap-3 items-stretch">
              <Node kind="aerobic" nextColor={nextColor} subtype={seg.aerobicType} />
              <div className="relative flex-1 min-w-0 bg-white rounded-2xl overflow-hidden mb-3"
                style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
                <div style={{ padding: '11px 15px 12px 12px' }}>
                  {stationName ? (
                    <>
                      <span className="text-[14px] font-black block" style={{ color: '#111827' }}>{legTitle}</span>
                      {/* פעולה · מרחק · זמן (הפועל = הפעילות) */}
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <Meta icon={<ActivityGlyph kind="aerobic" subtype={seg.aerobicType} className="w-4 h-4" />}>
                          {action} · {seg.distanceKm != null ? seg.distanceKm.toFixed(2) : '—'} ק״מ · {formatMinutes(seg.durationSec)}
                        </Meta>
                        {pace > 0 && <span className="text-[11px] font-extrabold rounded-full" style={{ direction: 'ltr', background: '#F3F4F6', color: AER_TEXT, padding: '2px 8px' }}>{fmtPace(pace)} /ק״מ</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-black" style={{ color: '#111827' }}>{action} · מקטע {aerIdx}</span>
                        <span className="text-[10.5px] font-extrabold rounded-full whitespace-nowrap" style={{ padding: '3px 9px', background: AER_TINT, color: AER_TEXT }}>
                          {ZONE_LABEL[String(seg.zone)] ?? 'אירובי'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {seg.distanceKm != null && <Meta icon={<Ruler size={14} />}>{seg.distanceKm.toFixed(2)} ק״מ</Meta>}
                        {seg.durationSec != null && <Meta icon={<Clock size={14} />}>{formatMinutes(seg.durationSec)}</Meta>}
                        {pace > 0 && <span className="text-[11px] font-extrabold rounded-full" style={{ direction: 'ltr', background: '#F3F4F6', color: AER_TEXT, padding: '2px 8px' }}>{fmtPace(pace)} /ק״מ</span>}
                      </div>
                      {last && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] font-extrabold" style={{ color: AER_TEXT }}>
                          <Repeat size={15} style={{ color: AER }} /> מסלול מעגלי — חוזר לנקודת ההתחלה
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        }
        // strength station
        strIdx += 1;
        // Domain-assessment gate (David, 23-24.09.2026): this station's domain(s)
        // aren't assessed and no equipment-based alternative applied — the station
        // stays ON THE AXIS (same Node/card wrapper, doesn't disappear) but renders
        // a lock card instead of exercise content, tapping through to the SAME
        // mini-assessment mechanism the session-level A3 banner already uses.
        if (seg.content?.needsAssessment) {
          const { fallbackHint, assessmentDomains } = seg.content.needsAssessment;
          return (
            <div key={i} className="flex gap-3 items-stretch">
              <Node kind="strength" nextColor={nextColor} subtype={seg.domainFocus} />
              <div className="relative flex-1 min-w-0 bg-white rounded-2xl overflow-hidden mb-3"
                style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
                <div style={{ padding: '11px 15px 12px 12px' }}>
                  <div className="flex items-center gap-1.5">
                    <Lock size={14} style={{ color: '#9CA3AF' }} />
                    <span className="text-[14px] font-black" style={{ color: '#111827' }}>
                      {stationName ? `${stationName} — כוח` : `תחנה ${strIdx} — כוח`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSegmentAssessmentLink?.(assessmentDomains)}
                    className="w-full flex items-center gap-2 mt-2 rounded-xl text-[12px] font-bold text-start active:scale-[0.98] transition-transform"
                    style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}
                  >
                    <Info size={15} className="flex-shrink-0" />
                    <span className="flex-1 underline underline-offset-2">{fallbackHint}</span>
                    <ChevronLeft size={15} className="flex-shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          );
        }
        const exs = seg.content?.exercises ?? [];
        // A2: "N תרגילים" is the WORK count — exclude BOTH the warmup (חימום) and
        // cooldown (מתיחות) blocks. This is the engine's canonical work predicate
        // `(exerciseRole ?? 'main') === 'main'` (WorkoutGenerator.ts:150), with the
        // wrapper-OR-nested role resolution from section-grouping.utils.ts:52 so the
        // count stays in sync with the sections rendered beside it.
        const mainExCount = exs.filter(
          (e: any) => ((e?.exerciseRole || e?.exercise?.exerciseRole) ?? 'main') === 'main',
        ).length;
        // Any named-station session (design-unification, 05.08.2026 — was full-park-only):
        // reuse the strength preview's section grouping (חימום → סטים+"Nx סבבים" → מתיחות).
        // No station name (e.g. bodyweight/A3 fallback) → flat list, legacy unchanged.
        const sections = stationName ? groupExercisesIntoSections(exs as any) : [];
        return (
          <div key={i} className="flex gap-3 items-stretch">
            <Node kind="strength" nextColor={nextColor} subtype={seg.domainFocus} />
            <div className="relative flex-1 min-w-0 bg-white rounded-2xl overflow-hidden mb-3"
              style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
              <div style={{ padding: '11px 15px 12px 12px' }}>
                <div className="flex items-center justify-between gap-2">
                  {stationName ? (
                    /* point 20: the header toggles the station super-collapse */
                    <button type="button" onClick={() => toggleStation(i)} aria-expanded={!collapsedStations[i]}
                      className="flex items-center gap-1.5 active:scale-[0.98] transition-transform">
                      <ChevronDown size={16} style={{ color: '#9CA3AF', transform: collapsedStations[i] ? 'rotate(-90deg)' : 'none', transition: 'transform .2s' }} />
                      {/* A3: full-park title = the park name (stationName already
                          includes "גינת כושר …" — do NOT re-prepend a station prefix). */}
                      <span className="text-[14px] font-black" style={{ color: '#111827' }}>{stationName} — כוח</span>
                    </button>
                  ) : (
                    <span className="text-[14px] font-black" style={{ color: '#111827' }}>תחנה {strIdx} — כוח</span>
                  )}
                  <span className="text-[10.5px] font-extrabold rounded-full whitespace-nowrap" style={{ padding: '3px 9px', background: STR_TINT, color: STR_TEXT }}>עצור ואמן</span>
                </div>
                {stationName ? (
                  collapsedStations[i] ? (
                    /* point 20: collapsed — summary card (not an empty header) */
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[12.5px]" style={{ color: '#4B5563' }}>
                      <span className="font-bold">{mainExCount} תרגילים</span>
                      <span style={{ color: '#D1D5DB' }}>·</span>
                      <span>~{formatMinutes(seg.content?.estimatedDurationSec)}</span>
                      <span style={{ color: '#D1D5DB' }}>·</span>
                      <span className="font-semibold" style={{ color: STR_TEXT }}>{stationNounLabel(seg)}</span>
                      {sections.some((s) => s.id === 'warmup') && (isWarmupActive ?? true) && (
                        <span className="text-[10.5px] font-bold rounded-full" style={{ padding: '2px 8px', background: STR_TINT, color: STR_TEXT }}>כולל חימום</span>
                      )}
                    </div>
                  ) : (
                  <>
                    {/* A1: lead with the strength glyph + "אימון כוח" so the field
                        order mirrors the walking card's Meta row (glyph + action ·
                        … · time). Per-block counts stay on the SectionHeaders (#3);
                        the program name is Phase-2 inner-info (needs engine wiring). */}
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <Meta icon={<ActivityGlyph kind="strength" className="w-4 h-4" />}>
                        {stationActionLabel(seg)} · ~{formatMinutes(seg.content?.estimatedDurationSec)}
                      </Meta>
                    </div>
                    {sections.map((section) => {
                      const isWarmupSection = section.id === 'warmup';
                      const isSupersetSection = section.id.startsWith('superset');
                      const isPyramidSection = section.id.startsWith('pyramid');
                      // point 20: the station super-collapse owns expand; the warmup's
                      // own chevron is hidden. Its cards follow the SKIP (active → show,
                      // skipped → hide) — functional, not the removed UI collapse.
                      const showCards = !isWarmupSection || (isWarmupActive ?? true);
                      return (
                        <div key={section.id} className="mt-3">
                          <SectionHeader
                            section={section}
                            isWarmup={isWarmupSection}
                            isSuperset={isSupersetSection}
                            isPyramidSection={isPyramidSection}
                            isWarmupActive={isWarmupActive ?? true}
                            isWarmupExpanded={isWarmupExpanded ?? true}
                            onToggleWarmupExpanded={onToggleWarmupExpanded ?? (() => {})}
                            onToggleWarmupActive={onToggleWarmupActive ?? (() => {})}
                            hideExpandToggle
                          />
                          {showCards && (
                            <CardGroup superset={isSupersetSection}>
                              {section.exercises.flatMap((we: any) => {
                                const pyramidSeq = we?.pyramidSequence as PyramidStep[] | undefined;
                                // Pyramid = ONE exercise carrying N self-contained steps → render
                                // one card PER STEP (point 8, mirrors GeneratedWorkoutExerciseList).
                                // The axis has no exercise pool, so tap opens the PARENT and swap
                                // swaps the parent (handlers adapted to the axis signature).
                                if (Array.isArray(pyramidSeq) && pyramidSeq.length > 0) {
                                  const isGoal = we.isGoalExercise === true;
                                  const uniLabel = we.exercise?.symmetry === 'unilateral' ? ' (לכל צד)' : '';
                                  const parentName = typeof we.exercise?.name === 'string'
                                    ? we.exercise.name : getLocalizedText(we.exercise?.name, 'he');
                                  return pyramidSeq.map((step, stepIdx) => (
                                    <PyramidStepCard
                                      key={`${we?.exercise?.id}-step-${stepIdx}`}
                                      parentEx={we}
                                      step={step}
                                      stepIdx={stepIdx}
                                      cachedImageUrl={step.imageUrl || step.videoSrc || hybridImage(we)}
                                      isSuperset={isSupersetSection}
                                      isGoal={isGoal}
                                      uniLabel={uniLabel}
                                      parentName={parentName}
                                      onTap={(parentEx) => onExerciseTap?.(parentEx)}
                                      onSwapStep={(parentEx) => onSwapExercise?.(i, exs.indexOf(parentEx), parentEx)}
                                    />
                                  ));
                                }
                                return [
                                  <ExerciseCard
                                    key={we?.exercise?.id}
                                    exercise={we}
                                    cachedImageUrl={hybridImage(we)}
                                    isSuperset
                                    framed
                                    onTap={() => onExerciseTap?.(we)}
                                    onSwap={() => onSwapExercise?.(i, exs.indexOf(we), we)}
                                  />,
                                ];
                              })}
                            </CardGroup>
                          )}
                        </div>
                      );
                    })}
                  </>
                  )
                ) : (
                  <>
                    <div className="flex items-center justify-between mt-2">
                      {/* generic strength marker (MuscleIcon) from the shared dictionary —
                          no subtype → the muscle glyph. OUT is calisthenics: no dumbbell anywhere. */}
                      <span className="flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: STR_TEXT }}><ActivityGlyph kind="strength" className="w-[15px] h-[15px]" /> {mainExCount} תרגילים</span>
                      {/* Station time (meaningful), not a sets-sum. Per-exercise sets live on each card. */}
                      <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: '#9CA3AF' }}>
                        <Clock size={13} /> ~{formatMinutes(seg.content?.estimatedDurationSec)}
                      </span>
                    </div>
                    {/* superset grouping — subtle ENCLOSURE (point 5), not a colored
                        bar, so it never competes with the axis spine. */}
                    <CardGroup superset>
                      {exs.map((we: any, k: number) => (
                        <ExerciseCard
                          key={we?.exercise?.id ?? k}
                          exercise={we}
                          cachedImageUrl={hybridImage(we)}
                          isSuperset
                          framed
                          onTap={() => onExerciseTap?.(we)}
                          onSwap={() => onSwapExercise?.(i, k, we)}
                        />
                      ))}
                    </CardGroup>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <RouteDivider label="סיום המסלול" from={AER} to={walkBack > 0 ? AER : ACCENT} />
      {walkBack > 0 && <TransportRow label="הליכה חזרה" minutes={walkBack} />}
      <YourLocationRow variant="return" railAboveDotted={walkBack > 0} />
    </div>
  );
}
