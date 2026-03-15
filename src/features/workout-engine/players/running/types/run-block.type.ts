import type { RunZoneType } from '../../../core/types/running.types';

export type RunBlockType = 'warmup' | 'run' | 'walk' | 'interval' | 'recovery' | 'cooldown';

export type RunBlock = {
  id: string;
  type: RunBlockType;
  label: string;
  durationSeconds?: number;
  distanceMeters?: number;
  targetPacePercentage?: {
    min: number;
    max: number;
  };
  zoneType?: RunZoneType;
  isQualityExercise?: boolean;
  colorHex: string;
  blockMode?: 'pace' | 'effort';
  effortConfig?: {
    effortLevel: 'moderate' | 'hard' | 'max';
    recoveryType?: 'jog_down' | 'walk_down';
    inclinePercent?: number;
  };
  restBetweenSetsSeconds?: number;
  restType?: 'standing' | 'walk' | 'jog';
  /** Set by materializeWorkout() for rest blocks injected between interval sets. Never saved to Firestore. */
  _isSynthesizedRest?: true;
  /** Set by materializeWorkout() for warmup/cooldown/strides blocks auto-injected based on category. */
  _isDynamicWrapper?: true;
  /** Optional drill/exercise reference for technique-drill blocks within a running workout. */
  drillRef?: {
    exerciseId: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    repsCount?: number;
  };
};

export default RunBlock;