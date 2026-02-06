/**
 * Map-Specific Types
 * Device types, workouts, and other map-related definitions
 */

export type MuscleGroup =
  | 'chest' | 'back' | 'middle_back' | 'shoulders' | 'rear_delt' | 'abs' | 'obliques'
  | 'forearms' | 'biceps' | 'triceps' | 'quads'
  | 'hamstrings' | 'glutes' | 'calves' | 'traps'
  | 'cardio' | 'full_body' | 'core' | 'legs';

export type DeviceType =
  | 'hydraulic'
  | 'static'
  | 'calisthenics'
  | 'cardio';

export type DeviceWorkoutType = 'time' | 'reps' | 'static';

export type Manufacturer = 'urbanix' | 'lodos' | 'other';

export interface ParkDevice {
  id: string;
  name: string;
  mainMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  type?: DeviceType;
  workoutType?: string;
  difficultyLevel?: 1 | 2 | 3;
  recommendedLevel?: number;
  isFunctional?: boolean;
  manufacturer?: string;
  imageUrl?: string;
  videoUrl?: string;
  executionTips?: string[];
}

export interface ParkWorkout {
  id: string;
  title: string;
  durationMinutes: number;
  difficulty: 1 | 2 | 3;
  imageUrl: string;
  tags: string[];
}
