/**
 * User Lifestyles / Personas
 * 
 * Shared constants for lifestyle tags used across:
 * - User profile settings
 * - Smart message targeting
 * - Workout contextual filtering
 * - Admin panels
 */

export interface UserLifestyle {
  id: string;
  label: string;
  icon: string;
  description?: string;
}

/**
 * All available user lifestyle tags
 * Icons use Material Icons names
 */
export const USER_LIFESTYLES = [
  { id: 'student', label: 'סטודנט', icon: 'school', description: 'לומד באוניברסיטה או מכללה' },
  { id: 'parent', label: 'הורה', icon: 'family_restroom', description: 'הורה לילדים' },
  { id: 'wfh', label: 'עובד מהבית', icon: 'home_work', description: 'עובד מרחוק מהבית' },
  { id: 'office', label: 'עובד משרד', icon: 'corporate_fare', description: 'עובד במשרד' },
  { id: 'senior', label: 'גיל הזהב', icon: 'elderly', description: 'גיל 60+' },
  { id: 'athlete', label: 'ספורטאי', icon: 'fitness_center', description: 'מתאמן באופן קבוע' },
  { id: 'general', label: 'כללי (לכולם)', icon: 'public', description: 'מתאים לכל סוגי המשתמשים' },
] as const;

/**
 * Lifestyle IDs as a type
 */
export type LifestyleId = typeof USER_LIFESTYLES[number]['id'];

/**
 * Map of lifestyle ID to label (Hebrew)
 */
export const LIFESTYLE_LABELS: Record<string, string> = Object.fromEntries(
  USER_LIFESTYLES.map(l => [l.id, l.label])
);

/**
 * Map of lifestyle ID to icon
 */
export const LIFESTYLE_ICONS: Record<string, string> = Object.fromEntries(
  USER_LIFESTYLES.map(l => [l.id, l.icon])
);

/**
 * Get lifestyle by ID
 */
export function getLifestyleById(id: string): UserLifestyle | undefined {
  return USER_LIFESTYLES.find(l => l.id === id);
}

/**
 * Get lifestyle label by ID
 */
export function getLifestyleLabel(id: string): string {
  return LIFESTYLE_LABELS[id] || id;
}

/**
 * Check if a lifestyle ID is valid
 */
export function isValidLifestyleId(id: string): id is LifestyleId {
  return USER_LIFESTYLES.some(l => l.id === id);
}

// ============================================================================
// DYNAMIC TEXT VARIABLES
// ============================================================================

/**
 * Supported dynamic variables in message text
 */
export const MESSAGE_VARIABLES = [
  { 
    key: '{name}', 
    label: 'שם המשתמש',
    example: 'דוד',
    description: 'יוחלף בשם התצוגה של המשתמש',
  },
  { 
    key: '{streak}', 
    label: 'ימי רצף',
    example: '5',
    description: 'יוחלף במספר הימים ברצף',
  },
  { 
    key: '{level}', 
    label: 'רמה',
    example: '7',
    description: 'יוחלף ברמת המשתמש הנוכחית',
  },
  { 
    key: '{program}', 
    label: 'תוכנית',
    example: 'פלג גוף עליון',
    description: 'יוחלף בשם התוכנית הפעילה',
  },
] as const;

export type MessageVariableKey = typeof MESSAGE_VARIABLES[number]['key'];

/**
 * Replace dynamic variables in message text
 * 
 * @example
 * replaceMessageVariables(
 *   "כל הכבוד {name}, כבר {streak} ימים ברצף!",
 *   { name: "דוד", streak: 5 }
 * )
 * // Returns: "כל הכבוד דוד, כבר 5 ימים ברצף!"
 */
export function replaceMessageVariables(
  text: string,
  variables: {
    name?: string;
    streak?: number;
    level?: number;
    program?: string;
  }
): string {
  let result = text;
  
  if (variables.name) {
    result = result.replace(/\{name\}/g, variables.name);
  }
  
  if (variables.streak !== undefined) {
    result = result.replace(/\{streak\}/g, String(variables.streak));
  }
  
  if (variables.level !== undefined) {
    result = result.replace(/\{level\}/g, String(variables.level));
  }
  
  if (variables.program) {
    result = result.replace(/\{program\}/g, variables.program);
  }
  
  return result;
}
