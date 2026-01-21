/**
 * Route Types
 * Running, walking, and cycling routes
 */

export type ActivityType = 'running' | 'walking' | 'cycling' | 'workout';
export type SegmentType = 'run' | 'walk' | 'workout' | 'bench' | 'finish';

export interface Exercise {
  id: string;
  name: string;
  reps?: string;
  duration?: string;
  videoUrl?: string;
  instructions?: string[];
  icon?: string;
}

export interface RouteSegment {
  id?: string;
  type: SegmentType;
  title: string;
  subTitle?: string;
  distance?: string;
  duration?: string;
  location?: { lat: number; lng: number };
  exercises?: Exercise[];
}

export type WorkoutSegmentType = 'travel' | 'station';

export interface WorkoutSegment {
  id: string;
  type: WorkoutSegmentType;
  title: string;
  subTitle?: string;
  icon: string;
  target: {
    type: 'distance' | 'time' | 'reps';
    value: number;
    unit?: string;
  };
  exercises?: Exercise[];
  isCompleted: boolean;
  heartRateTarget?: string;
  paceTarget?: string;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  segments: WorkoutSegment[];
  totalDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface PlannedRoute {
  id: string;
  name: string;
  totalDistance: number;
  totalTime: number;
  pathCoordinates: [number, number][];
  stops: {
    parkId: string;
    order: number;
    suggestedWorkoutId?: string;
  }[];
}

export interface RouteFeatures {
  hasGym: boolean;
  hasBenches: boolean;
  lit: boolean;
  scenic: boolean;
  terrain: string;      
  environment: string;
  trafficLoad: string;
  surface: string;      
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  descriptionKey?: string;

  // Numeric data
  distance: number;
  duration: number;
  score: number;

  type: ActivityType;
  activityType?: ActivityType;
  difficulty: 'easy' | 'medium' | 'hard';

  // Ratings
  rating: number;
  calories: number;
  adminRating?: number;
  isPromoted?: boolean;

  // Source management
  source?: {
    type: 'official_api' | 'user_generated' | 'system';
    name: string;
    externalId?: string;
    externalLink?: string;
  };

  // Analytics
  analytics?: {
    usageCount: number;
    rating: number;
    heatMapScore: number;
  };

  // Features
  features: RouteFeatures;

  // Route structure
  segments: RouteSegment[];
  path: [number, number][];

  // Display
  color?: string;

  // Runtime fields
  calculatedScore?: number;
  distanceFromUser?: number;
  isWarmupFeasible?: boolean;
  isReachableWithoutCar?: boolean;
  includesOfficialSegments?: boolean;
  visitingParkId?: string | null;
  includesFitnessStop?: boolean;
}
