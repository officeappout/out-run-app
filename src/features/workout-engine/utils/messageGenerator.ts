/**
 * Message Generator - The Brain for Dynamic Workout Messages
 * Generates creative titles and descriptions based on workout data and Firebase content
 */
import {
  getCreativeTitles,
  getWorkoutTimeContexts,
  getTimeContextByRange,
  getFocusFragments,
} from '../services/messageService';
import {
  getContentFragments,
  getFunnyTitles,
} from '../services/contentFragmentService';
import { classifyWorkout, type WorkoutClassification } from './classification';

interface WorkoutData {
  title?: string;
  description?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  focus?: string;
  focusArea?: string;
  muscles?: string[];
  segments?: Array<{ type: string }>;
  duration?: number;
  equipment?: string[];
  level?: number | string;
}

/**
 * Determine workout intensity category
 */
function getIntensityCategory(difficulty?: string): 'hard' | 'easy' | 'any' {
  if (!difficulty) return 'any';
  
  if (difficulty === 'hard' || difficulty === 'medium') {
    return 'hard';
  }
  
  return 'easy';
}

/**
 * Determine workout focus from data
 */
function inferWorkoutFocus(workout: WorkoutData): string {
  // Use explicit focus if provided
  if (workout.focus) {
    return workout.focus;
  }
  
  // Infer from muscles
  if (workout.muscles) {
    if (workout.muscles.some(m => m.includes('בטן') || m.includes('core'))) {
      return 'abs';
    }
    if (workout.muscles.some(m => m.includes('גב') || m.includes('חזה') || m.includes('כתפיים'))) {
      return 'upper_body';
    }
    if (workout.muscles.some(m => m.includes('רגליים'))) {
      return 'lower_body';
    }
  }
  
  // Infer from segments
  if (workout.segments) {
    const hasRunning = workout.segments.some(s => s.type === 'running');
    const hasStrength = workout.segments.some(s => s.type === 'strength');
    
    if (hasRunning && hasStrength) {
      return 'full_body';
    }
    if (hasRunning) {
      return 'cardio';
    }
  }
  
  // Default
  return 'recovery';
}

/**
 * Get time range based on current hour
 */
function getTimeRange(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(array: T[]): T | null {
  if (array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get dynamic title for workout
 * 30% chance: Random creative title matching intensity
 * 70% chance: Time greeting + workout focus
 */
export async function getDynamicTitle(
  workout: WorkoutData,
  userTime?: Date
): Promise<string> {
  try {
    const useCreativeTitle = Math.random() < 0.3; // 30% chance
    
    if (useCreativeTitle) {
      // Option 1: Use creative title
      const intensity = getIntensityCategory(workout.difficulty);
      const creativeTitles = await getCreativeTitles(intensity);
      
      if (creativeTitles.length > 0) {
        const selectedTitle = pickRandom(creativeTitles);
        if (selectedTitle) {
          return selectedTitle.text;
        }
      }
    }
    
    // Option 2: Time greeting + focus (70% chance or fallback)
    const currentTime = userTime || new Date();
    const hour = currentTime.getHours();
    const timeRange = getTimeRange(hour);
    
    const timeContext = await getTimeContextByRange(timeRange);
    const greeting = timeContext && timeContext.greetings.length > 0
      ? pickRandom(timeContext.greetings)
      : null;
    
    const focus = inferWorkoutFocus(workout);
    const focusFragments = await getFocusFragments(focus);
    
    let titleParts: string[] = [];
    
    if (greeting) {
      titleParts.push(greeting);
    }
    
    // Add base title or focus-based title
    if (workout.title) {
      titleParts.push(workout.title);
    } else if (focusFragments.length > 0) {
      const focusPhrase = pickRandom(focusFragments[0].phrases);
      if (focusPhrase) {
        titleParts.push(focusPhrase);
      }
    }
    
    return titleParts.length > 0 ? titleParts.join(' - ') : 'אימון יומי';
  } catch (error) {
    console.error('[Message Generator] Error generating dynamic title:', error);
    return workout.title || 'אימון יומי';
  }
}

/**
 * Generate dynamic description for workout
 * Combines focus phrase with workout stats (duration, equipment)
 */
export async function generateDescription(
  workout: WorkoutData
): Promise<string> {
  try {
    const focus = inferWorkoutFocus(workout);
    const focusFragments = await getFocusFragments(focus);
    
    let descriptionParts: string[] = [];
    
    // Add focus phrase
    if (focusFragments.length > 0 && focusFragments[0].phrases.length > 0) {
      const focusPhrase = pickRandom(focusFragments[0].phrases);
      if (focusPhrase) {
        descriptionParts.push(focusPhrase);
      }
    }
    
    // Add base description if exists
    if (workout.description) {
      descriptionParts.push(workout.description);
    }
    
    // Add stats info
    const statsParts: string[] = [];
    
    if (workout.duration) {
      statsParts.push(`${workout.duration} דקות`);
    }
    
    if (workout.equipment && workout.equipment.length > 0) {
      const equipmentList = workout.equipment.slice(0, 3).join(', ');
      statsParts.push(`ציוד: ${equipmentList}`);
    }
    
    if (statsParts.length > 0) {
      descriptionParts.push(statsParts.join(' • '));
    }
    
    return descriptionParts.join('. ').trim() || 'אימון מושלם לחיזוק הגוף והסיבולת.';
  } catch (error) {
    console.error('[Message Generator] Error generating description:', error);
    return workout.description || 'אימון מושלם לחיזוק הגוף והסיבולת.';
  }
}

/**
 * Generate both title and description together
 */
export async function generateWorkoutMessages(
  workout: WorkoutData,
  userTime?: Date
): Promise<{ title: string; description: string }> {
  const [title, description] = await Promise.all([
    getDynamicTitle(workout, userTime),
    generateDescription(workout),
  ]);
  
  return { title, description };
}

/**
 * Get goal label in Hebrew
 */
function getGoalLabel(goal: string): string {
  const labels: Record<string, string> = {
    glutes_abs: 'חיטוב הישבן',
    skills: 'שיפור טכניקה',
    mass_building: 'בניית מסה',
    fat_loss: 'ירידה במשקל',
  };
  return labels[goal] || goal;
}

/**
 * Generate personalized reasoning sentence
 */
function generateReasoning(
  matchedGoals: string[],
  workoutLevel: number | string | undefined,
  focusArea: string
): string {
  if (matchedGoals.length === 0) return '';
  
  const primaryGoal = matchedGoals[0];
  const goalLabel = getGoalLabel(primaryGoal);
  const level = workoutLevel || 'מתאים';
  
  // Map focus area to Hebrew
  const focusLabels: Record<string, string> = {
    abs: 'פלג גוף תחתון',
    upper_body: 'פלג גוף עליון',
    lower_body: 'פלג גוף תחתון',
    full_body: 'כל הגוף',
    core: 'ליבה',
  };
  const focusLabel = focusLabels[focusArea] || focusArea;
  
  return `בהתאם למטרה שלך ל${goalLabel}, בנינו לך אימון רמה ${level} עם דגש על ${focusLabel}.`;
}

/**
 * Generate unified professional & creative workout experience
 * Uses classification engine and content fragments
 */
export async function generateWorkoutExperience(
  workout: WorkoutData,
  userTime?: Date,
  userGoals?: string[]
): Promise<{ 
  title: string; 
  description: string; 
  classification: WorkoutClassification;
  isPersonalized: boolean;
  matchedGoals?: string[];
}> {
  try {
    const currentTime = userTime || new Date();
    const hour = currentTime.getHours();
    const timeOfDay = getTimeRange(hour) as 'morning' | 'afternoon' | 'evening' | 'night';
    
    // Classify workout with user goals
    const classificationResult = classifyWorkout(workout, userGoals);
    const classification = classificationResult.classification;
    
    // Determine intensity for funny titles
    const intensity = workout.difficulty === 'hard' ? 'hard' : 
                     workout.difficulty === 'medium' ? 'moderate' : 'light';
    
    // Determine focus area
    const focusArea = inferWorkoutFocus(workout);
    
    // Generate Title (30% funny, 70% template)
    const useFunnyTitle = Math.random() < 0.3;
    let title: string;
    
    if (useFunnyTitle) {
      const funnyTitles = await getFunnyTitles(intensity, focusArea);
      const selectedTitle = pickRandom(funnyTitles);
      title = selectedTitle?.text || workout.title || 'אימון יומי';
    } else {
      // Template-based: "[Greeting] ל[Focus Area]"
      const timeContext = await getTimeContextByRange(timeOfDay);
      const greeting = timeContext && timeContext.greetings.length > 0
        ? pickRandom(timeContext.greetings)
        : null;
      
      const focusFragments = await getFocusFragments(focusArea);
      const focusPhrase = focusFragments.length > 0 && focusFragments[0].phrases.length > 0
        ? pickRandom(focusFragments[0].phrases)
        : null;
      
      if (greeting && focusPhrase) {
        title = `${greeting} ל${focusPhrase}`;
      } else if (greeting) {
        title = `${greeting} - ${workout.title || 'אימון יומי'}`;
      } else {
        title = workout.title || 'אימון יומי';
      }
    }
    
    // Generate Description (Reasoning + Hook + Pro Insight + Focus + Punchline)
    const descriptionParts: string[] = [];
    
    // Part 0: Personalized Reasoning (if goals match)
    if (classificationResult.isPersonalized && classificationResult.matchedGoals) {
      const reasoning = generateReasoning(
        classificationResult.matchedGoals,
        workout.level || workout.difficulty,
        focusArea
      );
      if (reasoning) {
        descriptionParts.push(reasoning);
      }
    }
    
    // Part 1: Hook (time-based)
    const hooks = await getContentFragments('hook', { timeOfDay });
    const hook = pickRandom(hooks);
    if (hook) {
      descriptionParts.push(hook.text);
    }
    
    // Part 2: Pro Insight (classification-based)
    const proInsights = await getContentFragments('pro_insight', {
      workoutType: classification,
      difficulty: workout.difficulty,
    });
    const proInsight = pickRandom(proInsights);
    if (proInsight) {
      descriptionParts.push(proInsight.text);
    }
    
    // Part 3: Focus (muscle/focus area)
    const focusFragments = await getContentFragments('focus', {
      targetMuscle: focusArea,
    });
    const focusFragment = pickRandom(focusFragments);
    if (focusFragment) {
      descriptionParts.push(focusFragment.text);
    }
    
    // Part 4: Punchline (difficulty-based)
    const punchlines = await getContentFragments('punchline', {
      difficulty: workout.difficulty,
    });
    const punchline = pickRandom(punchlines);
    if (punchline) {
      descriptionParts.push(punchline.text);
    }
    
    // Join all parts into natural RTL paragraph
    let description = descriptionParts.join('. ').trim();
    
    // Fallback if no fragments found
    if (!description) {
      description = workout.description || 'אימון מושלם לחיזוק הגוף והסיבולת.';
    }
    
    return {
      title,
      description,
      classification,
      isPersonalized: classificationResult.isPersonalized,
      matchedGoals: classificationResult.matchedGoals,
    };
  } catch (error) {
    console.error('[Message Generator] Error generating workout experience:', error);
    // Fallback
    const fallbackClassification = classifyWorkout(workout, userGoals);
    return {
      title: workout.title || 'אימון יומי',
      description: workout.description || 'אימון מושלם לחיזוק הגוף והסיבולת.',
      classification: fallbackClassification.classification,
      isPersonalized: fallbackClassification.isPersonalized,
      matchedGoals: fallbackClassification.matchedGoals,
    };
  }
}
