/**
 * Split Decision Module — Dynamic Training Frequency & Split Engine
 */

export {
  getWorkoutContext,
  type GetWorkoutContextInput,
  type AggregateBudgetInfo,
} from './SplitDecisionService';
export { trackMuscleUsage, type TrackMuscleUsageInput } from './muscle-fatigue.service';
export {
  SPLIT_MATRIX,
  getLevelTier,
  getFrequencyIndex,
  resolveSplitLogic,
  type SessionType,
  type LevelTier,
  type SplitLogic,
  type SplitWorkoutContext,
} from './split-decision.types';
