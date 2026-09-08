// src/features/run/types/run-workout.type.ts

import RunBlock from './run-block.type';
import type { WeekSlot } from '@/features/workout-engine/core/types/running.types';

export type RunWorkout = {
  id: string;
  title: string;
  description?: string;
  isQualityWorkout: boolean;
  blocks: RunBlock[];
  videoUrl?: string;

  /** Running workout category (e.g., 'short_intervals', 'tempo', 'easy_run'). */
  category?: string;

  /**
   * The WeekSlot this workout was selected for (generatePlan,
   * running-engine.service.ts) — 'quality_primary'/'quality_secondary'/
   * 'long_run'/'easy_run'/'recovery'. Attached right after selection;
   * absent when generated via the non-phases weekTemplates branch (no
   * WeekSlot concept there — confirmed dead for anything
   * generateProgramTemplate produces, so this is expected, not a bug).
   */
  slotType?: WeekSlot['slotType'];

  /** Coaching explanation resolved from Firestore metadata (replaces generic description in briefing). */
  logicCue?: string;
  /** Motivational phrase resolved from Firestore metadata. */
  aiCue?: string;
  /** Where the metadata came from ('firestore' | 'fallback'). */
  metadataSource?: 'firestore' | 'fallback';
};

export default RunWorkout;