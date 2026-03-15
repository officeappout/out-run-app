// src/features/run/types/run-workout.type.ts

import RunBlock from './run-block.type';

export type RunWorkout = {
  id: string;
  title: string;
  description?: string;
  isQualityWorkout: boolean;
  blocks: RunBlock[];
  videoUrl?: string;

  /** Coaching explanation resolved from Firestore metadata (replaces generic description in briefing). */
  logicCue?: string;
  /** Motivational phrase resolved from Firestore metadata. */
  aiCue?: string;
  /** Where the metadata came from ('firestore' | 'fallback'). */
  metadataSource?: 'firestore' | 'fallback';
};

export default RunWorkout;