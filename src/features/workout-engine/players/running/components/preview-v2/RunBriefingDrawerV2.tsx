'use client';

/**
 * v2 run briefing (boards R1-prop-intervals / R1-prop-tempo / U-A2,
 * enable_home_v2). Same props and actions as the legacy RunBriefingDrawer:
 * drag the handle down / tap the backdrop / ✕ to close, one CTA to go.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { ArrowRight, Play, X } from 'lucide-react';
import { EASE_V2, JourneyStrip, ProfileStrip, WorkoutOverviewHeader } from '@/components/ui/v2';
import { useNearbyParks } from '@/features/parks/core/hooks/useNearbyParks';
import ExerciseDetailContent from '@/features/workout-engine/players/strength/components/ExerciseDetailContent';
import type RunWorkout from '../../types/run-workout.type';
import type { RunBlock } from '../../types/run-block.type';
import type { RunWeekContext } from '../../utils/run-preview/run-week';
import { useRunPreviewModel } from './useRunPreviewModel';
import RunKindTile from './RunKindIcon';
import RunStructureSteps from './RunStructureSteps';
import RunNearbyParks from './RunNearbyParks';
import { RunCoachTip, RunSurfaceTiles, RunZoneLadder } from './RunBriefingParts';

export interface RunBriefingDrawerV2Props {
  isOpen: boolean;
  onClose: () => void;
  onGo: () => void;
  workout: RunWorkout | null;
  isLoading?: boolean;
  templateCategory?: string | null;
  week?: RunWeekContext | null;
}

const CLOSE_DRAG_PX = 160;

export default function RunBriefingDrawerV2({
  isOpen, onClose, onGo, workout, isLoading, templateCategory, week,
}: RunBriefingDrawerV2Props) {
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const model = useRunPreviewModel(workout, { templateCategory, week });
  const nearbyParks = useNearbyParks(isOpen);
  const [drill, setDrill] = useState<RunBlock | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const transition = reduce ? { duration: 0 } : { duration: 0.42, ease: EASE_V2 };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="run-briefing-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[100] bg-v2-ink/30"
            />
            <motion.section
              key="run-briefing-sheet"
              aria-label="פרטי האימון"
              role="dialog"
              aria-modal="true"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={transition}
              drag={reduce ? false : 'y'}
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > 600) onClose();
              }}
              className="fixed inset-x-0 bottom-0 top-[max(3rem,env(safe-area-inset-top))] z-[100] flex flex-col overflow-hidden rounded-t-[28px] bg-white shadow-v2-sheet"
              dir="rtl"
            >
              {/* Only the handle zone drags (closes) the sheet — the content keeps its native scroll. */}
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-2.5 active:cursor-grabbing"
              >
                <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" aria-hidden />
              </div>

              {!workout || isLoading || !model ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-v2-accent border-t-transparent" aria-hidden />
                  <span className="text-[14px] font-bold text-v2-muted">טוען אימון...</span>
                </div>
              ) : (
                <>
                  <header onPointerDown={(e) => dragControls.start(e)} className="flex shrink-0 touch-none items-start justify-between gap-3 px-5 pb-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <RunKindTile kind={model.kind} size={44} />
                      <div className="min-w-0">
                        <span
                          className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-extrabold"
                          style={{ background: model.tint, color: model.textColor }}
                        >
                          {model.typeLabel}
                        </span>
                        <div className="mt-1">
                          <WorkoutOverviewHeader v2 title={model.title} meta={model.meta.map((text, i) => ({ key: `m${i}`, text }))} />
                        </div>
                        {model.weekLabel && (
                          <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{model.weekLabel}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="סגור"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
                    >
                      <X size={16} strokeWidth={2.4} className="text-v2-ink-2" />
                    </button>
                  </header>

                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-32">
                    {model.journey.length > 0 && <JourneyStrip v2 items={model.journey} />}
                    <ProfileStrip segments={model.strip} height={44} labels={model.stripLabels} />

                    <section>
                      <h3 className="mb-1 text-[15px] font-black text-v2-ink">מבנה האימון</h3>
                      <RunStructureSteps
                        steps={model.steps}
                        onDrillTap={(i) => {
                          const b = workout.blocks[i];
                          if (b?.drillRef) setDrill(b);
                        }}
                      />
                    </section>

                    {model.kind !== 'interval' && model.ladder.some((z) => z.active) && <RunZoneLadder items={model.ladder} />}
                    <RunCoachTip text={model.tip} />
                    <RunSurfaceTiles tiles={model.surfaces} />
                    <RunNearbyParks parks={nearbyParks} />
                  </div>

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white from-70% to-white/0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
                    <button
                      type="button"
                      onClick={onGo}
                      className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
                    >
                      <Play size={17} strokeWidth={2.6} fill="currentColor" />
                      התחל אימון
                    </button>
                  </div>
                </>
              )}
            </motion.section>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drill?.drillRef && (
          <>
            <motion.div
              key="run-drill-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrill(null)}
              className="fixed inset-0 z-[110] bg-v2-ink/40"
            />
            <motion.section
              key="run-drill-sheet"
              aria-label={drill.label}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={transition}
              className="fixed inset-x-0 bottom-0 top-8 z-[110] overflow-y-auto rounded-t-[28px] bg-white shadow-v2-sheet"
              dir="rtl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-5 pb-2 pt-5">
                <button
                  type="button"
                  onClick={() => setDrill(null)}
                  aria-label="חזרה"
                  className="grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline"
                >
                  <ArrowRight size={18} strokeWidth={2.4} className="text-v2-ink-2" />
                </button>
                <h2 className="flex-1 truncate px-4 text-center text-[17px] font-black text-v2-ink">{drill.label}</h2>
                <span className="w-9" />
              </div>
              <div className="px-5 pb-10">
                <ExerciseDetailContent
                  exerciseName={drill.label}
                  videoUrl={drill.drillRef.videoUrl ?? null}
                  posterUrl={drill.drillRef.thumbnailUrl}
                />
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
