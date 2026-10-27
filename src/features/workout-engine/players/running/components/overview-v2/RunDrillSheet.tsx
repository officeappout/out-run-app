'use client';

/**
 * RunDrillSheet — a run block's drill / exercise (strides, mobility in the
 * warm-up / cool-down) opened from the run overview's axis (enable_home_v2).
 * Restores the old briefing's "tap a drill in מבנה האימון to watch it".
 *
 *   exercise found in the catalog (getAllExercisesCached, by drillRef.exerciseId)
 *     → the library's ExerciseDetailSheet (v2, controlled), over the drawer
 *   not found / catalog failed
 *     → the old briefing's sheet: ExerciseDetailContent with the block's own video
 */

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { IconButton, Sheet, SHEET_Z } from '@/components/ui/v2';
import ExerciseDetailSheet from '@/features/content/exercises/client/components/ExerciseDetailSheet';
import { getAllExercisesCached } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import ExerciseDetailContent from '@/features/workout-engine/players/strength/components/ExerciseDetailContent';
import type { RunBlock } from '../../types/run-block.type';
import { cleanBlockLabel } from '../../utils/run-preview/run-title';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

/** Over the overview drawer (z-[100]) and its edit sheets — the z-[104]/z-[105] row. */
const LAYER = { zIndex: SHEET_Z.freeRunExtrasPanel, backdropZIndex: SHEET_Z.freeRunExtras } as const;

/** What the tapped exercise id resolved to (keyed by id — a stale answer never shows for another drill). */
type Resolved = { id: string; exercise: Exercise | null };

export interface RunDrillSheetProps {
  /** The tapped block (must carry a drillRef); null = closed. */
  block: RunBlock | null;
  onClose: () => void;
}

export default function RunDrillSheet({ block, onClose }: RunDrillSheetProps) {
  const t = useT(player);
  const exerciseId = block?.drillRef?.exerciseId ?? null;
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let alive = true;
    getAllExercisesCached()
      .then((all) => {
        if (alive) setResolved({ id: exerciseId, exercise: all.find((e) => e.id === exerciseId) ?? null });
      })
      .catch(() => {
        if (alive) setResolved({ id: exerciseId, exercise: null });
      });
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  const drill = block?.drillRef ? block : null;
  const answer = drill && resolved?.id === exerciseId ? resolved : null;
  const title = drill ? cleanBlockLabel(drill.label) || drill.label : undefined;

  return (
    <>
      <ExerciseDetailSheet
        layer={LAYER}
        controlled={{ exercise: answer?.exercise ?? null, onClose }}
      />
      <Sheet
        open={!!answer && !answer.exercise}
        onClose={onClose}
        layout="nested"
        zIndex={LAYER.zIndex}
        className="h-[94dvh]"
        ariaLabel={title}
        dir="rtl"
        header={(
          <div className="flex items-center justify-between px-5 pb-2">
            <IconButton aria-label={t('run.overview.drill.back')} tone="surface" size={36} onClick={onClose}>
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </IconButton>
            <h2 className="flex-1 truncate whitespace-nowrap px-4 text-center text-[17px] font-black text-v2-ink">{title}</h2>
            <span className="w-9" />
          </div>
        )}
      >
        {drill?.drillRef && (
          <div className="px-5 pb-10">
            <ExerciseDetailContent
              exerciseName={title ?? drill.label}
              videoUrl={drill.drillRef.videoUrl ?? null}
              posterUrl={drill.drillRef.thumbnailUrl}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}
