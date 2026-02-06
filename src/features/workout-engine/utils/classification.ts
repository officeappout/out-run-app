/**
 * Workout Classification Engine
 * Analyzes workout structure to determine training style
 */

interface WorkoutSegment {
  type: 'running' | 'strength' | 'cardio' | 'flexibility';
  repsOrDuration?: string;
  sets?: number;
  rest?: number; // seconds
  tags?: string[];
  exerciseId?: string; // For checking exercise tags
}

interface WorkoutData {
  segments?: WorkoutSegment[];
  difficulty?: 'easy' | 'medium' | 'hard';
  focus?: string;
  muscles?: string[];
  focusArea?: string;
}

export type WorkoutClassification = 'strength' | 'volume' | 'endurance' | 'skills' | 'hiit' | 'general';

export interface ClassificationResult {
  classification: WorkoutClassification;
  isPersonalized: boolean;
  matchedGoals?: string[];
}

/**
 * Parse reps from string like "15 חזרות" or "10 reps"
 */
function parseReps(repsOrDuration?: string): number | null {
  if (!repsOrDuration) return null;
  
  const match = repsOrDuration.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Map workout focus to user goals
 */
function mapFocusToGoal(focus: string, muscles?: string[]): string[] {
  const matchedGoals: string[] = [];
  
  // Check focus area
  if (focus) {
    if (focus.includes('abs') || focus.includes('core') || focus.includes('בטן')) {
      matchedGoals.push('glutes_abs');
    }
    if (focus.includes('skill') || focus.includes('technique') || focus.includes('טכניקה')) {
      matchedGoals.push('skills');
    }
    if (focus.includes('mass') || focus.includes('bulk') || focus.includes('מסה')) {
      matchedGoals.push('mass_building');
    }
    if (focus.includes('fat') || focus.includes('loss') || focus.includes('חיטוב')) {
      matchedGoals.push('fat_loss');
    }
  }
  
  // Check muscles
  if (muscles) {
    if (muscles.some(m => m.includes('ישבן') || m.includes('glutes'))) {
      matchedGoals.push('glutes_abs');
    }
    if (muscles.some(m => m.includes('בטן') || m.includes('core'))) {
      matchedGoals.push('glutes_abs');
    }
  }
  
  return [...new Set(matchedGoals)]; // Remove duplicates
}

/**
 * Classify workout based on structure and parameters
 * Returns classification with personalized flag if goals match
 */
export function classifyWorkout(
  workout: WorkoutData,
  userGoals?: string[]
): ClassificationResult {
  // Determine workout focus
  const workoutFocus = workout.focus || workout.focusArea || '';
  const matchedGoals = userGoals && workoutFocus 
    ? mapFocusToGoal(workoutFocus, workout.muscles).filter(goal => userGoals.includes(goal))
    : [];
  
  const isPersonalized = matchedGoals.length > 0;
  
  if (!workout.segments || workout.segments.length === 0) {
    return {
      classification: 'general',
      isPersonalized,
      matchedGoals: isPersonalized ? matchedGoals : undefined,
    };
  }

  // Extract strength segments only
  const strengthSegments = workout.segments.filter(s => s.type === 'strength');
  
  if (strengthSegments.length === 0) {
    // No strength segments - likely cardio/running
    return {
      classification: 'endurance',
      isPersonalized,
      matchedGoals: isPersonalized ? matchedGoals : undefined,
    };
  }

  // Calculate average reps and rest
  let totalReps = 0;
  let repsCount = 0;
  let totalRest = 0;
  let restCount = 0;
  let totalSets = 0;
  const allTags: string[] = [];
  let explosiveCount = 0;
  let skillTagCount = 0;

  strengthSegments.forEach(segment => {
    const reps = parseReps(segment.repsOrDuration);
    if (reps !== null) {
      totalReps += reps;
      repsCount++;
    }
    
    if (segment.rest !== undefined) {
      totalRest += segment.rest;
      restCount++;
    }
    
    if (segment.sets) {
      totalSets += segment.sets;
    }
    
    if (segment.tags) {
      allTags.push(...segment.tags);
      // Count explosive and skill tags
      if (segment.tags.includes('explosive') || segment.tags.some(t => t.toLowerCase().includes('explosive'))) {
        explosiveCount++;
      }
      if (segment.tags.includes('skill') || segment.tags.some(t => t.toLowerCase().includes('skill'))) {
        skillTagCount++;
      }
    }
  });

  const avgReps = repsCount > 0 ? totalReps / repsCount : 0;
  const avgRest = restCount > 0 ? totalRest / restCount : 0;
  const avgSets = strengthSegments.length > 0 ? totalSets / strengthSegments.length : 0;

  // Check for HIIT: rest < 30s AND has explosive exercises
  if (avgRest > 0 && avgRest < 30 && explosiveCount > 0) {
    const fatLossMatched = userGoals?.includes('fat_loss') || false;
    return {
      classification: 'hiit',
      isPersonalized: fatLossMatched || isPersonalized,
      matchedGoals: fatLossMatched ? ['fat_loss', ...matchedGoals] : (isPersonalized ? matchedGoals : undefined),
    };
  }

  // Check for skills-based workout: count of 'skill' tags >= 2
  const skillTags = ['balance', 'technique', 'stability', 'איזון', 'טכניקה', 'יציבות', 'skill'];
  const hasSkillTags = allTags.some(tag => skillTags.some(skill => tag.toLowerCase().includes(skill.toLowerCase())));
  if (skillTagCount >= 2 || hasSkillTags) {
    // Check if skills goal matches
    const skillsMatched = userGoals?.includes('skills') || false;
    return {
      classification: 'skills',
      isPersonalized: skillsMatched || isPersonalized,
      matchedGoals: skillsMatched ? ['skills', ...matchedGoals] : (isPersonalized ? matchedGoals : undefined),
    };
  }

  // Strength classification: low reps, high rest
  if (avgReps < 6 && avgRest > 90) {
    return {
      classification: 'strength',
      isPersonalized,
      matchedGoals: isPersonalized ? matchedGoals : undefined,
    };
  }

  // Volume classification: moderate reps, multiple sets
  if (avgReps >= 8 && avgReps <= 12 && avgSets > 3) {
    return {
      classification: 'volume',
      isPersonalized,
      matchedGoals: isPersonalized ? matchedGoals : undefined,
    };
  }

  // Endurance classification: high reps or low rest
  if (avgReps > 15 || avgRest < 45) {
    return {
      classification: 'endurance',
      isPersonalized,
      matchedGoals: isPersonalized ? matchedGoals : undefined,
    };
  }

  // Default
  return {
    classification: 'general',
    isPersonalized,
    matchedGoals: isPersonalized ? matchedGoals : undefined,
  };
}

/**
 * Get classification label in Hebrew
 */
export function getClassificationLabel(classification: WorkoutClassification): string {
  const labels: Record<WorkoutClassification, string> = {
    strength: 'אימון כוח',
    volume: 'אימון נפח',
    endurance: 'אימון סיבולת',
    skills: 'אימון טכניקה',
    hiit: 'אימון HIIT',
    general: 'אימון כללי',
  };
  return labels[classification] || 'אימון כללי';
}
