/**
 * Branding & Messaging Utilities
 * Tag resolver for dynamic text replacement in notifications and descriptions
 */

import { NotificationTriggerType } from './branding.types';
import { UserFullProfile } from '@/features/user';
import { getUserFirstName, getUserGoalHebrew } from './branding.service';

export interface TagResolverContext {
  // Persona & Location
  persona?: string;
  location?: string;
  locationName?: string; // For @שם_הפארק / @שם_המתקן
  
  // Time
  currentTime?: Date;
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  
  // Notification-specific
  triggerType?: NotificationTriggerType;
  daysInactive?: number;
  
  // Exercise/Workout context
  exerciseName?: string;
  category?: string;
  muscles?: string[];
  
  // Goals
  goal?: string;
  
  // User context (for descriptions)
  userName?: string; // User's first name
  userGoal?: string; // User's selected goal in Hebrew
  userGender?: 'male' | 'female' | 'other'; // User's gender for gender-sensitive tags
  userProfile?: UserFullProfile; // Full user profile for advanced resolution
  
  // Equipment context
  equipment?: string[]; // Required equipment names

  // === Golden Content Fields ===
  /** User's sport type (e.g., 'basketball', 'running', 'soccer') */
  sportType?: string;
  /** Content motivation style (e.g., 'tough', 'encouraging', 'scientific') */
  motivationStyle?: string;
  /** User's experience level (e.g., 'beginner', 'advanced', 'pro') */
  experienceLevel?: string;

  // === Progress & Level-Up Context ===
  /** User's current program progress (0-100%) */
  programProgress?: number;
  /** Current program name (e.g., 'pulling', 'pushing', 'core', 'legs') */
  currentProgram?: string;
  /** Target level (e.g., 4) for "רמה 4" */
  targetLevel?: number;

  // === Proximity Context ===
  /** Distance to park/facility in meters */
  distanceMeters?: number;
  /** Estimated arrival time in minutes */
  estimatedArrivalMinutes?: number;

  // === Workout Analysis Context ===
  /** Workout duration in minutes for @זמן_אימון tag */
  durationMinutes?: number;
  /** Difficulty level (1|2|3 or 'easy'|'medium'|'hard') for @עצימות tag */
  difficulty?: number | string;
  /** Precomputed dominant muscle group for @מיקוד tag */
  dominantMuscle?: string;
  /** Hebrew display name of workout category for @קטגוריה tag */
  categoryLabel?: string;

  // === Level Goal Context ===
  /** Target exercise name for current level (for @תרגיל_יעד tag) */
  targetExerciseName?: string;
  /** Formatted target value + unit, e.g. "10 חזרות" (for @ערך_יעד tag) */
  targetValue?: string;
  /** Percentage progress toward next level (0-100) (for @אחוז_התקדמות_רמה tag) */
  goalProgressPercent?: number;
}

/**
 * Resolve @tags in notification or description text
 * Supports dynamic replacement based on context
 */
export function resolveNotificationText(
  text: string,
  context: TagResolverContext
): string {
  if (!text) return '';
  
  let resolved = text;
  const now = context.currentTime || new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  
  // Time-based tags
  resolved = resolved.replace(/@שעה/g, () => {
    return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  });
  
  resolved = resolved.replace(/@זמן_יום/g, () => {
    if (hour >= 5 && hour < 12) return 'בוקר';
    if (hour >= 12 && hour < 17) return 'צהריים';
    if (hour >= 17 && hour < 22) return 'ערב';
    return 'לילה';
  });
  
  // Location-based tags (only for Location_Based triggers)
  if (context.triggerType === 'Location_Based') {
    resolved = resolved.replace(/@שם_הפארק/g, () => {
      if (context.locationName) return context.locationName;
      if (context.location === 'park') return 'הפארק הקרוב';
      return 'המיקום';
    });
    
    resolved = resolved.replace(/@שם_המתקן/g, () => {
      if (context.locationName) return context.locationName;
      if (context.location === 'gym') return 'מכון הכושר';
      if (context.location === 'park') return 'המתקן בפארק';
      return 'המתקן';
    });
  }
  
  // Inactivity tags
  if (context.triggerType === 'Inactivity' && context.daysInactive !== undefined) {
    resolved = resolved.replace(/@ימי_אי_פעילות/g, () => {
      return context.daysInactive!.toString();
    });
  }
  
  // Persona tags
  const personaLabels: Record<string, string> = {
    parent: 'הורה',
    student: 'סטודנט',
    school_student: 'תלמיד',
    office_worker: 'עובד משרד',
    remote_worker: 'עובד מהבית',
    athlete: 'ספורטאי',
    senior: 'גיל הזהב',
    reservist: 'מילואימניק',
    active_soldier: 'חייל סדיר',
  };
  
  resolved = resolved.replace(/@פרסונה/g, () => {
    if (context.persona && personaLabels[context.persona]) {
      return personaLabels[context.persona];
    }
    return 'משתמש';
  });
  
  // Location tags
  const locationLabels: Record<string, string> = {
    home: 'בית',
    park: 'פארק',
    office: 'משרד',
    street: 'רחוב',
    gym: 'מכון כושר',
    school: 'בית ספר',
    airport: 'שדה תעופה',
    library: 'ספרייה',
  };
  
  resolved = resolved.replace(/@מיקום/g, () => {
    if (context.location && locationLabels[context.location]) {
      return locationLabels[context.location];
    }
    return 'המיקום';
  });
  
  // Exercise/Workout tags
  resolved = resolved.replace(/@שם_תרגיל/g, () => {
    return context.exerciseName || 'התרגיל';
  });
  
  resolved = resolved.replace(/@קטגוריה/g, () => {
    return context.category || 'כוח';
  });
  
  resolved = resolved.replace(/@שרירים/g, () => {
    if (context.muscles && context.muscles.length > 0) {
      const muscleLabels: Record<string, string> = {
        chest: 'חזה',
        back: 'גב',
        shoulders: 'כתפיים',
        abs: 'בטן',
        quads: 'ארבע ראשי',
        hamstrings: 'המסטרינג',
        glutes: 'ישבן',
      };
      const labels = context.muscles
        .slice(0, 2)
        .map(m => muscleLabels[m] || m)
        .join(' ו-');
      return labels || 'כל הגוף';
    }
    return 'כל הגוף';
  });
  
  // Goal tags
  resolved = resolved.replace(/@מטרה/g, () => {
    return context.goal || 'אימון';
  });
  
  // Gender-sensitive tags
  const userGender = context.userGender || 'other';
  const isFemale = userGender === 'female';
  const isMale = userGender === 'male';
  
  // @את/ה -> 'את' for female, 'אתה' for male
  resolved = resolved.replace(/@את\/ה/g, () => {
    if (isFemale) return 'את';
    if (isMale) return 'אתה';
    return 'את/ה'; // Neutral fallback
  });
  
  // @מוכן/ה -> 'מוכנה' for female, 'מוכן' for male
  resolved = resolved.replace(/@מוכן\/ה/g, () => {
    if (isFemale) return 'מוכנה';
    if (isMale) return 'מוכן';
    return 'מוכן/ה'; // Neutral fallback
  });
  
  // @בוא/י -> 'בואי' for female, 'בוא' for male
  resolved = resolved.replace(/@בוא\/י/g, () => {
    if (isFemale) return 'בואי';
    if (isMale) return 'בוא';
    return 'בוא/י'; // Neutral fallback
  });
  
  // @עשית/ה -> 'עשית' for female, 'עשית' for male (same in past tense)
  resolved = resolved.replace(/@עשית\/ה/g, () => {
    return 'עשית'; // Same for both genders
  });
  
  // @תוכל/י -> 'תוכלי' for female, 'תוכל' for male
  resolved = resolved.replace(/@תוכל\/י/g, () => {
    if (isFemale) return 'תוכלי';
    if (isMale) return 'תוכל';
    return 'תוכל/י'; // Neutral fallback
  });
  
  // @תרצה/י -> 'תרצי' for female, 'תרצה' for male
  resolved = resolved.replace(/@תרצה\/י/g, () => {
    if (isFemale) return 'תרצי';
    if (isMale) return 'תרצה';
    return 'תרצה/י'; // Neutral fallback
  });
  
  return resolved;
}

/**
 * Get available tags for a given trigger type
 */
export function getAvailableTags(triggerType?: NotificationTriggerType): Array<{
  tag: string;
  description: string;
  example: string;
}> {
  const commonTags = [
    {
      tag: '@פרסונה',
      description: 'שם הפרסונה (הורה, סטודנט, וכו\')',
      example: '@פרסונה יקר, בוא נחזור לשגרה!',
    },
    {
      tag: '@מיקום',
      description: 'מיקום האימון (בית, פארק, וכו\')',
      example: 'אימון מושלם ב-@מיקום',
    },
    {
      tag: '@שעה',
      description: 'השעה הנוכחית (HH:MM)',
      example: 'השעה @שעה, זמן טוב ל-@מטרה',
    },
    {
      tag: '@זמן_יום',
      description: 'זמן היום (בוקר, צהריים, ערב)',
      example: '@זמן_יום טוב!',
    },
  ];
  
  const inactivityTags = [
    {
      tag: '@ימי_אי_פעילות',
      description: 'מספר הימים ללא אימון',
      example: 'כבר @ימי_אי_פעילות ימים שלא ראינו אותך',
    },
  ];
  
  const locationTags = [
    {
      tag: '@שם_הפארק',
      description: 'שם הפארק או המיקום (רק לטריגר מבוסס מיקום)',
      example: 'אימון חדש ב-@שם_הפארק מחכה לך!',
    },
    {
      tag: '@שם_המתקן',
      description: 'שם המתקן (רק לטריגר מבוסס מיקום)',
      example: 'המתקן @שם_המתקן זמין עכשיו',
    },
  ];
  
  const workoutTags = [
    {
      tag: '@שם_תרגיל',
      description: 'שם התרגיל המומלץ',
      example: 'נסה את @שם_תרגיל היום!',
    },
    {
      tag: '@קטגוריה',
      description: 'קטגוריית האימון',
      example: 'אימון @קטגוריה מושלם לך',
    },
    {
      tag: '@שרירים',
      description: 'קבוצות השרירים העיקריות',
      example: 'מתמקד ב-@שרירים',
    },
    {
      tag: '@מטרה',
      description: 'מטרת האימון',
      example: 'זמן ל-@מטרה!',
    },
  ];
  
  let tags = [...commonTags];
  
  if (triggerType === 'Inactivity') {
    tags = [...tags, ...inactivityTags];
  }
  
  if (triggerType === 'Location_Based') {
    tags = [...tags, ...locationTags];
  }
  
  if (triggerType === 'Scheduled' || triggerType === 'Habit_Maintenance') {
    tags = [...tags, ...workoutTags];
  }
  
  return tags;
}

/**
 * Resolve @tags in workout description text
 * Specifically designed for workout descriptions with user context
 */
export function resolveDescription(
  template: string,
  context: TagResolverContext
): string {
  if (!template) return '';
  
  let resolved = template;
  
  // User name tag (@שם) - supports profile.core.name format
  resolved = resolved.replace(/@שם/g, () => {
    // Priority: userProfile.core.name > userName > fallback
    if (context.userProfile?.core?.name) {
      const firstName = getUserFirstName(context.userProfile);
      return firstName;
    }
    if (context.userName) {
      // If userName contains a space, take first name only
      const firstName = context.userName.split(' ')[0];
      return firstName || 'משתמש';
    }
    return 'משתמש';
  });
  
  // Goal tag (@מטרה) - ensure Hebrew goal names
  resolved = resolved.replace(/@מטרה/g, () => {
    // Priority: userProfile.core.mainGoal > userGoal > goal > fallback
    if (context.userProfile?.core?.mainGoal) {
      return getUserGoalHebrew(context.userProfile);
    }
    const goal = context.userGoal || context.goal;
    if (!goal) return 'אימון';
    
    // Map English goal values to Hebrew if needed
    const goalMap: Record<string, string> = {
      'healthy_lifestyle': 'אורח חיים בריא',
      'performance_boost': 'שיפור ביצועים',
      'weight_loss': 'ירידה במשקל',
      'skill_mastery': 'שליטה במיומנויות',
      'אורח חיים בריא': 'אורח חיים בריא',
      'שיפור ביצועים': 'שיפור ביצועים',
      'ירידה במשקל': 'ירידה במשקל',
      'שליטה במיומנויות': 'שליטה במיומנויות',
    };
    
    return goalMap[goal] || goal;
  });
  
  // Gender-sensitive tags (same as in resolveNotificationText)
  const userGender = context.userGender || 'other';
  const isFemale = userGender === 'female';
  const isMale = userGender === 'male';
  
  resolved = resolved.replace(/@את\/ה/g, () => {
    if (isFemale) return 'את';
    if (isMale) return 'אתה';
    return 'את/ה';
  });
  
  resolved = resolved.replace(/@מוכן\/ה/g, () => {
    if (isFemale) return 'מוכנה';
    if (isMale) return 'מוכן';
    return 'מוכן/ה';
  });
  
  resolved = resolved.replace(/@בוא\/י/g, () => {
    if (isFemale) return 'בואי';
    if (isMale) return 'בוא';
    return 'בוא/י';
  });
  
  resolved = resolved.replace(/@תוכל\/י/g, () => {
    if (isFemale) return 'תוכלי';
    if (isMale) return 'תוכל';
    return 'תוכל/י';
  });
  
  resolved = resolved.replace(/@תרצה\/י/g, () => {
    if (isFemale) return 'תרצי';
    if (isMale) return 'תרצה';
    return 'תרצה/י';
  });
  
  // Muscle tag (@שריר)
  resolved = resolved.replace(/@שריר/g, () => {
    if (context.muscles && context.muscles.length > 0) {
      const muscleLabels: Record<string, string> = {
        chest: 'חזה',
        back: 'גב',
        shoulders: 'כתפיים',
        abs: 'בטן',
        obliques: 'אלכסונים',
        forearms: 'אמה',
        biceps: 'דו ראשי',
        triceps: 'שלוש ראשי',
        quads: 'ארבע ראשי',
        hamstrings: 'מיתר ברך',
        glutes: 'ישבן',
        calves: 'שוקיים',
        traps: 'טרפז',
        cardio: 'קרדיו',
        full_body: 'כל הגוף',
        core: 'ליבה',
        legs: 'רגליים',
      };
      const primaryMuscle = context.muscles[0];
      return muscleLabels[primaryMuscle] || primaryMuscle || 'השרירים';
    }
    return 'השרירים';
  });
  
  // Location tag (@מיקום)
  const locationLabels: Record<string, string> = {
    home: 'בית',
    park: 'פארק',
    office: 'משרד',
    street: 'רחוב',
    gym: 'מכון כושר',
    school: 'בית ספר',
    airport: 'שדה תעופה',
    library: 'ספרייה',
  };
  
  resolved = resolved.replace(/@מיקום/g, () => {
    if (context.location && locationLabels[context.location]) {
      return locationLabels[context.location];
    }
    if (context.locationName) {
      return context.locationName;
    }
    return 'המיקום';
  });
  
  // Equipment tag (@ציוד)
  resolved = resolved.replace(/@ציוד/g, () => {
    if (context.equipment && context.equipment.length > 0) {
      return context.equipment.slice(0, 2).join(' ו-');
    }
    return 'ציוד מינימלי';
  });

  // === Golden Content tags ===

  // @ספורט — user's sport type
  const sportLabels: Record<string, string> = {
    // כוח ותנועה
    calisthenics: 'קליסתניקס',
    crossfit: 'קרוספיט',
    functional: 'פונקציונלי',
    movement: 'תנועה',
    // אירובי וסיבולת
    running: 'ריצה',
    walking: 'הליכה',
    cycling: 'רכיבה',
    swimming: 'שחייה',
    // משחקי כדור
    basketball: 'כדורסל',
    soccer: 'כדורגל',
    tennis: 'טניס',
    padel: 'פאדל',
    // גוף-נפש
    yoga: 'יוגה',
    pilates: 'פילאטיס',
    flexibility: 'גמישות',
    // אתגרי
    climbing: 'טיפוס',
    skate_roller: 'סקייט / רולר',
    martial_arts: 'אמנויות לחימה',
    general: 'אימון',
  };

  resolved = resolved.replace(/@ספורט/g, () => {
    if (context.sportType && sportLabels[context.sportType]) {
      return sportLabels[context.sportType];
    }
    return context.sportType || 'אימון';
  });

  // @רמה — user's experience level
  const levelLabels: Record<string, string> = {
    beginner: 'מתחיל',
    intermediate: 'בינוני',
    advanced: 'מתקדם',
    pro: 'מקצועי',
  };

  resolved = resolved.replace(/@רמה/g, () => {
    if (context.experienceLevel && levelLabels[context.experienceLevel]) {
      return levelLabels[context.experienceLevel];
    }
    return context.experienceLevel || 'כל הרמות';
  });

  // @מגדר — dynamic grammar helper (זכר/נקבה text)
  resolved = resolved.replace(/@מגדר/g, () => {
    if (isFemale) return 'נקבה';
    if (isMale) return 'זכר';
    return 'כללי';
  });

  // === Progress & Level-Up tags ===

  // @שם_תוכנית — current program name
  const programLabels: Record<string, string> = {
    pulling: 'משיכה',
    pushing: 'דחיפה',
    core: 'ליבה',
    legs: 'רגליים',
    upper_body: 'פלג עליון',
    lower_body: 'פלג תחתון',
    full_body: 'גוף מלא',
    handstand: 'עמידת ידיים',
    skills: 'סקילס',
  };

  resolved = resolved.replace(/@שם_תוכנית/g, () => {
    if (context.currentProgram && programLabels[context.currentProgram]) {
      return programLabels[context.currentProgram];
    }
    return context.currentProgram || 'התוכנית';
  });

  // @אחוז_התקדמות — progress percentage
  resolved = resolved.replace(/@אחוז_התקדמות/g, () => {
    if (context.programProgress !== undefined && context.programProgress !== null) {
      return `${Math.round(context.programProgress)}%`;
    }
    return '0%';
  });

  // @רמה_הבאה — target level
  resolved = resolved.replace(/@רמה_הבאה/g, () => {
    if (context.targetLevel !== undefined && context.targetLevel !== null) {
      return `רמה ${context.targetLevel}`;
    }
    return 'הרמה הבאה';
  });

  // === Proximity tags ===

  // @מרחק — distance to park/facility
  resolved = resolved.replace(/@מרחק/g, () => {
    if (context.distanceMeters !== undefined && context.distanceMeters !== null) {
      if (context.distanceMeters < 1000) {
        return `${context.distanceMeters} מטר`;
      }
      return `${(context.distanceMeters / 1000).toFixed(1)} ק"מ`;
    }
    return 'קרוב';
  });

  // @זמן_הגעה — estimated arrival time
  resolved = resolved.replace(/@זמן_הגעה/g, () => {
    if (context.estimatedArrivalMinutes !== undefined && context.estimatedArrivalMinutes !== null) {
      if (context.estimatedArrivalMinutes < 1) {
        return 'פחות מדקה';
      }
      return `${Math.round(context.estimatedArrivalMinutes)} דקות הליכה`;
    }
    return 'קצר';
  });

  // === Workout Analysis Tags ===

  // @זמן_אימון — workout duration in minutes
  resolved = resolved.replace(/@זמן_אימון/g, () => {
    if (context.durationMinutes !== undefined && context.durationMinutes !== null) {
      return `${Math.round(context.durationMinutes)}`;
    }
    return '10';
  });

  // @עצימות — difficulty level mapped to Hebrew
  const difficultyLabels: Record<number | string, string> = {
    1: 'קליל',
    2: 'מאתגר',
    3: 'שורף',
    easy: 'קליל',
    medium: 'מאתגר',
    hard: 'שורף',
  };

  resolved = resolved.replace(/@עצימות/g, () => {
    if (context.difficulty !== undefined && context.difficulty !== null && difficultyLabels[context.difficulty]) {
      return difficultyLabels[context.difficulty];
    }
    return 'מאתגר';
  });

  // @מיקוד — dominant muscle focus (>50% of exercises)
  const muscleLabelsHe: Record<string, string> = {
    glutes: 'עכוז',
    abs: 'בטן',
    core: 'ליבה',
    biceps: 'ביצפס',
    triceps: 'טרייצפס',
    legs: 'רגליים',
    quads: 'ירכיים קדמיות',
    hamstrings: 'ירכיים אחוריות',
    calves: 'שוקיים',
    chest: 'חזה',
    back: 'גב',
    lats: 'גב רחב',
    shoulders: 'כתפיים',
    forearms: 'אמות',
    hip_flexors: 'כופפי ירך',
    full_body: 'גוף מלא',
  };

  resolved = resolved.replace(/@מיקוד/g, () => {
    if (context.dominantMuscle && muscleLabelsHe[context.dominantMuscle]) {
      return muscleLabelsHe[context.dominantMuscle];
    }
    if (context.muscles && context.muscles.length > 0) {
      const primary = context.muscles[0];
      return muscleLabelsHe[primary] || primary;
    }
    return 'גוף מלא';
  });

  // @קטגוריה — workout category display name
  resolved = resolved.replace(/@קטגוריה/g, () => {
    if (context.categoryLabel) {
      return context.categoryLabel;
    }
    if (context.category) {
      const catLabels: Record<string, string> = {
        strength: 'כוח',
        volume: 'נפח',
        endurance: 'סיבולת',
        skills: 'סקילס',
        mobility: 'ניידות',
        hiit: 'HIIT',
        general: 'כללי',
        maintenance: 'תחזוקת גוף',
      };
      return catLabels[context.category] || context.category;
    }
    return 'אימון';
  });
  
  // ── Level Goal Tags ────────────────────────────────────────────────

  // @תרגיל_יעד — target exercise name for current level
  resolved = resolved.replace(/@תרגיל_יעד/g, () => {
    return context.targetExerciseName || 'תרגיל יעד';
  });

  // @ערך_יעד — target value with unit (e.g., "10 חזרות")
  resolved = resolved.replace(/@ערך_יעד/g, () => {
    return context.targetValue || '0';
  });

  // @אחוז_התקדמות_רמה — progress toward next level (0-100%)
  // Note: @אחוז_התקדמות already exists for program progress.
  // This is specifically for level XP progress.
  resolved = resolved.replace(/@אחוז_התקדמות_רמה/g, () => {
    if (context.goalProgressPercent !== undefined && context.goalProgressPercent !== null) {
      return `${Math.round(context.goalProgressPercent)}%`;
    }
    return '0%';
  });

  // Also support the notification tags for consistency
  resolved = resolveNotificationText(resolved, context);
  
  return resolved;
}

// ============================================================================
// UNIFIED TAG RESOLVER — works for Titles, Descriptions, Notifications, Phrases
// ============================================================================

/**
 * Unified content tag resolver.
 *
 * Resolves @tags in any user-facing text regardless of content type
 * (titles, descriptions, motivational phrases, notifications).
 *
 * Internally delegates to the existing resolvers in the correct order
 * (resolveDescription first → resolveNotificationText as fallback),
 * so all tags are covered without duplication.
 *
 * @param text     Raw text with @tags (e.g., "אימון @קטגוריה ל@פרסונה ב@מיקום")
 * @param context  Tag resolution context
 * @returns        Fully resolved text
 */
export function resolveContentTags(
  text: string,
  context: TagResolverContext,
): string {
  if (!text) return '';
  // resolveDescription already chains to resolveNotificationText at the end,
  // giving us full coverage of every @tag in a single call.
  return resolveDescription(text, context);
}

/**
 * Get available tags for any content type (unified).
 * Returns the FULL set of tags available across all content types.
 */
export function getAvailableContentTags(): Array<{
  tag: string;
  description: string;
  example: string;
}> {
  // Start with description tags (broadest set), then add notification-only tags
  const descriptionTags = getAvailableDescriptionTags();
  const notificationOnlyTags = [
    {
      tag: '@ימי_אי_פעילות',
      description: 'מספר הימים ללא אימון (רק בהתראות אי-פעילות)',
      example: 'כבר @ימי_אי_פעילות ימים שלא ראינו אותך',
    },
    {
      tag: '@שם_הפארק',
      description: 'שם הפארק (רק בהתראות מבוססות מיקום)',
      example: 'אימון חדש ב-@שם_הפארק מחכה לך!',
    },
    {
      tag: '@שם_המתקן',
      description: 'שם המתקן (רק בהתראות מבוססות מיקום)',
      example: 'המתקן @שם_המתקן זמין עכשיו',
    },
    {
      tag: '@שעה',
      description: 'השעה הנוכחית (HH:MM)',
      example: 'השעה @שעה, זמן טוב ל-@מטרה',
    },
    {
      tag: '@זמן_יום',
      description: 'זמן היום (בוקר, צהריים, ערב)',
      example: '@זמן_יום טוב!',
    },
    {
      tag: '@שרירים',
      description: 'קבוצות שרירים עיקריות (רבים)',
      example: 'מתמקד ב-@שרירים',
    },
  ];

  // Merge, avoiding duplicates by tag name
  const existing = new Set(descriptionTags.map(t => t.tag));
  const merged = [...descriptionTags];
  for (const t of notificationOnlyTags) {
    if (!existing.has(t.tag)) merged.push(t);
  }
  return merged;
}

/**
 * Get available tags for workout descriptions
 */
export function getAvailableDescriptionTags(): Array<{
  tag: string;
  description: string;
  example: string;
}> {
  return [
    {
      tag: '@שם',
      description: 'שם המשתמש (שם פרטי)',
      example: '@שם, בוא נתחיל!',
    },
    {
      tag: '@מטרה',
      description: 'מטרת האימון של המשתמש',
      example: 'אימון מושלם ל-@מטרה',
    },
    {
      tag: '@שריר',
      description: 'השריר העיקרי של התרגיל',
      example: 'מתמקד ב-@שריר',
    },
    {
      tag: '@מיקום',
      description: 'מיקום האימון (בית, פארק, וכו\')',
      example: 'אימון מושלם ב-@מיקום',
    },
    {
      tag: '@ציוד',
      description: 'הציוד הנדרש לתרגיל',
      example: 'דורש רק @ציוד',
    },
    {
      tag: '@שם_תרגיל',
      description: 'שם התרגיל המומלץ',
      example: 'נסה את @שם_תרגיל היום!',
    },
    {
      tag: '@קטגוריה',
      description: 'קטגוריית האימון',
      example: 'אימון @קטגוריה מושלם לך',
    },
    {
      tag: '@את/ה',
      description: 'את (נקבה) / אתה (זכר)',
      example: '@את/ה מוכן/ה להתחיל?',
    },
    {
      tag: '@מוכן/ה',
      description: 'מוכנה (נקבה) / מוכן (זכר)',
      example: '@את/ה @מוכן/ה להתחיל?',
    },
    {
      tag: '@בוא/י',
      description: 'בואי (נקבה) / בוא (זכר)',
      example: '@בוא/י נתחיל!',
    },
    {
      tag: '@תוכל/י',
      description: 'תוכלי (נקבה) / תוכל (זכר)',
      example: '@תוכל/י להתחיל עכשיו',
    },
    {
      tag: '@תרצה/י',
      description: 'תרצי (נקבה) / תרצה (זכר)',
      example: '@תרצה/י להתחיל?',
    },
    {
      tag: '@ספורט',
      description: 'סוג הספורט של המשתמש (קליסתניקס, ריצה, כדורסל...)',
      example: 'אימון @ספורט ברמה גבוהה',
    },
    {
      tag: '@רמה',
      description: 'רמת הניסיון של המשתמש (מתחיל, בינוני, מתקדם, מקצועי)',
      example: 'מותאם לרמת @רמה',
    },
    {
      tag: '@מגדר',
      description: 'מגדר דינמי (זכר / נקבה / כללי)',
      example: 'תוכן מותאם ל-@מגדר',
    },
    {
      tag: '@שם_תוכנית',
      description: 'שם התוכנית הנוכחית (משיכה, דחיפה, ליבה, רגליים)',
      example: 'התקדמות מצוינת ב@שם_תוכנית!',
    },
    {
      tag: '@אחוז_התקדמות',
      description: 'אחוז ההתקדמות בתוכנית (0-100%)',
      example: '@את/ה ב-@אחוז_התקדמות - כמעט שם!',
    },
    {
      tag: '@רמה_הבאה',
      description: 'הרמה הבאה שאליה המשתמש מתקדם',
      example: 'עוד קצת ו@את/ה מגיע/ה ל-@רמה_הבאה',
    },
    {
      tag: '@מרחק',
      description: 'מרחק לפארק/מתקן (רק בהתראות Proximity)',
      example: '@את/ה במרחק @מרחק מהפארק',
    },
    {
      tag: '@זמן_הגעה',
      description: 'זמן הגעה משוער (רק בהתראות Proximity)',
      example: '@זמן_הגעה מפרידים אותך מאימון מושלם',
    },
    {
      tag: '@זמן_אימון',
      description: 'משך האימון בדקות (מספר)',
      example: 'אימון של @זמן_אימון דקות',
    },
    {
      tag: '@עצימות',
      description: 'רמת עצימות (קליל / מאתגר / שורף)',
      example: 'אימון @עצימות שמתאים ל@פרסונה',
    },
    {
      tag: '@מיקוד',
      description: 'שריר דומיננטי באימון (>50% מהתרגילים)',
      example: 'מיקוד ב@מיקוד — אימון ממוקד',
    },
    {
      tag: '@קטגוריה',
      description: 'שם קטגוריית האימון (כוח / סיבולת / ניידות / תחזוקת גוף)',
      example: 'אימון @קטגוריה ל@פרסונה',
    },
    // ── Level Goal Tags ──
    {
      tag: '@תרגיל_יעד',
      description: 'שם התרגיל היעד עבור הרמה הנוכחית',
      example: 'התרגיל שלך היום: @תרגיל_יעד',
    },
    {
      tag: '@ערך_יעד',
      description: 'ערך היעד כולל יחידה (חזרות או שניות)',
      example: 'נסה להגיע ל-@ערך_יעד',
    },
    {
      tag: '@אחוז_התקדמות_רמה',
      description: 'אחוז ההתקדמות לקראת הרמה הבאה',
      example: '@את/ה ב-@אחוז_התקדמות_רמה עד לרמה הבאה',
    },
  ];
}
