/**
 * User Progression Barrel Export
 * Gamification engine: coins, lemur evolution, badges, dynamic goals
 */

// Store
export { useProgressionStore, useLemurStage } from './store/useProgressionStore';
export type { GoalHistoryEntry, ActivityType } from './store/useProgressionStore';

// Services
export * from './services/coin-calculator.service';
export * from './services/lemur-evolution.service';
export * from './services/achievement.service';
export * from './services/progression.service';
export * from './services/smart-goals.service';

// Components
export { default as LemurAvatar } from './components/LemurAvatar';
export { default as CoinPill } from './components/CoinPill';
export { default as BadgeDisplay } from './components/BadgeDisplay';
export { default as ProgressRing } from './components/ProgressRing';
export { default as StreakScreen } from './components/StreakScreen';