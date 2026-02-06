import { ExecutionLocation, ExerciseRole, MovementGroup, MuscleGroup } from '@/features/content/exercises';

export type GroupByOption = 'program' | 'muscleGroup' | 'location' | 'pattern';

export interface FilterState {
  lifestyleTags: string[];
  locations: ExecutionLocation[];
  equipment: string[];
  brands: string[]; // Brand IDs for filtering
  difficulty: number[];
  muscleGroups: MuscleGroup[];
  movementPatterns: MovementGroup[];
  exerciseRoles: ExerciseRole[];
  movementTypes: ('compound' | 'isolation')[];
  symmetries: ('bilateral' | 'unilateral')[];
}

export interface MatrixCell {
  exerciseId: string;
  location: ExecutionLocation;
  hasVideo: boolean;
  hasDuration: boolean;
  hasNotificationText: boolean; // Whether notification text exists
  hasYouTubeTutorial: boolean;
  youtubeTutorialLangs: ('he' | 'en')[];
  lifestyleTags: string[];
  status: 'complete' | 'partial' | 'missing';
}

export interface ContentStats {
  total: number;
  complete: number;
  partial: number;
  missing: number;
  coverage: number;
  toShoot: number;
}
