/**
 * Strength Workout Components
 * 
 * Specialized UI components for strength training flow
 */

export { 
  default as StrengthDopamineScreen,
  DEFAULT_BONUSES,
  ANIMATION_DELAYS,
  STATUS_MESSAGES,
  triggerHaptic,
  type BonusStep,
  type StrengthDopamineScreenProps,
} from './StrengthDopamineScreen';

export {
  default as StrengthSummaryPage,
  calculateCalories,
  calculateCoins,
  formatDuration,
  MET_BY_DIFFICULTY,
  COIN_BONUS_BY_DIFFICULTY,
  type Difficulty,
  type CompletedExercise,
  type StrengthSummaryPageProps,
} from './StrengthSummaryPage';
