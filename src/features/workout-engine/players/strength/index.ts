/**
 * Strength Player Barrel Export
 */

// Main Runner
export { default as StrengthRunner } from './StrengthRunner';

// Components
export { default as LiveWorkoutOverlay } from './components/LiveWorkoutOverlay';
export { default as SegmentCard } from './components/SegmentCard';
export { default as StationCard } from './components/StationCard';
export { default as TravelCard } from './components/TravelCard';
export { default as WorkoutHeader } from './components/WorkoutHeader';
export { default as WorkoutPreviewDrawer } from './components/WorkoutPreviewDrawer';
export { default as WorkoutStickyNav } from './components/WorkoutStickyNav';
export { default as WorkoutTimeline } from './components/WorkoutTimeline';
export { default as ExerciseReplacementModal } from './components/ExerciseReplacementModal';
export { default as CircularTimer } from './components/CircularTimer';
export { default as FillingButton } from './components/FillingButton';
// New Modular Components (Refactored from StrengthRunner)
export { default as WorkoutStoryBars } from './components/WorkoutStoryBars';
export { default as ExerciseVideoPlayer } from './components/ExerciseVideoPlayer';
export { default as ExerciseDetailsSheet } from './components/ExerciseDetailsSheet';
export { default as RestScreen } from './components/RestScreen';
export { default as RestWithPreview } from './components/RestWithPreview';

// Overlays
export { default as TimeLoggerPopup } from './overlays/TimeLoggerPopup';

// Playlist
export { default as WorkoutQueue } from './playlist/WorkoutQueue';

// Hooks (Phase 1 extraction)
export { useWorkoutStateMachine } from './hooks/useWorkoutStateMachine';
export type {
  WorkoutState,
  ExerciseResultLog,
  NextExerciseInfo,
  WorkoutStateMachineResult,
  WorkoutBlockType,
  WorkoutBlockContext,
  ForceTransitionPayload,
} from './hooks/useWorkoutStateMachine';
export { useWorkoutTimers } from './hooks/useWorkoutTimers';
export type { UseWorkoutTimersResult } from './hooks/useWorkoutTimers';
export { useWorkoutPersistence } from './hooks/useWorkoutPersistence';
export type { WorkoutCheckpoint, UseWorkoutPersistenceResult } from './hooks/useWorkoutPersistence';
