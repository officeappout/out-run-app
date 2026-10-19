'use client';

/**
 * v2 run briefing (boards R1-prop-intervals / R1-prop-tempo / U-A2,
 * enable_home_v2), on the shared v2 Sheet. Same props and actions as the
 * legacy RunBriefingDrawer: backdrop / ✕ / drag the grabber down to close,
 * one CTA to go.
 *
 * Order (owner): overview header (title · time · km · reps) → journey strip
 * → intensity profile → structure → zone ladder · tip · where to run · parks.
 */

import { useState } from 'react';
import { ArrowRight, Play, X } from 'lucide-react';
import { IconButton, JourneyStrip, ProfileStrip, Sheet, SHEET_Z, WorkoutOverviewHeader } from '@/components/ui/v2';
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

export default function RunBriefingDrawerV2({
  isOpen, onClose, onGo, workout, isLoading, templateCategory, week,
}: RunBriefingDrawerV2Props) {
  const model = useRunPreviewModel(workout, { templateCategory, week });
  const nearbyParks = useNearbyParks(isOpen);
  const [drill, setDrill] = useState<RunBlock | null>(null);
  const ready = !!workout && !isLoading && !!model;

  const header = ready && model ? (
    <div className="flex items-start justify-between gap-3 px-5 pb-3">
      <div className="flex min-w-0 items-start gap-3">
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
          {model.weekLabel && <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{model.weekLabel}</p>}
        </div>
      </div>
      <IconButton aria-label="סגירה" tone="surface" size={36} onClick={onClose} className="shrink-0">
        <X className="h-4 w-4" strokeWidth={2.4} />
      </IconButton>
    </div>
  ) : undefined;

  const footer = ready ? (
    <div className="px-4 pt-3">
      <button
        type="button"
        onClick={onGo}
        className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Play size={17} strokeWidth={2.6} fill="currentColor" />
        התחל אימון
      </button>
    </div>
  ) : undefined;

  return (
    <>
      <Sheet
        open={isOpen}
        onClose={onClose}
        layout="nested"
        zIndex={SHEET_Z.overlay}
        header={header}
        hideClose={!ready}
        footer={footer}
        dragToDismiss
        className="h-[92dvh]"
        ariaLabel="פרטי האימון"
        dir="rtl"
      >
        {!ready || !model || !workout ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-32">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-v2-accent border-t-transparent" aria-hidden />
            <span className="text-[14px] font-bold text-v2-muted">טוען אימון...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 pb-4">
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
        )}
      </Sheet>

      <Sheet
        open={!!drill?.drillRef}
        onClose={() => setDrill(null)}
        layout="nested"
        zIndex={SHEET_Z.aboveOffline}
        className="h-[94dvh]"
        ariaLabel={drill?.label}
        dir="rtl"
        header={
          <div className="flex items-center justify-between px-5 pb-2">
            <IconButton aria-label="חזרה" tone="surface" size={36} onClick={() => setDrill(null)}>
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </IconButton>
            <h2 className="flex-1 truncate px-4 text-center text-[17px] font-black text-v2-ink">{drill?.label}</h2>
            <span className="w-9" />
          </div>
        }
      >
        {drill?.drillRef && (
          <div className="px-5 pb-10">
            <ExerciseDetailContent
              exerciseName={drill.label}
              videoUrl={drill.drillRef.videoUrl ?? null}
              posterUrl={drill.drillRef.thumbnailUrl}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}
