/**
 * Shared Constants for Exercise Editor Components
 */
import React from 'react';
import { MuscleGroup, EquipmentType, ExerciseType, MovementGroup, ExerciseTag } from '../../../core/exercise.types';
import { Dumbbell, Clock, Pause } from 'lucide-react';

// Muscle group labels in Hebrew
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'חזה',
  back: 'גב',
  middle_back: 'אמצע גב / טרפזים',
  shoulders: 'כתפיים',
  rear_delt: 'כתף אחורית',
  abs: 'בטן',
  obliques: 'אלכסונים',
  forearms: 'אמות',
  biceps: 'דו-ראשי',
  triceps: 'שלושה ראשים',
  quads: 'ארבע ראשי',
  hamstrings: 'המסטרינג',
  glutes: 'ישבן',
  calves: 'שוקיים',
  traps: 'טרפז',
  cardio: 'קרדיו',
  full_body: 'כל הגוף',
  core: 'ליבה',
  legs: 'רגליים',
};

// Exercise tag labels in Hebrew
export const EXERCISE_TAG_LABELS: Record<ExerciseTag, string> = {
  skill: 'טכניקה',
  compound: 'תרגיל מורכב',
  isolation: 'בידוד',
  explosive: 'פיצוץ',
  hiit_friendly: 'מתאים ל-HIIT',
};

// Equipment labels in Hebrew
export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  rings: 'טבעות',
  bar: 'מוט',
  dumbbells: 'משקולות',
  bands: 'גומיות',
  pullUpBar: 'מתח',
  mat: 'מזרן',
  kettlebell: 'קיטלבל',
  bench: 'ספסל',
  lowBar: 'מוט נמוך',
  highBar: 'מוט גבוה',
  dipStation: 'מקבילים',
  wall: 'קיר',
  stairs: 'מדרגות',
  streetBench: 'ספסל רחוב',
  none: 'ללא ציוד',
};

// Exercise type labels - CRITICAL: label is always a string, icon is ReactNode
export const EXERCISE_TYPE_LABELS: Record<ExerciseType, { label: string; icon: React.ReactNode }> = {
  reps: { label: 'חזרות', icon: <Dumbbell size={18} /> },
  time: { label: 'זמן', icon: <Clock size={18} /> },
  rest: { label: 'התאוששות/חימום', icon: <Pause size={18} /> },
};

export const MOVEMENT_GROUP_LABELS: Record<MovementGroup, { label: string; description: string }> = {
  squat: { label: 'סקוואט', description: 'כיפוף ברכיים/ירכיים (Squat)' },
  hinge: { label: 'הינג׳', description: 'כיפוף ירכיים (Hip Hinge)' },
  horizontal_push: { label: 'דחיקה אופקית', description: 'לדוגמה: שכיבות סמיכה, לחיצת חזה' },
  vertical_push: { label: 'דחיקה אנכית', description: 'לדוגמה: לחיצת כתפיים' },
  horizontal_pull: { label: 'משיכה אופקית', description: 'לדוגמה: חתירה' },
  vertical_pull: { label: 'משיכה אנכית', description: 'לדוגמה: מתח' },
  core: { label: 'ליבה', description: 'תרגילי בטן ויציבה' },
  isolation: { label: 'איסוליישן', description: 'תרגיל מבודד לשריר אחד' },
};

// Predefined Base Movement IDs with Hebrew labels
export const BASE_MOVEMENT_LABELS: Record<string, string> = {
  // Strength - Main patterns
  push_up: 'דחיפה אופקית (שכיבות סמיכה)',
  pull_up: 'משיכה אנכית (מתח)',
  squat: 'סקוואט / גוף תחתון',
  dip: 'מקבילים / דחיפה אנכית מטה',
  row: 'משיכה אופקית (חתירה)',
  overhead_push: 'דחיפה אנכית (מעל הראש)',
  hinge: 'הינג\' (כפיפת ירכיים)',
  lunge: 'לאנג\' / מכרעים',
  plank: 'פלאנק / יציבות ליבה',
  leg_raise: 'הרמת רגליים',
  // Calisthenics Skills
  planche: 'פלאנש',
  front_lever: 'פרונט ליבר',
  back_lever: 'בק ליבר',
  human_flag: 'דגל אדם',
  l_sit: 'ישיבת L',
  handstand: 'עמידת ידיים',
  one_arm_pull: 'מתח יד אחת',
  muscle_up: 'מאסל אפ',
  // Runner's Power
  explosive_leg: 'רגליים נפיצות',
  single_leg_stability: 'יציבות רגל בודדת',
  calf_work: 'עבודת שוקיים',
  pistol_squat: 'פיסטול סקוואט',
};

// Predefined Base Movement IDs
export const BASE_MOVEMENT_OPTIONS: string[] = Object.keys(BASE_MOVEMENT_LABELS);
