'use client';

/**
 * HybridStationCard — a strength station's card on the route + stops axis
 * (moved verbatim from HybridJourneyAxis, 19.10.2026; the node beside it is
 * drawn by the generic OverviewLegAxis). Locked (needs-assessment) stations
 * keep their place with a neutral locked state; named stations reuse the
 * strength preview's sections (חימום → סטים → מתיחות) and super-collapse.
 */

import { Clock, ChevronDown, Lock } from 'lucide-react';
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
import { ActivityGlyph } from './activity-icons';
import { formatMinutes } from './hybrid-format';
import { HYBRID_STR as STR } from './hybrid-colors';
import { CARD_PAD, CardGroup, Meta, STR_TINT, STR_TEXT, useAxisCardStyles } from '../overview/axis/AxisParts';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

/** Station kind by activity (route-stops Bug 3b): stretch/mobility/yoga and core stops have their
 *  own label (map.json `hybrid.station.noun` / `hybrid.station.meta`); a strength/undefined station
 *  reads its domainFocus as the "main muscle group" (push → "דחיפה" …, else "כוח"). */
function stationKind(seg: { activityType?: string }): 'stretch' | 'core' | 'strength' {
  const at = seg.activityType;
  if (at === 'stretch' || at === 'mobility' || at === 'yoga') return 'stretch';
  if (at === 'core') return 'core';
  return 'strength';
}

/** Resolve the exercise's park image (offline-safe: empty string when none). */
function hybridImage(we: any): string {
  try {
    const ex = we?.exercise;
    if (!ex) return '';
    // Prefer the ENGINE-selected method (we.method) — ContextualEngine already resolved
    // the location-matched, Bunny-aware method, consistent with the in-workout player.
    const method = we?.method ?? findMethodForLocation(ex, 'park') ?? ex.execution_methods?.[0];
    return resolveExerciseMedia(ex, method).imageUrl ?? '';
  } catch { return ''; }
}

export interface HybridStationCardProps {
  seg: HybridPlannedSegment;
  /** The segment's index in the plan (swap callbacks address it). */
  segIndex: number;
  /** 1-based station ordinal ("תחנה N — כוח" when the station has no name). */
  ordinal: number;
  stationName?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isWarmupActive?: boolean;
  isWarmupExpanded?: boolean;
  onToggleWarmupActive?: () => void;
  onToggleWarmupExpanded?: () => void;
  onExerciseTap?: (we: EngineWorkoutExercise) => void;
  onSwapExercise?: (segIndex: number, exIndex: number, we: EngineWorkoutExercise) => void;
}

export default function HybridStationCard({
  seg, segIndex: i, ordinal: strIdx, stationName, collapsed, onToggleCollapsed,
  isWarmupActive, isWarmupExpanded, onToggleWarmupActive, onToggleWarmupExpanded,
  onExerciseTap, onSwapExercise,
}: HybridStationCardProps) {
  const { v2, cardCls, cardStyle, titleCls, titleStyle } = useAxisCardStyles();
  const t = useT(map);
  // Domain-assessment gate (David, 23-24.09.2026): unassessed station stays ON THE
  // AXIS with a neutral lock card (G2.1: the questionnaire line is shown ONCE, above).
  if (seg.content?.needsAssessment) {
    return (
      <div className={cardCls} style={cardStyle}>
        <div style={CARD_PAD}>
          <div className="flex items-center gap-1.5">
            <Lock size={14} style={{ color: '#9CA3AF' }} />
            <span className={titleCls} style={titleStyle}>
              {stationName ? t('hybrid.station.titleNamed', { name: stationName }) : t('hybrid.station.titleOrdinal', { n: String(strIdx) })}
            </span>
          </div>
          <span className={v2 ? 'block mt-1.5 text-[13px] font-bold text-v2-muted' : 'block mt-1.5 text-[12px] font-bold'} style={v2 ? undefined : { color: '#6B7280' }}>
            {t('hybrid.station.locked')}
          </span>
        </div>
      </div>
    );
  }
  const exs = seg.content?.exercises ?? [];
  // A2: "N תרגילים" is the WORK count — the engine's canonical work predicate
  // `(exerciseRole ?? 'main') === 'main'` with wrapper-OR-nested role resolution.
  const mainExCount = exs.filter(
    (e: any) => ((e?.exerciseRole || e?.exercise?.exerciseRole) ?? 'main') === 'main',
  ).length;
  // Named station → the strength preview's section grouping; unnamed → flat list.
  const sections = stationName ? groupExercisesIntoSections(exs as any) : [];
  return (
    <div className={cardCls} style={cardStyle}>
      <div style={CARD_PAD}>
        <div className="flex items-center justify-between gap-2">
          {stationName ? (
            /* point 20: the header toggles the station super-collapse */
            <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed}
              className={v2 ? 'flex min-w-0 items-center gap-1.5 text-start transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'flex items-center gap-1.5 active:scale-[0.98] transition-transform'}>
              <ChevronDown size={16} style={{ color: '#9CA3AF', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .2s' }} />
              {/* A3: the title is the park name (already "גינת כושר …"). */}
              <span className={titleCls} style={titleStyle}>{t('hybrid.station.titleNamed', { name: stationName })}</span>
            </button>
          ) : (
            <span className={titleCls} style={titleStyle}>{t('hybrid.station.titleOrdinal', { n: String(strIdx) })}</span>
          )}
          <span className={`${v2 ? 'text-[11px]' : 'text-[10.5px]'} font-extrabold rounded-full whitespace-nowrap`} style={{ padding: '3px 9px', background: STR_TINT, color: STR_TEXT }}>{t('hybrid.station.stopAndTrain')}</span>
        </div>
        {stationName ? (
          collapsed ? (
            /* point 20: collapsed — summary card (not an empty header) */
            <div className={v2 ? 'mt-2 flex items-center gap-1.5 flex-wrap text-[13px] text-v2-muted' : 'mt-2 flex items-center gap-1.5 flex-wrap text-[12.5px]'} style={v2 ? undefined : { color: '#4B5563' }}>
              <span className="font-bold">{t('hybrid.station.exercises', { count: String(mainExCount) })}</span>
              <span style={{ color: '#D1D5DB' }}>·</span>
              <span>~{formatMinutes(seg.content?.estimatedDurationSec)}</span>
              <span style={{ color: '#D1D5DB' }}>·</span>
              <span className="font-semibold" style={{ color: STR_TEXT }}>{t('hybrid.station.noun', { kind: stationKind(seg), domain: seg.domainFocus ?? '' })}</span>
              {sections.some((s) => s.id === 'warmup') && (isWarmupActive ?? true) && (
                <span className={v2 ? 'text-[11px] font-bold rounded-full whitespace-nowrap' : 'text-[10.5px] font-bold rounded-full'} style={{ padding: '2px 8px', background: STR_TINT, color: STR_TEXT }}>{t('hybrid.station.withWarmup')}</span>
              )}
            </div>
          ) : (
          <>
            {/* A1: strength glyph + "אימון כוח" mirrors the walking card's Meta row. */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Meta tint={STR} icon={<ActivityGlyph kind="strength" className="w-4 h-4" />}>
                {t('hybrid.station.meta', { kind: stationKind(seg), time: formatMinutes(seg.content?.estimatedDurationSec) })}
              </Meta>
            </div>
            {sections.map((section) => {
              const isWarmupSection = section.id === 'warmup';
              const isSupersetSection = section.id.startsWith('superset');
              const isPyramidSection = section.id.startsWith('pyramid');
              // point 20: the station super-collapse owns expand; the warmup's cards
              // follow the SKIP (active → show, skipped → hide).
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
                        // Pyramid = ONE exercise carrying N steps → one card PER STEP (point 8).
                        // Tap opens the PARENT and swap swaps the parent.
                        if (Array.isArray(pyramidSeq) && pyramidSeq.length > 0) {
                          const isGoal = we.isGoalExercise === true;
                          const uniLabel = we.exercise?.symmetry === 'unilateral' ? t('hybrid.station.perSide') : '';
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
              {/* generic strength marker (MuscleIcon) — OUT is calisthenics: no dumbbell. */}
              <span className="flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: STR_TEXT }}><ActivityGlyph kind="strength" className="w-[15px] h-[15px]" /> {t('hybrid.station.exercises', { count: String(mainExCount) })}</span>
              {/* Station time (meaningful), not a sets-sum. */}
              <span className={v2 ? 'flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-v2-muted' : 'flex items-center gap-1 text-[12px] font-semibold'} style={v2 ? undefined : { color: '#9CA3AF' }}>
                <Clock size={13} /> ~{formatMinutes(seg.content?.estimatedDurationSec)}
              </span>
            </div>
            {/* superset grouping — subtle ENCLOSURE (point 5), not a coloured bar. */}
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
  );
}
