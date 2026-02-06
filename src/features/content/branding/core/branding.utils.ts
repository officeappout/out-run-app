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
    office_worker: 'עובד משרד',
    remote_worker: 'עובד מהבית',
    athlete: 'ספורטאי',
    senior: 'גיל הזהב',
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
  
  // Also support the notification tags for consistency
  resolved = resolveNotificationText(resolved, context);
  
  return resolved;
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
  ];
}
