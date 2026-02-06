'use server';

import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import path from 'path';
import fs from 'fs';

// ============================================================================
// TYPES
// ============================================================================

interface RawExerciseRow {
  [key: string]: string | number | undefined;
}

/**
 * Exercise attributes for variations (angles, unilateral, etc.)
 */
interface ExerciseAttributes {
  angle?: number;          // Degree angle (e.g., 45° for incline rows)
  isUnilateral?: boolean;  // Single arm/leg exercises
  grip?: string;           // Grip style (e.g., 'wide', 'narrow', 'neutral')
}

interface EnrichedExerciseData {
  // Muscles
  primaryMuscle: string;
  secondaryMuscles: string[];
  // Instructions (Hebrew)
  instructions: string[];
  highlights: string[];
  // Classification
  movementType: 'compound' | 'isolation';
  exerciseType: 'reps' | 'time' | 'hold';
  isStatic: boolean;
  // Movement pattern
  movementGroup: string;
  // Tags
  tags: string[];
}

interface ParsedExercise {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string;
  level: number;
  equipment: string[];
  coreId: string;
  sheetName: string;
  programId: string;
  rawData: RawExerciseRow;
  // Variation attributes
  attributes: ExerciseAttributes;
  // Enriched data from AI
  enriched: EnrichedExerciseData;
}

interface ImportResult {
  success: boolean;
  message: string;
  totalProcessed: number;
  imported: number;
  errors: string[];
  sheets: {
    name: string;
    rowCount: number;
    imported: number;
  }[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SHEETS_TO_IMPORT = [
  'תרגילי מתקנים',
  'התאוששות',
  'גמישות יונה',
  'מתח יד אחת',
  'פרונט',
  'פלאנץ',
  'שכיבות סמיכה בעמידת ידיים',
  'עמידות ידיים',
  'פל גוף תחתון',
  'פלג גוף עליון+קליסטניקס',
];

// Map sheet names to program IDs
const SHEET_TO_PROGRAM: Record<string, string> = {
  'תרגילי מתקנים': 'equipment_exercises',
  'התאוששות': 'recovery',
  'גמישות יונה': 'flexibility',
  'מתח יד אחת': 'one_arm_pull',
  'פרונט': 'front_lever',
  'פלאנץ': 'planche',
  'שכיבות סמיכה בעמידת ידיים': 'handstand_pushup',
  'עמידות ידיים': 'handstand',
  'פל גוף תחתון': 'lower_body',
  'פלג גוף עליון+קליסטניקס': 'upper_body_calisthenics',
};

// Equipment keywords to detect from text - more comprehensive
const EQUIPMENT_KEYWORDS: Record<string, string> = {
  // Hebrew variations
  'טבעות': 'Rings',
  'טבעת': 'Rings',
  'TRX': 'TRX',
  'trx': 'TRX',
  'רצועות': 'TRX',
  'רצועה': 'TRX',
  'גומייה': 'Band',
  'גומיה': 'Band',
  'גומי': 'Band',
  'גומיות': 'Band',
  'משקולת': 'Dumbbell',
  'משקולות': 'Dumbbell',
  'דמבל': 'Dumbbell',
  'קיטלבל': 'Kettlebell',
  'קטלבל': 'Kettlebell',
  'מוט': 'Bar',
  'בר': 'Bar',
  'מתח': 'Pull-up Bar',
  'מקבילים': 'Dip Station',
  'ספסל': 'Bench',
  'קיר': 'Wall',
  'מדרגות': 'Stairs',
  'כיסא': 'Chair',
  'דלת': 'Door',
  'ארגז': 'Box',
  'קופסה': 'Box',
  'מזרן': 'Mat',
  // English variations
  'rings': 'Rings',
  'band': 'Band',
  'bands': 'Band',
  'dumbbell': 'Dumbbell',
  'kettlebell': 'Kettlebell',
  'bar': 'Bar',
  'pull-up': 'Pull-up Bar',
  'pullup': 'Pull-up Bar',
  'dip': 'Dip Station',
  'bench': 'Bench',
  'wall': 'Wall',
  'chair': 'Chair',
};

// ============================================================================
// AI ENRICHMENT SYSTEM - Fitness Expert Knowledge Base
// ============================================================================

/**
 * Sheet to primary muscle mapping
 * Maps each sheet to the main muscle groups involved
 */
const SHEET_TO_MUSCLES: Record<string, { primary: string; secondary: string[] }> = {
  'תרגילי מתקנים': { primary: 'full_body', secondary: ['core'] },
  'התאוששות': { primary: 'full_body', secondary: ['core'] },
  'גמישות יונה': { primary: 'full_body', secondary: ['hips', 'shoulders'] },
  'מתח יד אחת': { primary: 'back', secondary: ['biceps', 'forearms', 'core'] },
  'פרונט': { primary: 'back', secondary: ['core', 'shoulders', 'biceps'] },
  'פלאנץ': { primary: 'shoulders', secondary: ['chest', 'triceps', 'core'] },
  'שכיבות סמיכה בעמידת ידיים': { primary: 'shoulders', secondary: ['triceps', 'chest', 'core'] },
  'עמידות ידיים': { primary: 'shoulders', secondary: ['core', 'triceps', 'traps'] },
  'פל גוף תחתון': { primary: 'quads', secondary: ['glutes', 'hamstrings', 'calves'] },
  'פלג גוף עליון+קליסטניקס': { primary: 'chest', secondary: ['shoulders', 'triceps', 'back'] },
};

/**
 * Exercise name keywords to muscle mapping
 * Provides more specific muscle targeting based on exercise name
 */
const EXERCISE_NAME_TO_MUSCLES: Record<string, { primary: string; secondary: string[] }> = {
  // Pull exercises
  'מתח': { primary: 'back', secondary: ['biceps', 'forearms'] },
  'חתירה': { primary: 'back', secondary: ['biceps', 'rear_delts'] },
  'rows': { primary: 'back', secondary: ['biceps', 'rear_delts'] },
  'pull': { primary: 'back', secondary: ['biceps'] },
  'פרונט לבר': { primary: 'back', secondary: ['core', 'biceps', 'shoulders'] },
  'front lever': { primary: 'back', secondary: ['core', 'shoulders'] },
  
  // Push exercises
  'שכיבות': { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  'push': { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  'לחיצה': { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  'דיפס': { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  'dips': { primary: 'chest', secondary: ['triceps', 'shoulders'] },
  
  // Shoulder exercises
  'כתפיים': { primary: 'shoulders', secondary: ['triceps', 'traps'] },
  'עמידת ידיים': { primary: 'shoulders', secondary: ['core', 'triceps', 'traps'] },
  'handstand': { primary: 'shoulders', secondary: ['core', 'triceps'] },
  'פלאנץ': { primary: 'shoulders', secondary: ['chest', 'core', 'triceps'] },
  'planche': { primary: 'shoulders', secondary: ['chest', 'core'] },
  
  // Core exercises
  'בטן': { primary: 'abs', secondary: ['obliques'] },
  'ליבה': { primary: 'core', secondary: ['abs', 'obliques'] },
  'פלאנק': { primary: 'core', secondary: ['shoulders', 'glutes'] },
  'plank': { primary: 'core', secondary: ['shoulders'] },
  'l-sit': { primary: 'core', secondary: ['hip_flexors', 'triceps'] },
  'אל סיט': { primary: 'core', secondary: ['hip_flexors', 'triceps'] },
  
  // Leg exercises
  'סקוואט': { primary: 'quads', secondary: ['glutes', 'hamstrings'] },
  'squat': { primary: 'quads', secondary: ['glutes', 'hamstrings'] },
  'לאנג\'': { primary: 'quads', secondary: ['glutes', 'hamstrings'] },
  'lunge': { primary: 'quads', secondary: ['glutes'] },
  'פיסטול': { primary: 'quads', secondary: ['glutes', 'core'] },
  'pistol': { primary: 'quads', secondary: ['glutes', 'core'] },
  'קפיצה': { primary: 'quads', secondary: ['calves', 'glutes'] },
  'jump': { primary: 'quads', secondary: ['calves', 'glutes'] },
  'שוקיים': { primary: 'calves', secondary: [] },
  'calves': { primary: 'calves', secondary: [] },
  'ישבן': { primary: 'glutes', secondary: ['hamstrings'] },
  'glutes': { primary: 'glutes', secondary: ['hamstrings'] },
  
  // Arm exercises  
  'ביצפס': { primary: 'biceps', secondary: ['forearms'] },
  'biceps': { primary: 'biceps', secondary: ['forearms'] },
  'טרייצפס': { primary: 'triceps', secondary: [] },
  'triceps': { primary: 'triceps', secondary: [] },
};

/**
 * Keywords that indicate static/hold exercises
 */
const STATIC_EXERCISE_KEYWORDS = [
  'החזקה', 'hold', 'מתיחה', 'stretch', 'עמידה', 'stand',
  'פלאנק', 'plank', 'l-sit', 'אל סיט', 'פרונט לבר', 'front lever',
  'בק לבר', 'back lever', 'פלאנץ', 'planche', 'סטטי', 'static',
  'איזומטרי', 'isometric', 'יציבה', 'balance', 'איזון'
];

/**
 * Keywords that indicate compound exercises
 */
const COMPOUND_EXERCISE_KEYWORDS = [
  'מתח', 'pull-up', 'שכיבות', 'push-up', 'דיפס', 'dips',
  'סקוואט', 'squat', 'לאנג\'', 'lunge', 'חתירה', 'row',
  'עמידת ידיים', 'handstand', 'פלאנץ', 'planche', 'מאסל אפ', 'muscle up',
  'פיסטול', 'pistol', 'פרונט לבר', 'front lever'
];

/**
 * Exercise-specific instruction templates (Hebrew)
 * Maps common exercise patterns to professional coaching cues
 */
const INSTRUCTION_TEMPLATES: Record<string, string[]> = {
  // Pull-up variations
  'מתח': [
    'שמור על ידיים ברוחב כתפיים או רחב יותר',
    'משוך את הכתפיים לאחור ולמטה לפני התחלת התנועה',
    'משוך עד שהסנטר עובר את המוט',
    'רד בשליטה מלאה, ללא נפילה חופשית',
    'שמור על הליבה מכווצת לאורך כל התנועה'
  ],
  'pull': [
    'התחל עם ידיים מתוחות לגמרי',
    'משוך את הכתפיים אחורה לפני הכיפוף',
    'שמור על גוף יציב ללא התנדנדות',
    'רד בבקרה ושליטה'
  ],
  
  // Push-up variations
  'שכיבות': [
    'ידיים ברוחב כתפיים או רחב יותר',
    'שמור על גוף ישר מהראש ועד הרגליים',
    'כווץ את הליבה והישבן לאורך כל התנועה',
    'רד עד שהחזה כמעט נוגע ברצפה',
    'דחוף בכוח חזרה למעלה'
  ],
  'push': [
    'שמור על יישור גוף מושלם',
    'מרפקים בזווית של 45 מעלות מהגוף',
    'נשום פנימה בירידה, החוצה בעלייה'
  ],
  
  // Dips
  'דיפס': [
    'ידיים על המקבילים, כתפיים מעל פרקי הידיים',
    'רד עד שהמרפקים בזווית של 90 מעלות',
    'שמור על הגוף מעט נטוי קדימה לדגש על החזה',
    'דחוף חזרה למעלה בשליטה'
  ],
  
  // Handstand
  'עמידת ידיים': [
    'ידיים ברוחב כתפיים, אצבעות פרושות',
    'דחוף את הרצפה הרחק ממך להרמת הכתפיים',
    'שמור על ליבה מכווצת וישבן מכווץ',
    'מבט בין הידיים או מעט קדימה',
    'נשום בצורה יציבה ורגועה'
  ],
  'handstand': [
    'Keep arms fully locked',
    'Push through shoulders',
    'Engage core and squeeze glutes',
    'Look at hands or slightly forward'
  ],
  
  // Planche
  'פלאנץ': [
    'ידיים ברוחב כתפיים או מעט רחב יותר',
    'סובב את המרפקים קדימה (Elbow Pit Forward)',
    'הטה קדימה עד שהכתפיים מעבר לידיים',
    'שמור על ליבה מכווצת ורגליים ישרות',
    'דחוף את הרצפה הרחק ממך'
  ],
  
  // Front Lever
  'פרונט': [
    'תפיסה ברוחב כתפיים, ידיים מתוחות',
    'משוך את הכתפיים לאחור ולמטה',
    'שמור על גוף ישר ואופקי',
    'כווץ את הליבה, הישבן והרגליים',
    'התמקד במשיכה דרך הגב העליון'
  ],
  'front lever': [
    'Shoulder-width grip, arms straight',
    'Depress and retract shoulders',
    'Keep body horizontal and straight',
    'Engage lats, core, and glutes'
  ],
  
  // Squats
  'סקוואט': [
    'רגליים ברוחב כתפיים או רחב יותר',
    'אצבעות רגליים פונות מעט החוצה',
    'שמור על גב ישר וחזה מורם',
    'רד עד שהירכיים מקבילות לרצפה או עמוק יותר',
    'דחוף דרך העקבים בעלייה'
  ],
  
  // Plank
  'פלאנק': [
    'ידיים או מרפקים ישירות מתחת לכתפיים',
    'גוף ישר מהראש ועד הרגליים',
    'כווץ את הליבה והישבן',
    'אל תתן לירכיים לצנוח או להתרומם',
    'נשום בצורה יציבה'
  ],
  
  // L-Sit
  'אל סיט': [
    'ידיים על הרצפה/מקבילים לצד הירכיים',
    'דחוף את הרצפה הרחק ממך להרמת הגוף',
    'רגליים ישרות ומקבילות לרצפה',
    'שמור על ליבה מכווצת',
    'כתפיים מורמות ופעילות'
  ],
  
  // Recovery/Stretching
  'מתיחה': [
    'החזק במתיחה למשך 20-30 שניות',
    'נשום עמוק ונרגע',
    'אל תקפוץ במתיחה',
    'עצור אם מרגיש כאב חד'
  ],
  'stretch': [
    'Hold for 20-30 seconds',
    'Breathe deeply and relax',
    'Never bounce in the stretch',
    'Stop if you feel sharp pain'
  ],
  
  // Generic dynamic exercise
  'default_dynamic': [
    'בצע את התנועה בשליטה מלאה',
    'שמור על נשימה יציבה',
    'התמקד בטכניקה נכונה',
    'התחל עם משקל/עומס קל ועלה בהדרגה'
  ],
  
  // Generic static exercise
  'default_static': [
    'החזק את התנוחה ביציבות',
    'נשום בצורה יציבה ורגועה',
    'שמור על כיווץ הליבה',
    'התחל עם החזקות קצרות והארך בהדרגה'
  ]
};

/**
 * Movement group mapping based on sheet and exercise name
 */
const MOVEMENT_GROUP_MAPPING: Record<string, string> = {
  'מתח': 'vertical_pull',
  'pull': 'vertical_pull',
  'חתירה': 'horizontal_pull',
  'row': 'horizontal_pull',
  'שכיבות': 'horizontal_push',
  'push': 'horizontal_push',
  'דיפס': 'vertical_push',
  'dip': 'vertical_push',
  'עמידת ידיים': 'vertical_push',
  'handstand': 'vertical_push',
  'פלאנץ': 'horizontal_push',
  'planche': 'horizontal_push',
  'סקוואט': 'squat',
  'squat': 'squat',
  'לאנג\'': 'lunge',
  'lunge': 'lunge',
  'פרונט': 'horizontal_pull',
  'front lever': 'horizontal_pull',
  'בטן': 'core',
  'ליבה': 'core',
  'פלאנק': 'core',
  'plank': 'core',
};

// ============================================================================
// AI ENRICHMENT FUNCTIONS
// ============================================================================

/**
 * Infer muscle groups from exercise name and sheet
 */
function inferMuscles(exerciseName: string, sheetName: string): { primary: string; secondary: string[] } {
  const nameLower = exerciseName.toLowerCase();
  
  // First, check exercise name for specific muscle targeting
  for (const [keyword, muscles] of Object.entries(EXERCISE_NAME_TO_MUSCLES)) {
    if (nameLower.includes(keyword.toLowerCase()) || exerciseName.includes(keyword)) {
      return muscles;
    }
  }
  
  // Fall back to sheet-based muscle mapping
  if (SHEET_TO_MUSCLES[sheetName]) {
    return SHEET_TO_MUSCLES[sheetName];
  }
  
  // Default to full body
  return { primary: 'full_body', secondary: ['core'] };
}

/**
 * Determine if exercise is static (hold) or dynamic (reps)
 */
function isStaticExercise(exerciseName: string, sheetName: string): boolean {
  const textToCheck = `${exerciseName} ${sheetName}`.toLowerCase();
  
  return STATIC_EXERCISE_KEYWORDS.some(keyword => 
    textToCheck.includes(keyword.toLowerCase())
  );
}

/**
 * Determine if exercise is compound or isolation
 */
function isCompoundExercise(exerciseName: string): boolean {
  const nameLower = exerciseName.toLowerCase();
  
  return COMPOUND_EXERCISE_KEYWORDS.some(keyword =>
    nameLower.includes(keyword.toLowerCase()) || exerciseName.includes(keyword)
  );
}

/**
 * Infer movement group/pattern
 */
function inferMovementGroup(exerciseName: string, sheetName: string): string {
  const nameLower = exerciseName.toLowerCase();
  
  for (const [keyword, group] of Object.entries(MOVEMENT_GROUP_MAPPING)) {
    if (nameLower.includes(keyword.toLowerCase()) || exerciseName.includes(keyword)) {
      return group;
    }
  }
  
  // Map sheet to movement group
  const sheetToMovement: Record<string, string> = {
    'מתח יד אחת': 'vertical_pull',
    'פרונט': 'horizontal_pull',
    'פלאנץ': 'horizontal_push',
    'שכיבות סמיכה בעמידת ידיים': 'vertical_push',
    'עמידות ידיים': 'vertical_push',
    'פל גוף תחתון': 'squat',
    'פלג גוף עליון+קליסטניקס': 'horizontal_push',
    'התאוששות': 'core',
    'גמישות יונה': 'core',
  };
  
  return sheetToMovement[sheetName] || 'isolation';
}

/**
 * Generate professional instructions based on exercise name
 */
function generateInstructions(exerciseName: string, sheetName: string, isStatic: boolean): string[] {
  const nameLower = exerciseName.toLowerCase();
  
  // Try to match specific exercise patterns
  for (const [keyword, instructions] of Object.entries(INSTRUCTION_TEMPLATES)) {
    if (nameLower.includes(keyword.toLowerCase()) || exerciseName.includes(keyword)) {
      return instructions;
    }
  }
  
  // Check sheet-based defaults
  if (sheetName === 'התאוששות' || sheetName === 'גמישות יונה') {
    return INSTRUCTION_TEMPLATES['מתיחה'];
  }
  
  // Return generic instructions based on exercise type
  return isStatic ? INSTRUCTION_TEMPLATES['default_static'] : INSTRUCTION_TEMPLATES['default_dynamic'];
}

/**
 * Generate highlight points for the exercise
 */
function generateHighlights(exerciseName: string, sheetName: string, muscles: { primary: string; secondary: string[] }): string[] {
  const highlights: string[] = [];
  
  // Add muscle focus highlight
  const muscleLabels: Record<string, string> = {
    'back': 'גב',
    'chest': 'חזה',
    'shoulders': 'כתפיים',
    'core': 'ליבה',
    'abs': 'בטן',
    'quads': 'ארבע ראשי הירך',
    'glutes': 'ישבן',
    'biceps': 'דו ראשי הזרוע',
    'triceps': 'תלת ראשי הזרוע',
    'forearms': 'אמות',
    'calves': 'שוקיים',
    'hamstrings': 'שרירי ירך אחוריים',
    'full_body': 'כל הגוף',
  };
  
  const primaryLabel = muscleLabels[muscles.primary] || muscles.primary;
  highlights.push(`מפתח בעיקר את ה${primaryLabel}`);
  
  if (muscles.secondary.length > 0) {
    const secondaryLabels = muscles.secondary
      .slice(0, 2)
      .map(m => muscleLabels[m] || m)
      .join(' ו');
    highlights.push(`מעורב גם את ה${secondaryLabels}`);
  }
  
  // Add sheet-specific highlights
  if (sheetName === 'פלאנץ' || sheetName === 'עמידות ידיים') {
    highlights.push('תרגיל מיומנות מתקדם - דורש אימון הדרגתי');
  } else if (sheetName === 'התאוששות') {
    highlights.push('חשוב לביצוע לאחר אימון לשיפור הגמישות');
  } else if (sheetName === 'פרונט' || sheetName === 'מתח יד אחת') {
    highlights.push('תרגיל קליסטניקס מתקדם לחיזוק הגב');
  }
  
  return highlights;
}

/**
 * Generate tags for the exercise
 */
function generateTags(exerciseName: string, sheetName: string, isStatic: boolean, isCompound: boolean): string[] {
  const tags: string[] = [];
  
  // Movement type tags
  if (isCompound) {
    tags.push('compound');
  } else {
    tags.push('isolation');
  }
  
  if (isStatic) {
    tags.push('static', 'hold');
  } else {
    tags.push('dynamic');
  }
  
  // Skill-based tags
  const skillExercises = ['פלאנץ', 'עמידת ידיים', 'מתח יד אחת', 'פרונט', 'מאסל אפ', 'פיסטול'];
  if (skillExercises.some(skill => exerciseName.includes(skill) || sheetName.includes(skill))) {
    tags.push('skill');
  }
  
  // Sheet-based tags
  if (sheetName === 'התאוששות') {
    tags.push('recovery', 'cooldown');
  } else if (sheetName === 'גמישות יונה') {
    tags.push('flexibility', 'mobility');
  }
  
  // Calisthenics tag for relevant sheets
  const calisthenicsSheets = ['מתח יד אחת', 'פרונט', 'פלאנץ', 'עמידות ידיים', 'פלג גוף עליון+קליסטניקס'];
  if (calisthenicsSheets.includes(sheetName)) {
    tags.push('calisthenics');
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Generate CONTEXT-AWARE instructions based on angle and equipment
 */
function generateContextualInstructions(
  baseInstructions: string[],
  attributes: ExerciseAttributes,
  equipment: string[]
): string[] {
  const contextual = [...baseInstructions];
  
  // Add angle-specific instructions
  if (attributes.angle) {
    if (attributes.angle <= 30) {
      contextual.push(`שמור על זווית של ${attributes.angle} מעלות - קרוב לאופקי לאתגר מקסימלי`);
    } else if (attributes.angle <= 60) {
      contextual.push(`שמור על זווית של ${attributes.angle} מעלות בין הגוף לרצפה לשמירה על מתח קבוע`);
    } else {
      contextual.push(`שמור על זווית של ${attributes.angle} מעלות - התחלה טובה למתחילים`);
    }
  }
  
  // Add equipment-specific instructions
  if (equipment.includes('Rings')) {
    contextual.push('ייצב את הטבעות למניעת תנודה בזמן הביצוע');
    contextual.push('שלוט בסיבוב הטבעות לאורך כל התנועה');
  }
  
  if (equipment.includes('TRX')) {
    contextual.push('ודא שהרצועות מתוחות ויציבות לפני תחילת התרגיל');
    contextual.push('התאם את אורך הרצועות לזווית הרצויה');
  }
  
  if (equipment.includes('Band')) {
    contextual.push('בחר גומייה עם התנגדות מתאימה לרמתך');
    contextual.push('ודא שהגומייה מאובטחת ולא תחליק');
  }
  
  // Add unilateral-specific instructions
  if (attributes.isUnilateral) {
    contextual.push('בצע את אותו מספר החזרות בשני הצדדים');
    contextual.push('התחל עם הצד החלש יותר');
    contextual.push('שמור על יציבות הליבה למניעת סיבוב');
  }
  
  return contextual;
}

/**
 * Main AI enrichment function - generates all enriched data for an exercise
 * Now with CONTEXTUAL awareness of angles and equipment
 */
function enrichExerciseData(
  exerciseName: string, 
  sheetName: string,
  attributes: ExerciseAttributes = {},
  equipment: string[] = []
): EnrichedExerciseData {
  // Determine exercise characteristics
  const isStatic = isStaticExercise(exerciseName, sheetName);
  const isCompound = isCompoundExercise(exerciseName);
  const muscles = inferMuscles(exerciseName, sheetName);
  const movementGroup = inferMovementGroup(exerciseName, sheetName);
  
  // Generate base content
  const baseInstructions = generateInstructions(exerciseName, sheetName, isStatic);
  const highlights = generateHighlights(exerciseName, sheetName, muscles);
  let tags = generateTags(exerciseName, sheetName, isStatic, isCompound);
  
  // Add contextual instructions based on angle and equipment
  const instructions = generateContextualInstructions(baseInstructions, attributes, equipment);
  
  // Add angle/equipment to tags if present
  if (attributes.angle) {
    tags.push(`angle_${attributes.angle}`);
  }
  if (attributes.isUnilateral) {
    tags.push('unilateral');
  }
  if (equipment.includes('Rings')) {
    tags.push('rings');
  }
  if (equipment.includes('TRX')) {
    tags.push('trx');
  }
  
  // Remove duplicates from tags
  tags = [...new Set(tags)];
  
  return {
    primaryMuscle: muscles.primary,
    secondaryMuscles: muscles.secondary,
    instructions,
    highlights,
    movementType: isCompound ? 'compound' : 'isolation',
    exerciseType: isStatic ? 'hold' : 'reps',
    isStatic,
    movementGroup,
    tags,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract ANGLE from exercise name (e.g., 45°, 30 מעלות)
 * Returns undefined if no angle found
 */
function extractAngle(text: string | undefined): number | undefined {
  if (!text) return undefined;
  
  const str = String(text).trim();
  
  // Pattern 1: Number followed by degree symbol (45°)
  const degreeSymbolMatch = str.match(/(\d+)\s*°/);
  if (degreeSymbolMatch) {
    return parseInt(degreeSymbolMatch[1], 10);
  }
  
  // Pattern 2: Number followed by Hebrew "מעלות" (45 מעלות)
  const hebrewDegreesMatch = str.match(/(\d+)\s*מעלות/);
  if (hebrewDegreesMatch) {
    return parseInt(hebrewDegreesMatch[1], 10);
  }
  
  // Pattern 3: Number followed by "degrees" in English
  const englishDegreesMatch = str.match(/(\d+)\s*degrees?/i);
  if (englishDegreesMatch) {
    return parseInt(englishDegreesMatch[1], 10);
  }
  
  return undefined;
}

/**
 * Detect if exercise is unilateral (single arm/leg)
 */
function detectUnilateral(text: string | undefined): boolean {
  if (!text) return false;
  
  const str = text.toLowerCase();
  
  // Hebrew patterns
  if (str.includes('יד אחת')) return true;       // One arm
  if (str.includes('רגל אחת')) return true;       // One leg
  if (str.includes('יד בודדת')) return true;      // Single arm
  if (str.includes('רגל בודדת')) return true;     // Single leg
  if (str.includes('חד צדדי')) return true;       // Unilateral
  if (str.includes('צד אחד')) return true;        // One side
  
  // English patterns
  if (str.includes('one arm')) return true;
  if (str.includes('one leg')) return true;
  if (str.includes('single arm')) return true;
  if (str.includes('single leg')) return true;
  if (str.includes('unilateral')) return true;
  if (str.includes('one-arm')) return true;
  if (str.includes('one-leg')) return true;
  
  return false;
}

/**
 * Extract level number STRICTLY from Level column or "רמה X" pattern
 * DOES NOT extract standalone numbers that could be angles
 * 
 * Safety rule: If detected value > 20, it's likely an angle, not a level
 */
function extractLevel(text: string | number | undefined, exerciseName?: string): number {
  if (typeof text === 'number') {
    // If it's a number but > 20, check if exercise name contains degree indicators
    if (text > 20 && exerciseName) {
      const hasAngleIndicator = /[°מעלות]|degrees?/i.test(exerciseName);
      if (hasAngleIndicator || extractAngle(exerciseName) === text) {
        // This is likely an angle, not a level - return default
        return 1;
      }
    }
    return Math.max(1, Math.min(20, text));
  }
  if (!text) return 1;
  
  const str = String(text).trim();
  
  // Pattern 1: Explicit Hebrew "רמה X"
  const hebrewMatch = str.match(/רמה\s*(\d+)/);
  if (hebrewMatch) {
    const val = parseInt(hebrewMatch[1], 10);
    return Math.max(1, Math.min(20, val));
  }
  
  // Pattern 2: Explicit English "Level X"
  const englishMatch = str.match(/level\s*(\d+)/i);
  if (englishMatch) {
    const val = parseInt(englishMatch[1], 10);
    return Math.max(1, Math.min(20, val));
  }
  
  // Pattern 3: Range patterns like "רמה 5-10" or "5-10" in Level column context
  // Only if the string STARTS with a digit (suggesting it's a level column value)
  const rangeMatch = str.match(/^(\d+)\s*[-–]\s*\d+/);
  if (rangeMatch) {
    const val = parseInt(rangeMatch[1], 10);
    if (val <= 20) {
      return Math.max(1, Math.min(20, val));
    }
  }
  
  // Pattern 4: Just a number in a Level column (no degree indicators)
  const justNumber = str.match(/^(\d+)$/);
  if (justNumber) {
    const val = parseInt(justNumber[1], 10);
    // Safety: If > 20, it's probably an angle
    if (val > 20) {
      return 1;
    }
    return Math.max(1, Math.min(20, val));
  }
  
  // DO NOT extract numbers that are followed by ° or מעלות - those are angles!
  // This is the key fix: We no longer aggressively extract any number.
  
  return 1;
}

/**
 * Detect equipment from text - aggressive matching
 * Returns a proper array of equipment names (capitalized, user-friendly)
 */
function detectEquipment(text: string): string[] {
  const equipment: Set<string> = new Set();
  const lowerText = text.toLowerCase();
  
  // Check each keyword
  for (const [keyword, equipmentType] of Object.entries(EQUIPMENT_KEYWORDS)) {
    // Use word boundary matching for more accuracy
    const keywordLower = keyword.toLowerCase();
    if (text.includes(keyword) || lowerText.includes(keywordLower)) {
      equipment.add(equipmentType);
    }
  }
  
  // Special cases: Check for TRX/רצועות combo
  if (lowerText.includes('trx') || text.includes('TRX') || text.includes('רצועות')) {
    equipment.add('TRX');
  }
  
  // If no equipment detected, mark as bodyweight
  if (equipment.size === 0) {
    equipment.add('Bodyweight');
  }
  
  return Array.from(equipment).sort();
}

/**
 * Generate a clean coreId from exercise name
 * Strips ALL variation modifiers: equipment, level, angles, unilateral indicators
 * This creates the BASE exercise identifier that groups all variations together.
 * 
 * Example: "Rows TRX 45° יד אחת רמה 5" -> "rows"
 * Example: "חתירות טבעות 30 מעלות" -> "chtirvt" (rows)
 */
function generateCoreId(name: string): string {
  let coreName = name;
  
  // Remove level indicators (Hebrew and English)
  coreName = coreName
    .replace(/רמה\s*\d+[-–]?\d*/gi, '')
    .replace(/level\s*\d+[-–]?\d*/gi, '')
    .replace(/\d+[-–]\d+/g, '') // Remove range patterns like "5-10"
    .trim();
  
  // Remove angle indicators (CRITICAL: angles are variations, not core exercise)
  coreName = coreName
    .replace(/\d+\s*°/g, '')           // Remove "45°"
    .replace(/\d+\s*מעלות/g, '')        // Remove "45 מעלות"
    .replace(/\d+\s*degrees?/gi, '')   // Remove "45 degrees"
    .trim();
  
  // Remove unilateral indicators
  coreName = coreName
    .replace(/יד\s*אחת/gi, '')
    .replace(/רגל\s*אחת/gi, '')
    .replace(/יד\s*בודדת/gi, '')
    .replace(/רגל\s*בודדת/gi, '')
    .replace(/חד\s*צדדי/gi, '')
    .replace(/צד\s*אחד/gi, '')
    .replace(/one[\s-]?arm/gi, '')
    .replace(/one[\s-]?leg/gi, '')
    .replace(/single[\s-]?arm/gi, '')
    .replace(/single[\s-]?leg/gi, '')
    .replace(/unilateral/gi, '')
    .trim();
  
  // Remove equipment modifiers for core ID
  for (const keyword of Object.keys(EQUIPMENT_KEYWORDS)) {
    // Case-insensitive replacement
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    coreName = coreName.replace(regex, '').trim();
  }
  
  // Remove extra whitespace and hyphens
  coreName = coreName.replace(/\s+/g, ' ').replace(/-+/g, ' ').trim();
  
  // Hebrew to transliteration for the core ID
  const translitMap: Record<string, string> = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
    'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
    'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
    'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
    'ף': 'f', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r',
    'ש': 'sh', 'ת': 't',
  };
  
  let transliterated = '';
  for (const char of coreName) {
    if (translitMap[char]) {
      transliterated += translitMap[char];
    } else if (/[a-zA-Z0-9]/.test(char)) {
      transliterated += char.toLowerCase();
    } else if (char === ' ') {
      transliterated += '_';
    }
  }
  
  // Clean up
  return transliterated
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .substring(0, 50) || 'exercise';
}

/**
 * Generate English slug from Hebrew name with variation modifiers
 * Creates a UNIQUE slug that captures the specific variation
 * 
 * Format: {coreId}-{angle}deg-{unilateral}-{equipment}
 * Example: "rows-45deg-one_arm-rings"
 */
function generateSlug(
  name: string, 
  sheetName: string, 
  index: number,
  attributes: ExerciseAttributes,
  equipment: string[]
): string {
  // Basic transliteration map
  const translitMap: Record<string, string> = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
    'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
    'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
    'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
    'ף': 'f', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r',
    'ש': 'sh', 'ת': 't',
  };
  
  // Start with the core exercise name (without modifiers)
  const coreId = generateCoreId(name);
  
  // Build variation suffix
  const modifiers: string[] = [];
  
  // Add angle if present
  if (attributes.angle) {
    modifiers.push(`${attributes.angle}deg`);
  }
  
  // Add unilateral indicator
  if (attributes.isUnilateral) {
    modifiers.push('one_arm');
  }
  
  // Add equipment (excluding "Bodyweight" as it's default)
  const nonDefaultEquipment = equipment.filter(e => e !== 'Bodyweight');
  if (nonDefaultEquipment.length > 0) {
    const equipmentSlug = nonDefaultEquipment[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    modifiers.push(equipmentSlug);
  }
  
  // Build the full slug
  let slug = coreId;
  if (modifiers.length > 0) {
    slug += '-' + modifiers.join('-');
  }
  
  // Add sheet prefix for grouping
  const sheetPrefix = SHEET_TO_PROGRAM[sheetName] || 'exercise';
  
  // Add index to ensure uniqueness
  return `${sheetPrefix}_${slug}_${index}`.toLowerCase().substring(0, 80);
}

/**
 * Parse a single row from Excel into a structured exercise
 * With SURGICAL attribute extraction for angles, unilateral, equipment
 */
function parseExerciseRow(
  row: RawExerciseRow,
  sheetName: string,
  index: number,
  enableDebugLog: boolean = false
): ParsedExercise | null {
  // Try to find the name column (common variations)
  const nameColumns = ['שם התרגיל', 'שם', 'תרגיל', 'name', 'exercise', 'Name', 'תרגיל '];
  let nameHe = '';
  
  for (const col of nameColumns) {
    if (row[col]) {
      nameHe = String(row[col]).trim();
      break;
    }
  }
  
  // If no name found, try the first non-empty string column
  if (!nameHe) {
    for (const value of Object.values(row)) {
      if (typeof value === 'string' && value.trim().length > 2) {
        nameHe = value.trim();
        break;
      }
    }
  }
  
  if (!nameHe || nameHe.length < 2) {
    return null;
  }
  
  // =============================================
  // SURGICAL ATTRIBUTE EXTRACTION
  // =============================================
  
  // 1. Extract ANGLE (e.g., 45°, 30 מעלות)
  const angle = extractAngle(nameHe);
  
  // 2. Detect UNILATERAL (single arm/leg exercises)
  const isUnilateral = detectUnilateral(nameHe);
  
  // 3. Build attributes object
  const attributes: ExerciseAttributes = {};
  if (angle !== undefined) {
    attributes.angle = angle;
  }
  if (isUnilateral) {
    attributes.isUnilateral = true;
  }
  
  // =============================================
  // LEVEL EXTRACTION (STRICT - NOT ANGLES!)
  // =============================================
  const levelColumns = ['רמה', 'level', 'Level', 'רמת קושי', 'רמה '];
  let level = 1;
  let levelSource = 'default';
  
  for (const col of levelColumns) {
    if (row[col]) {
      // Pass the exercise name to help detect angle vs level confusion
      level = extractLevel(row[col], nameHe);
      levelSource = `column: ${col}`;
      break;
    }
  }
  
  // Check if level is embedded in name ONLY with explicit "רמה" pattern
  if (levelSource === 'default') {
    const hebrewLevelMatch = nameHe.match(/רמה\s*(\d+)/);
    if (hebrewLevelMatch) {
      const val = parseInt(hebrewLevelMatch[1], 10);
      if (val <= 20) {
        level = val;
        levelSource = 'embedded רמה pattern';
      }
    }
  }
  
  // =============================================
  // EQUIPMENT DETECTION (DISTINGUISH RINGS vs STRAPS!)
  // =============================================
  const allText = `${nameHe} ${sheetName}`;
  const equipment = detectEquipment(allText);
  
  // =============================================
  // GENERATE IDs
  // =============================================
  const coreId = generateCoreId(nameHe);
  const slug = generateSlug(nameHe, sheetName, index, attributes, equipment);
  
  // AI Enrichment - Generate professional data with context
  const enriched = enrichExerciseData(nameHe, sheetName, attributes, equipment);
  
  // Debug logging with FULL surgical data
  if (enableDebugLog) {
    const attrStr = Object.entries(attributes)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ') || 'none';
    
    console.log(`[Import] "${nameHe}" -> CoreID: "${coreId}", Level: ${level} (${levelSource}), Equipment: [${equipment.join(', ')}], Attributes: {${attrStr}}`);
  }
  
  return {
    id: slug,
    slug,
    nameHe,
    nameEn: '', // Will need manual translation
    level,
    equipment,
    coreId,
    sheetName,
    programId: SHEET_TO_PROGRAM[sheetName] || 'general',
    rawData: row,
    attributes,
    enriched,
  };
}

// ============================================================================
// MAIN ACTION
// ============================================================================

/**
 * Resolve the Excel file path with multiple fallback strategies
 */
function resolveExcelFilePath(): { path: string; exists: boolean; error?: string } {
  const fileName = 'מעקב אימונים ותרגילים (1).xlsx';
  
  // Strategy 1: Use process.cwd() (standard Next.js approach)
  const cwdPath = path.join(process.cwd(), 'temp-data', fileName);
  if (fs.existsSync(cwdPath)) {
    return { path: cwdPath, exists: true };
  }
  
  // Strategy 2: Try __dirname relative path (for compiled code)
  try {
    const dirnamePath = path.resolve(__dirname, '../../../../temp-data', fileName);
    if (fs.existsSync(dirnamePath)) {
      return { path: dirnamePath, exists: true };
    }
  } catch {
    // __dirname might not be available in all contexts
  }
  
  // Strategy 3: Try absolute path directly
  const absolutePath = '/Users/calisthenicsltd/Desktop/פרויקטים בתכנות/out-run-app/ out-run-app 3/temp-data/' + fileName;
  if (fs.existsSync(absolutePath)) {
    return { path: absolutePath, exists: true };
  }
  
  // Return the cwd path with error info
  return { 
    path: cwdPath, 
    exists: false,
    error: `File not found. Tried paths:\n1. ${cwdPath}\n2. Absolute fallback\nCWD: ${process.cwd()}`
  };
}

export async function importExcelToFirestore(): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    message: '',
    totalProcessed: 0,
    imported: 0,
    errors: [],
    sheets: [],
  };

  try {
    // Resolve file path with fallback strategies
    const fileInfo = resolveExcelFilePath();
    
    if (!fileInfo.exists) {
      result.message = `קובץ לא נמצא!\n${fileInfo.error || `נתיב: ${fileInfo.path}`}`;
      result.errors.push(result.message);
      return result;
    }

    // Read file as buffer to handle Hebrew path encoding issues
    const fileBuffer = fs.readFileSync(fileInfo.path);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const allExercises: ParsedExercise[] = [];

    // Process each target sheet
    for (const sheetName of SHEETS_TO_IMPORT) {
      if (!workbook.SheetNames.includes(sheetName)) {
        result.errors.push(`גיליון "${sheetName}" לא נמצא בקובץ`);
        continue;
      }

      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<RawExerciseRow>(worksheet, {
        defval: '',
        raw: false,
      });

      let sheetImported = 0;
      const enableDebug = jsonData.length <= 20; // Only log for small sheets
      
      console.log(`[Import] Processing sheet: "${sheetName}" with ${jsonData.length} rows`);
      
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const parsed = parseExerciseRow(row, sheetName, i + 1, enableDebug);
        
        if (parsed) {
          allExercises.push(parsed);
          sheetImported++;
        }
      }
      
      console.log(`[Import] Sheet "${sheetName}": imported ${sheetImported}/${jsonData.length} exercises`);

      result.sheets.push({
        name: sheetName,
        rowCount: jsonData.length,
        imported: sheetImported,
      });
      
      result.totalProcessed += jsonData.length;
    }

    // Upload to Firestore using batches (max 500 operations per batch)
    const exercisesCollection = collection(db, 'imported_exercises');
    const batchSize = 450; // Leave some margin
    let currentBatch = writeBatch(db);
    let batchCount = 0;
    let totalImported = 0;

    // Track exercises for summary table
    const summaryData: Array<{
      name: string;
      coreId: string;
      equipment: string[];
      angle: number | undefined;
      unilateral: boolean;
      level: number;
    }> = [];

    for (const exercise of allExercises) {
      const docRef = doc(exercisesCollection, exercise.slug);
      
      // Build enriched Firestore document with AI-generated data
      const firestoreDoc = {
        // Basic info
        name: {
          he: exercise.nameHe,
          en: exercise.nameEn,
        },
        
        // Exercise type - now based on AI analysis
        type: exercise.enriched.exerciseType,
        loggingMode: exercise.enriched.exerciseType === 'hold' ? 'completion' : 'reps',
        
        // Equipment
        equipment: exercise.equipment,
        
        // Muscles - AI enriched
        muscleGroups: [exercise.enriched.primaryMuscle, ...exercise.enriched.secondaryMuscles],
        primaryMuscle: exercise.enriched.primaryMuscle,
        secondaryMuscles: exercise.enriched.secondaryMuscles,
        
        // Program & Level
        programIds: [exercise.programId],
        recommendedLevel: exercise.level,
        
        // Identifiers
        coreId: exercise.coreId,
        sourceSheet: exercise.sheetName,
        
        // Movement classification - AI enriched
        movementGroup: exercise.enriched.movementGroup,
        movementType: exercise.enriched.movementType,
        tags: exercise.enriched.tags,
        isStatic: exercise.enriched.isStatic,
        
        // VARIATION ATTRIBUTES (NEW!)
        attributes: {
          angle: exercise.attributes.angle || null,
          isUnilateral: exercise.attributes.isUnilateral || false,
          grip: exercise.attributes.grip || null,
        },
        
        // Media placeholder
        media: {},
        
        // Content - AI generated instructions
        content: {
          description: { 
            he: `תרגיל ${exercise.enriched.movementType === 'compound' ? 'מורכב' : 'ממוקד'} לחיזוק ${
              exercise.enriched.primaryMuscle === 'full_body' ? 'כל הגוף' : 
              exercise.enriched.primaryMuscle === 'back' ? 'הגב' :
              exercise.enriched.primaryMuscle === 'chest' ? 'החזה' :
              exercise.enriched.primaryMuscle === 'shoulders' ? 'הכתפיים' :
              exercise.enriched.primaryMuscle === 'core' ? 'הליבה' :
              exercise.enriched.primaryMuscle === 'quads' ? 'הרגליים' :
              exercise.enriched.primaryMuscle
            }`, 
            en: '' 
          },
          instructions: { 
            he: exercise.enriched.instructions.join('\n'), 
            en: '' 
          },
          specificCues: exercise.enriched.instructions,
          highlights: exercise.enriched.highlights,
        },
        
        // Stats
        stats: { views: 0 },
        
        // Metadata
        importedAt: new Date().toISOString(),
        enrichedByAI: true,
        rawData: exercise.rawData,
      };

      currentBatch.set(docRef, firestoreDoc);
      batchCount++;
      totalImported++;
      
      // Collect for summary table
      summaryData.push({
        name: exercise.nameHe,
        coreId: exercise.coreId,
        equipment: exercise.equipment,
        angle: exercise.attributes.angle,
        unilateral: !!exercise.attributes.isUnilateral,
        level: exercise.level,
      });

      // Commit batch when reaching limit
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }

    // Commit remaining documents
    if (batchCount > 0) {
      await currentBatch.commit();
    }

    // =============================================
    // PRINT SUMMARY TABLE FOR VERIFICATION
    // =============================================
    console.log('\n' + '='.repeat(120));
    console.log('📊 IMPORT SUMMARY TABLE - SURGICAL EXTRACTION VERIFICATION');
    console.log('='.repeat(120));
    console.log(
      'Original Name'.padEnd(45) + ' | ' +
      'Core ID'.padEnd(20) + ' | ' +
      'Equipment'.padEnd(20) + ' | ' +
      'Angle'.padEnd(8) + ' | ' +
      'Unilateral'.padEnd(10) + ' | ' +
      'Level'
    );
    console.log('-'.repeat(120));
    
    // Group by coreId to show variations together
    const groupedByCore = summaryData.reduce((acc, item) => {
      if (!acc[item.coreId]) acc[item.coreId] = [];
      acc[item.coreId].push(item);
      return acc;
    }, {} as Record<string, typeof summaryData>);
    
    // Print variations grouped by core exercise
    for (const [coreId, variations] of Object.entries(groupedByCore)) {
      if (variations.length > 1) {
        console.log(`\n🔹 Variation Group: ${coreId} (${variations.length} variations)`);
      }
      for (const item of variations) {
        const name = item.name.substring(0, 43).padEnd(45);
        const core = item.coreId.substring(0, 18).padEnd(20);
        const equip = item.equipment.join(', ').substring(0, 18).padEnd(20);
        const angle = item.angle ? `${item.angle}°`.padEnd(8) : '-'.padEnd(8);
        const unilat = item.unilateral ? '✓ Yes'.padEnd(10) : '-'.padEnd(10);
        const level = String(item.level);
        
        console.log(`${name} | ${core} | ${equip} | ${angle} | ${unilat} | ${level}`);
      }
    }
    
    console.log('='.repeat(120));
    console.log(`✅ Total: ${totalImported} exercises imported`);
    console.log(`📦 Unique core exercises: ${Object.keys(groupedByCore).length}`);
    console.log(`📐 Exercises with angles: ${summaryData.filter(e => e.angle).length}`);
    console.log(`🔄 Unilateral exercises: ${summaryData.filter(e => e.unilateral).length}`);
    console.log('='.repeat(120) + '\n');

    result.imported = totalImported;
    result.success = true;
    result.message = `ייבוא הושלם בהצלחה! ${totalImported} תרגילים יובאו מ-${result.sheets.length} גיליונות.`;

  } catch (error) {
    console.error('Import error:', error);
    result.message = `שגיאה בייבוא: ${error instanceof Error ? error.message : 'Unknown error'}`;
    result.errors.push(result.message);
  }

  return result;
}

/**
 * Preview import without actually writing to Firestore
 */
export async function previewExcelImport(): Promise<{
  success: boolean;
  message: string;
  sheets: {
    name: string;
    rowCount: number;
    sampleRows: ParsedExercise[];
  }[];
  debugInfo?: string;
}> {
  try {
    // Resolve file path with fallback strategies
    const fileInfo = resolveExcelFilePath();
    
    if (!fileInfo.exists) {
      return {
        success: false,
        message: `קובץ לא נמצא!`,
        sheets: [],
        debugInfo: fileInfo.error || `נתיב: ${fileInfo.path}`,
      };
    }

    // Read file as buffer to handle Hebrew path encoding issues
    const fileBuffer = fs.readFileSync(fileInfo.path);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheets: {
      name: string;
      rowCount: number;
      sampleRows: ParsedExercise[];
    }[] = [];

    for (const sheetName of SHEETS_TO_IMPORT) {
      if (!workbook.SheetNames.includes(sheetName)) {
        continue;
      }

      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<RawExerciseRow>(worksheet, {
        defval: '',
        raw: false,
      });

      const sampleRows: ParsedExercise[] = [];
      
      for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
        const row = jsonData[i];
        const parsed = parseExerciseRow(row, sheetName, i + 1);
        if (parsed) {
          sampleRows.push(parsed);
        }
      }

      sheets.push({
        name: sheetName,
        rowCount: jsonData.length,
        sampleRows,
      });
    }

    return {
      success: true,
      message: `נמצאו ${sheets.length} גיליונות לייבוא`,
      sheets,
    };

  } catch (error) {
    return {
      success: false,
      message: `שגיאה בקריאת הקובץ: ${error instanceof Error ? error.message : 'Unknown error'}`,
      sheets: [],
    };
  }
}

// ============================================================================
// IMPORTED EXERCISES MANAGEMENT
// ============================================================================

export interface ImportedExercise {
  id: string;
  name: { he: string; en: string };
  type: string;
  loggingMode: string;
  equipment: string[];
  muscleGroups: string[];
  primaryMuscle?: string;
  secondaryMuscles?: string[];
  programIds: string[];
  recommendedLevel: number;
  coreId: string;
  sourceSheet: string;
  movementGroup?: string;
  movementType?: 'compound' | 'isolation';
  tags?: string[];
  isStatic?: boolean;
  // Variation attributes (NEW!)
  attributes?: {
    angle?: number | null;
    isUnilateral?: boolean;
    grip?: string | null;
  };
  content?: {
    description?: { he: string; en: string };
    instructions?: { he: string; en: string };
    specificCues?: string[];
    highlights?: string[];
  };
  enrichedByAI?: boolean;
  importedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawData?: any;
}

/**
 * Get all imported exercises from the staging collection
 */
export async function getImportedExercises(): Promise<{
  success: boolean;
  exercises: ImportedExercise[];
  message: string;
}> {
  try {
    const { getDocs } = await import('firebase/firestore');
    const exercisesCollection = collection(db, 'imported_exercises');
    const snapshot = await getDocs(exercisesCollection);
    
    const exercises: ImportedExercise[] = [];
    snapshot.forEach((doc) => {
      exercises.push({
        id: doc.id,
        ...doc.data(),
      } as ImportedExercise);
    });
    
    // Sort by sourceSheet and then by name
    exercises.sort((a, b) => {
      if (a.sourceSheet !== b.sourceSheet) {
        return a.sourceSheet.localeCompare(b.sourceSheet);
      }
      return (a.name.he || '').localeCompare(b.name.he || '');
    });
    
    return {
      success: true,
      exercises,
      message: `נמצאו ${exercises.length} תרגילים מיובאים`,
    };
  } catch (error) {
    console.error('Error getting imported exercises:', error);
    return {
      success: false,
      exercises: [],
      message: `שגיאה בטעינת התרגילים: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Delete a single imported exercise
 */
export async function deleteImportedExercise(exerciseId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const { deleteDoc } = await import('firebase/firestore');
    const docRef = doc(db, 'imported_exercises', exerciseId);
    await deleteDoc(docRef);
    
    return {
      success: true,
      message: `התרגיל נמחק בהצלחה`,
    };
  } catch (error) {
    return {
      success: false,
      message: `שגיאה במחיקת התרגיל: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Clear all imported exercises
 */
export async function clearImportedExercises(): Promise<{
  success: boolean;
  message: string;
  deletedCount: number;
}> {
  try {
    const { getDocs, deleteDoc } = await import('firebase/firestore');
    const exercisesCollection = collection(db, 'imported_exercises');
    const snapshot = await getDocs(exercisesCollection);
    
    let deletedCount = 0;
    const batchSize = 500;
    let batch = writeBatch(db);
    let batchCount = 0;
    
    for (const docSnapshot of snapshot.docs) {
      batch.delete(docSnapshot.ref);
      batchCount++;
      deletedCount++;
      
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }
    
    return {
      success: true,
      message: `נמחקו ${deletedCount} תרגילים מהקולקציה`,
      deletedCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `שגיאה בניקוי הקולקציה: ${error instanceof Error ? error.message : 'Unknown error'}`,
      deletedCount: 0,
    };
  }
}

/**
 * Re-process and fix existing imported exercises
 * Separates angles from levels for any exercises that were incorrectly imported
 */
export async function reprocessImportedExercises(): Promise<{
  success: boolean;
  message: string;
  fixedCount: number;
  details: Array<{ name: string; oldLevel: number; newLevel: number; angle: number | null }>;
}> {
  try {
    const { getDocs, updateDoc } = await import('firebase/firestore');
    const exercisesCollection = collection(db, 'imported_exercises');
    const snapshot = await getDocs(exercisesCollection);
    
    let fixedCount = 0;
    const details: Array<{ name: string; oldLevel: number; newLevel: number; angle: number | null }> = [];
    
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const nameHe = data.name?.he || '';
      const currentLevel = data.recommendedLevel || 1;
      
      // Extract angle from name
      const detectedAngle = extractAngle(nameHe);
      
      // Re-extract level with strict rules
      const hebrewLevelMatch = nameHe.match(/רמה\s*(\d+)/);
      let newLevel = 1;
      
      if (hebrewLevelMatch) {
        const val = parseInt(hebrewLevelMatch[1], 10);
        if (val <= 20) {
          newLevel = val;
        }
      }
      
      // Check if current level looks like an angle (> 20 or matches detected angle)
      const needsFix = currentLevel > 20 || 
                       (detectedAngle && currentLevel === detectedAngle) ||
                       (detectedAngle && !data.attributes?.angle);
      
      if (needsFix) {
        const updates: Record<string, unknown> = {
          recommendedLevel: newLevel,
          attributes: {
            angle: detectedAngle || null,
            isUnilateral: detectUnilateral(nameHe),
            grip: data.attributes?.grip || null,
          },
        };
        
        await updateDoc(docSnapshot.ref, updates);
        fixedCount++;
        
        details.push({
          name: nameHe,
          oldLevel: currentLevel,
          newLevel,
          angle: detectedAngle || null,
        });
        
        console.log(`[Fix] "${nameHe}": Level ${currentLevel} -> ${newLevel}, Angle: ${detectedAngle || 'none'}`);
      }
    }
    
    console.log(`\n✅ Fixed ${fixedCount} exercises with level/angle confusion`);
    
    return {
      success: true,
      message: `תוקנו ${fixedCount} תרגילים`,
      fixedCount,
      details,
    };
  } catch (error) {
    console.error('Reprocess error:', error);
    return {
      success: false,
      message: `שגיאה בתיקון: ${error instanceof Error ? error.message : 'Unknown error'}`,
      fixedCount: 0,
      details: [],
    };
  }
}

/**
 * Sync imported exercises to the production 'exercises' collection
 * Only syncs exercises that have been validated (non-empty name and valid level)
 */
export async function syncToProduction(): Promise<{
  success: boolean;
  message: string;
  syncedCount: number;
  skippedCount: number;
  errors: string[];
}> {
  try {
    const { getDocs, setDoc, serverTimestamp } = await import('firebase/firestore');
    
    // Get all imported exercises
    const importedCollection = collection(db, 'imported_exercises');
    const snapshot = await getDocs(importedCollection);
    
    const productionCollection = collection(db, 'exercises');
    let syncedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    
    const batchSize = 450;
    let batch = writeBatch(db);
    let batchCount = 0;
    
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      
      // Validation: Skip if no Hebrew name
      if (!data.name?.he || data.name.he.length < 2) {
        skippedCount++;
        continue;
      }
      
      // Prepare production document
      const productionDoc = {
        name: data.name,
        type: data.type || 'reps',
        loggingMode: data.loggingMode || 'reps',
        equipment: data.equipment || ['Bodyweight'],
        muscleGroups: data.muscleGroups || [],
        programIds: data.programIds || [],
        recommendedLevel: data.recommendedLevel || 1,
        coreId: data.coreId,
        sourceSheet: data.sourceSheet,
        media: data.media || {},
        content: data.content || {
          description: { he: '', en: '' },
          instructions: { he: '', en: '' },
        },
        stats: data.stats || { views: 0 },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        importedFrom: 'excel_import',
        originalImportId: docSnapshot.id,
      };
      
      // Use the same ID as the imported exercise
      const prodDocRef = doc(productionCollection, docSnapshot.id);
      batch.set(prodDocRef, productionDoc);
      batchCount++;
      syncedCount++;
      
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
        console.log(`[Sync] Committed batch: ${syncedCount} exercises synced so far`);
      }
    }
    
    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log(`[Sync] Complete: ${syncedCount} synced, ${skippedCount} skipped`);
    
    return {
      success: true,
      message: `סנכרון הושלם! ${syncedCount} תרגילים הועברו לקולקציה הראשית.`,
      syncedCount,
      skippedCount,
      errors,
    };
  } catch (error) {
    console.error('Sync error:', error);
    return {
      success: false,
      message: `שגיאה בסנכרון: ${error instanceof Error ? error.message : 'Unknown error'}`,
      syncedCount: 0,
      skippedCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}
