'use client';

/**
 * HybridJourneyAxis — the vertical mixed-modality spine ("מהלך האימון") for the
 * hybrid overview (Phase ב). The ONE new brick in the overview inventory: a
 * vertical timeline alternating aerobic run-legs (green) ↔ strength stations
 * (amber), pinned to hybrid-workout-overview.html (frame A1). Pure presentational
 * — renders a composed HybridPlan; no engine calls.
 */

import { useState } from 'react';
import { Clock, Ruler, Repeat, MapPin, ChevronDown } from 'lucide-react';
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
import { HYBRID_AER as AER, HYBRID_STR as STR } from './hybrid-colors'; // single source (point 15)

const FINISH = '#EF4444'; // journey end (matches the finish dot); the spine blends to it on the last leg
const AER_TINT = '#ECFDF5', AER_TEXT = '#047857';
const STR_TINT = '#ECFEFF', STR_TEXT = '#0E7490'; // cyan tint/text (same hue as STR)

// Station super-collapse (point 20): domainFocus → "main muscle group" label.
const DOMAIN_LABEL: Record<string, string> = {
  push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', legs_core: 'רגליים וליבה', core: 'ליבה',
};

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
   * Full-park only: the destination park name. When set, aerobic legs render
   * Moovit-style (destination title + an activity-derived verb) instead of the legacy
   * "רגל ריצה N — יציאה". Omitted for budget-split cards → legacy rendering unchanged.
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
}: AxisProps) {
  const aerCount = segments.filter((s) => s.kind === 'aerobic').length;
  let aerIdx = 0, strIdx = 0;
  const firstColor = segments[0]?.kind === 'strength' ? STR : AER;

  // Station super-collapse (point 20): per-station-card. Keyed by segment index;
  // default expanded (absent = open). Collapsed → a summary card instead of the
  // warmup+strength sections. Independent per station.
  const [collapsedStations, setCollapsedStations] = useState<Record<number, boolean>>({});
  const toggleStation = (idx: number) =>
    setCollapsedStations((m) => ({ ...m, [idx]: !m[idx] }));
  return (
    <div dir="rtl">
      {/* start dot + spine head */}
      <div className="flex items-center gap-2" style={{ margin: '0 2px 3px' }}>
        <div className="relative flex justify-center" style={{ width: 44 }}>
          {/* spine head — green, blends into the first segment's color */}
          <span aria-hidden style={{ position: 'absolute', zIndex: 0, left: '50%', transform: 'translateX(-50%)', top: 6, bottom: -14, width: 6, borderRadius: 3, background: `linear-gradient(to bottom, ${AER} 0%, ${AER} 45%, ${firstColor} 100%)` }} />
          <div style={{ position: 'relative', zIndex: 1, width: 12, height: 12, borderRadius: '50%', background: AER, border: '3px solid #fff', boxShadow: `0 0 0 1.5px ${AER}` }} />
        </div>
        <span className="text-[11px] font-bold" style={{ color: '#6B7280' }}>נקודת התחלה</span>
      </div>

      {segments.map((seg, i) => {
        const last = i === segments.length - 1;
        // Spine colour continues to the NEXT node (or the finish dot on the last leg).
        const nextColor = last ? FINISH : (segments[i + 1].kind === 'aerobic' ? AER : STR);
        if (seg.kind === 'aerobic') {
          aerIdx += 1;
          const legLabel = aerIdx === 1 ? 'יציאה' : aerIdx === aerCount ? 'חזרה' : `${aerIdx}`;
          const pace = seg.targetPaceSecPerKm ? (seg.targetPaceSecPerKm.min + seg.targetPaceSecPerKm.max) / 2 : 0;
          // Moovit-style (full-park): the verb is the ACTIVITY (walk/run) — kills the
          // "רגל ריצה" vs "הליכה" contradiction — and the title is the DESTINATION.
          const action = (seg.aerobicType ?? 'walking') === 'running' ? 'ריצה' : 'הליכה';
          const legTitle = stationName
            ? (aerIdx === 1 ? `אל ${stationName}` : aerIdx === aerCount ? 'חזרה לנקודת ההתחלה' : 'המשך')
            : `רגל ריצה ${aerIdx} — ${legLabel}`;
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
                        <span className="text-[14px] font-black" style={{ color: '#111827' }}>רגל ריצה {aerIdx} — {legLabel}</span>
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
        const exs = seg.content?.exercises ?? [];
        // A2: "N תרגילים" is the WORK count — exclude BOTH the warmup (חימום) and
        // cooldown (מתיחות) blocks. This is the engine's canonical work predicate
        // `(exerciseRole ?? 'main') === 'main'` (WorkoutGenerator.ts:150), with the
        // wrapper-OR-nested role resolution from section-grouping.utils.ts:52 so the
        // count stays in sync with the sections rendered beside it.
        const mainExCount = exs.filter(
          (e: any) => ((e?.exerciseRole || e?.exercise?.exerciseRole) ?? 'main') === 'main',
        ).length;
        // Full-park: reuse the strength preview's section grouping (חימום → סטים+"Nx סבבים"
        // → מתיחות). Budget-split keeps the flat list (else branch → byte-identical).
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
                      <span className="font-semibold" style={{ color: STR_TEXT }}>{DOMAIN_LABEL[seg.domainFocus ?? ''] ?? 'כוח'}</span>
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
                        אימון כוח · ~{formatMinutes(seg.content?.estimatedDurationSec)}
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

      {/* finish dot */}
      <div className="flex items-center gap-2" style={{ margin: '3px 2px 0' }}>
        <div className="flex justify-center" style={{ width: 44 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#EF4444', border: '3px solid #fff', boxShadow: '0 0 0 1.5px #EF4444' }} />
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: '#b91c1c' }}><MapPin size={13} /> סיום · חזרה לנקודת ההתחלה</span>
      </div>
    </div>
  );
}
