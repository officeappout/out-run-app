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
  /**
   * Home v2 run overview "התאם קצב" (enable_home_v2): the runner's own target
   * band for THIS workout only (sec/km, min = faster). Wins over the zone in
   * resolveBlockTargetPace, so the live player targets it. Never on a
   * template; a run with it never feeds the pace self-correction.
   */
  paceOverride?: { min: number; max: number };
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