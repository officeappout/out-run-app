'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2, Trash2, CheckCircle, AlertTriangle, Shield } from 'lucide-react';

const COLLECTION = 'runWorkoutTemplates';
const PROTECTED_NAMES = ['אימון פירמידה', 'אימון שינוי קצבים'];

const ZONE_COLOR_MAP: Record<string, string> = {
  sprint: '#DC2626',
  interval_short: '#E11D48',
  interval_long: '#0D9488',
  fartlek_medium: '#CE93D8',
  fartlek_fast: '#AB47BC',
  tempo: '#9C27B0',
  easy: '#4CAF50',
  easy_run: '#4CAF50',
  long_run: '#2E7D32',
  recovery: '#B0BEC5',
  walk: '#90A4AE',
  jogging: '#78909C',
};

function resolveColor(zoneType: string): string {
  return ZONE_COLOR_MAP[zoneType] ?? '#9E9E9E';
}

function resolveZoneType(block: Record<string, unknown>): string {
  const zone = block.zoneType as string;
  if (zone === 'fartlek_medium' || zone === 'recovery') return zone;

  const measureBy = block.measureBy as string;
  const baseValue = block.baseValue as number;

  if (measureBy === 'time' && baseValue <= 60) return 'sprint';
  if (measureBy === 'distance' && baseValue <= 300) return 'sprint';
  return zone;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const RAW_TEMPLATES: any[] = [{"_comment":"===== TIME F1: מונה פארטלק (Medium) =====","name":"מונה פארטלק","description":"פארטלק אליטה קלאסי מאוסטרליה. surges יורדים: 90→60→30→15 שנ׳ עם float שווה. הגוף לומד להתאושש תוך כדי ריצה. Float = ריצה פעילה מתחת לסף.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":20,"tags":["mona","elite_classic","over_under","descending"],"blocks":[{"id":"MF-90s-1","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":90,"sets":1,"label":"surge 90 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F90-1","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":90,"sets":1,"label":"float 90 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-90s-2","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":90,"sets":1,"label":"surge 90 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F90-2","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":90,"sets":1,"label":"float 90 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-60s-1","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 60 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F60-1","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 60 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-60s-2","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 60 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F60-2","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 60 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-60s-3","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 60 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F60-3","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 60 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-60s-4","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 60 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F60-4","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 60 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-30s-1","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":30,"sets":1,"label":"surge 30 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F30-1","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":30,"sets":1,"label":"float 30 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-30s-2","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":30,"sets":1,"label":"surge 30 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F30-2","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":30,"sets":1,"label":"float 30 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-30s-3","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":30,"sets":1,"label":"surge 30 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F30-3","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":30,"sets":1,"label":"float 30 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-30s-4","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":30,"sets":1,"label":"surge 30 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F30-4","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":30,"sets":1,"label":"float 30 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-15s-1","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":15,"sets":1,"label":"surge 15 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F15-1","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":15,"sets":1,"label":"float 15 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-15s-2","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":15,"sets":1,"label":"surge 15 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F15-2","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":15,"sets":1,"label":"float 15 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-15s-3","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":15,"sets":1,"label":"surge 15 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MF-F15-3","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":15,"sets":1,"label":"float 15 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MF-15s-4","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":15,"sets":1,"label":"surge 15 שנ׳ אחרון","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== TIME F2: גלי סף 3/2 ×3 (Easy) =====","name":"גלי סף 3/2 דק׳ × 3","description":"3 סטים של 3 דק׳ מעל הסף + 2 דק׳ float מתחת. כניסה לעולם ה-over/under. הדופק נשאר גבוה לאורך כל האימון.","category":"fartlek_structured","priority":3,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":15,"tags":["threshold_waves","over_under","beginner_fartlek"],"blocks":[{"id":"TW-fast-3min","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":3,"restBetweenSetsSeconds":120,"restType":"jog","label":"surge 3 דק׳ — מעל סף","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 2 דק׳ — מתחת לסף"}]},{"_comment":"===== TIME F3: גלי סף 3/2 ×5 (Hard) =====","name":"גלי סף 3/2 דק׳ × 5","description":"5 סטים של 3 דק׳ מעל הסף + 2 דק׳ float. 25 דק׳ של עבודה over/under ללא הפסקה אמיתית. אימון LT מתקדם.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":25,"tags":["threshold_waves","over_under","elite","volume"],"blocks":[{"id":"TW-fast-3min-x5","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":5,"restBetweenSetsSeconds":120,"restType":"jog","label":"surge 3 דק׳ — מעל סף","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 2 דק׳ — מתחת לסף"}]},{"_comment":"===== TIME F4: קנייתי 1/1 ×10 (Easy) =====","name":"קנייתי 1/1 × 10 (20 דק׳)","description":"הפארטלק הקנייתי הקלאסי — 1 דק׳ מהיר / 1 דק׳ float × 10. פשוט ויעיל. 20 דק׳ רצוף של over/under.","category":"fartlek_structured","priority":3,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":20,"tags":["kenyan","classic","1_1","simple"],"blocks":[{"id":"KF-60/60-x10","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":10,"restBetweenSetsSeconds":60,"restType":"jog","label":"surge 1 דק׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 1 דק׳"}]},{"_comment":"===== TIME F5: קנייתי 1/1 ×15 (Hard) =====","name":"קנייתי 1/1 × 15 (30 דק׳)","description":"30 דק׳ של 1 דק׳ מהיר / 1 דק׳ float ללא הפסקה. נפח over/under מרבי. אימון סיבולת מנטלית.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":30,"tags":["kenyan","elite","1_1","endurance"],"blocks":[{"id":"KF-60/60-x15","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":15,"restBetweenSetsSeconds":60,"restType":"jog","label":"surge 1 דק׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 1 דק׳"}]},{"_comment":"===== TIME F6: פירמידה 1-2-3-2-1 דק׳ (Medium) =====","name":"פירמידת זמן 1-2-3-2-1 דק׳","description":"פירמידה עולה ויורדת — שיא ב-3 דק׳. Float שווה לזמן העבודה. מגוון גירויים באימון אחד.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":18,"tags":["pyramid","time","over_under","variety"],"blocks":[{"id":"PT-60s","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 1 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT-F60a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT-120s","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT-F120a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":120,"sets":1,"label":"float 2 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT-180s","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":1,"label":"surge 3 דק׳ — שיא","isQualityExercise":true,"colorHex":"#7B1FA2"},{"id":"PT-F180","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":180,"sets":1,"label":"float 3 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT-120s-d","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT-F120b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":120,"sets":1,"label":"float 2 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT-60s-d","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 1 דק׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== TIME F7: פירמידה 1-2-3-4-3-2-1 דק׳ (Hard) =====","name":"פירמידת זמן 1-2-3-4-3-2-1 דק׳","description":"פירמידה מורחבת — שיא ב-4 דק׳. 16 דק׳ surge + 16 דק׳ float = 32 דק׳. אימון over/under שיא.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":32,"tags":["pyramid","extended","elite","over_under"],"blocks":[{"id":"PT7-60","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 1 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT7-F60a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT7-120","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT7-F120a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":120,"sets":1,"label":"float 2 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT7-180","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":1,"label":"surge 3 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT7-F180","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":180,"sets":1,"label":"float 3 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT7-240","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":240,"sets":1,"label":"surge 4 דק׳ — שיא","isQualityExercise":true,"colorHex":"#7B1FA2"},{"id":"PT7-F240","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":240,"sets":1,"label":"float 4 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT7-180d","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":1,"label":"surge 3 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT7-F180d","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":180,"sets":1,"label":"float 3 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT7-120d","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PT7-F120d","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":120,"sets":1,"label":"float 2 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PT7-60d","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 1 דק׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== TIME F8: נורווגי 4/3 ×4 (Medium) =====","name":"נורווגי 4/3 דק׳ × 4","description":"בהשראת שיטת 4×4 הנורווגית. 4 דק׳ surge בזון VO2max + 3 דק׳ float. הדופק לא יורד מספיק — מצטבר VO2max.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":28,"tags":["norwegian","vo2max","4x4","over_under"],"blocks":[{"id":"NR-240/180-x4","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":240,"sets":4,"restBetweenSetsSeconds":180,"restType":"jog","label":"surge 4 דק׳ — VO2max","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 3 דק׳"}]},{"_comment":"===== TIME F9: סולם יורד 4-3-2-1 דק׳ (Medium) =====","name":"סולם יורד 4-3-2-1 דק׳","description":"סולם יורד — surges מתקצרים, float = חצי מהעבודה. ככל שה-surge קצר יותר, הקצב עולה. מסיימים בספרינט.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":15,"tags":["ladder","descending","accelerating"],"blocks":[{"id":"LD-240","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":240,"sets":1,"label":"surge 4 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"LD-F120a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":120,"sets":1,"label":"float 2 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"LD-180","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":1,"label":"surge 3 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"LD-F90","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":90,"sets":1,"label":"float 90 שנ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"LD-120","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"LD-F60","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"LD-60","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 1 דק׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== TIME F10: 30/30 ×20 (Easy) =====","name":"30/30 × 20 מיקרו-פארטלק","description":"20 חזרות של 30 שנ׳ surge / 30 שנ׳ float. 20 דק׳ רצוף. מצטבר VO2max מהר כי הדופק לא מספיק לרדת בין surges.","category":"fartlek_structured","priority":3,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":20,"tags":["micro","30_30","vo2max_accumulation","beginner"],"blocks":[{"id":"MIC-30/30-x20","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"time","baseValue":30,"sets":20,"restBetweenSetsSeconds":30,"restType":"jog","label":"surge 30 שנ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 30 שנ׳"}]},{"_comment":"===== TIME F11: 2/1 ×8 (Medium) =====","name":"over/under 2/1 × 8","description":"8 סטים של 2 דק׳ מעל סף + 1 דק׳ float מתחת. יחס 2:1 — יותר עבודה מ-float. 24 דק׳ רצוף.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":24,"tags":["over_under","2_1","threshold"],"blocks":[{"id":"OU-120/60-x8","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":8,"restBetweenSetsSeconds":60,"restType":"jog","label":"surge 2 דק׳ — מעל סף","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 1 דק׳ — מתחת לסף"}]},{"_comment":"===== TIME F12: שוודי מעורב (Hard) =====","name":"שוודי מעורב 2-3-1-4-2 דק׳","description":"פארטלק שוודי קלאסי — שינויי קצב בלתי צפויים. כל surge באורך אחר עם float קבוע של 1 דק׳. מלמד את הגוף להגיב לשינויים.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":16,"tags":["swedish","unpredictable","elite","mental"],"blocks":[{"id":"SW-120","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"SW-F1a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"SW-180","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":180,"sets":1,"label":"surge 3 דק׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"SW-F1b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"SW-60","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"time","baseValue":60,"sets":1,"label":"surge 1 דק׳ — מהיר!","isQualityExercise":true,"colorHex":"#7B1FA2"},{"id":"SW-F1c","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"SW-240","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":240,"sets":1,"label":"surge 4 דק׳ — ארוך!","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"SW-F1d","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"time","baseValue":60,"sets":1,"label":"float 1 דק׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"SW-120f","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"time","baseValue":120,"sets":1,"label":"surge 2 דק׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== DISTANCE FD1: 200/200 ×8 (Easy) =====","name":"פארטלק 200/200 × 8","description":"8 חזרות של 200 מ׳ surge + 200 מ׳ float. כניסה לפארטלק מרחק. 3.2 ק״מ רצוף של over/under.","category":"fartlek_structured","priority":3,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":18,"tags":["distance","200m","beginner_fartlek"],"blocks":[{"id":"FD-200/200-x8","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":8,"restBetweenSetsSeconds":200,"restType":"jog","restMeasureBy":"distance","label":"surge 200 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 200 מ׳"}]},{"_comment":"===== DISTANCE FD2: 200/200 ×12 (Medium) =====","name":"פארטלק 200/200 × 12","description":"12 חזרות של 200/200. 4.8 ק״מ over/under. נפח גבוה של surges קצרים.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":25,"tags":["distance","200m","volume"],"blocks":[{"id":"FD-200/200-x12","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":12,"restBetweenSetsSeconds":200,"restType":"jog","restMeasureBy":"distance","label":"surge 200 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 200 מ׳"}]},{"_comment":"===== DISTANCE FD3: 400/400 ×6 (Medium) =====","name":"פארטלק 400/400 × 6","description":"6 חזרות של 400 מ׳ surge + 400 מ׳ float. קלאסי — 4.8 ק״מ. כל surge בקצב threshold+.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":25,"tags":["distance","400m","classic"],"blocks":[{"id":"FD-400/400-x6","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":6,"restBetweenSetsSeconds":400,"restType":"jog","restMeasureBy":"distance","label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 400 מ׳"}]},{"_comment":"===== DISTANCE FD4: 400/400 ×8 (Hard) =====","name":"פארטלק 400/400 × 8","description":"8 חזרות של 400/400. 6.4 ק״מ over/under. אימון מכביד — דורש ניהול קצב חכם.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":32,"tags":["distance","400m","elite","volume"],"blocks":[{"id":"FD-400/400-x8","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":8,"restBetweenSetsSeconds":400,"restType":"jog","restMeasureBy":"distance","label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 400 מ׳"}]},{"_comment":"===== DISTANCE FD5: 600/400 ×5 (Medium) =====","name":"פארטלק 600/400 × 5","description":"5 חזרות של 600 מ׳ surge + 400 מ׳ float. יחס עבודה:float לא שווה — יותר זמן מעל הסף. 5 ק״מ.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":27,"tags":["distance","600m","asymmetric"],"blocks":[{"id":"FD-600/400-x5","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":600,"sets":5,"restBetweenSetsSeconds":400,"restType":"jog","restMeasureBy":"distance","label":"surge 600 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 400 מ׳"}]},{"_comment":"===== DISTANCE FD6: 800/400 ×4 (Hard) =====","name":"פארטלק 800/400 × 4","description":"4 חזרות של 800 מ׳ surge + 400 מ׳ float. VO2max style — surges ארוכים עם float קצר. 4.8 ק״מ.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":28,"tags":["distance","800m","vo2max_style","elite"],"blocks":[{"id":"FD-800/400-x4","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":800,"sets":4,"restBetweenSetsSeconds":400,"restType":"jog","restMeasureBy":"distance","label":"surge 800 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 400 מ׳"}]},{"_comment":"===== DISTANCE FD7: 1000/500 ×3 (Hard) =====","name":"פארטלק 1000/500 × 3","description":"3 חזרות של 1000 מ׳ surge + 500 מ׳ float. VO2max ארוך. 4.5 ק״מ. Float קצר = הדופק לא יורד.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":25,"tags":["distance","1000m","vo2max","elite"],"blocks":[{"id":"FD-1000/500-x3","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":1000,"sets":3,"restBetweenSetsSeconds":500,"restType":"jog","restMeasureBy":"distance","label":"surge 1000 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 500 מ׳"}]},{"_comment":"===== DISTANCE FD8: פירמידה 200-400-600-800-600-400-200 (Hard) =====","name":"פירמידת מרחק 200-400-600-800-600-400-200","description":"פירמידה מלאה — שיא ב-800 מ׳. Float = חצי מה-surge. 3,200 מ׳ surge + 1,600 מ׳ float. אימון שיא.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":28,"tags":["pyramid","distance","elite","full_spectrum"],"blocks":[{"id":"PD-200a","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":1,"label":"surge 200 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PD-F100a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":100,"sets":1,"label":"float 100 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PD-400a","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":1,"label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PD-F200a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PD-600","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":600,"sets":1,"label":"surge 600 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PD-F300a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":300,"sets":1,"label":"float 300 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PD-800","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":800,"sets":1,"label":"surge 800 מ׳ — שיא","isQualityExercise":true,"colorHex":"#7B1FA2"},{"id":"PD-F400","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":400,"sets":1,"label":"float 400 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PD-600d","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":600,"sets":1,"label":"surge 600 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PD-F300b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":300,"sets":1,"label":"float 300 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PD-400b","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":1,"label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"PD-F200b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"PD-200b","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":1,"label":"surge 200 מ׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== DISTANCE FD9: סולם יורד 800-600-400-200 (Medium) =====","name":"סולם יורד 800-600-400-200 עם float 200","description":"סולם יורד — כל surge קצר מהקודם, float קבוע 200 מ׳. ככל שהמרחק יורד, הקצב עולה.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":15,"tags":["ladder","descending","distance","accelerating"],"blocks":[{"id":"DL-800","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":800,"sets":1,"label":"surge 800 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"DL-F200a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"DL-600","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":600,"sets":1,"label":"surge 600 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"DL-F200b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"DL-400","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":1,"label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"DL-F200c","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"DL-200","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":1,"label":"surge 200 מ׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== DISTANCE FD10: מיקס 3×(800+400+200) (Hard) =====","name":"מיקס 3×(800+400+200) פארטלק","description":"3 סטים של surge יורד (800→400→200) עם float 200 מ׳ בין כולם. 4,200 מ׳ surge. מגוון גירויים בכל סט.","category":"fartlek_structured","priority":1,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":30,"tags":["distance","combo","elite","descending_sets"],"blocks":[{"id":"MX-800-1","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":800,"sets":1,"label":"surge 800 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F1a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-400-1","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":1,"label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F1b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-200-1","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":1,"label":"surge 200 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F1c","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":400,"sets":1,"label":"float 400 מ׳ — בין סטים","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-800-2","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":800,"sets":1,"label":"surge 800 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F2a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-400-2","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":1,"label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F2b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-200-2","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":1,"label":"surge 200 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F2c","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":400,"sets":1,"label":"float 400 מ׳ — בין סטים","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-800-3","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":800,"sets":1,"label":"surge 800 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F3a","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-400-3","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":400,"sets":1,"label":"surge 400 מ׳","isQualityExercise":true,"colorHex":"#9C27B0"},{"id":"MX-F3b","type":"recovery","blockMode":"pace","zoneType":"fartlek_medium","measureBy":"distance","baseValue":200,"sets":1,"label":"float 200 מ׳","isQualityExercise":true,"colorHex":"#CE93D8"},{"id":"MX-200-3","type":"interval","blockMode":"pace","zoneType":"sprint","measureBy":"distance","baseValue":200,"sets":1,"label":"surge 200 מ׳ — סיום","isQualityExercise":true,"colorHex":"#9C27B0"}]},{"_comment":"===== DISTANCE FD11: 600/600 ×6 (Easy) =====","name":"פארטלק 600/600 × 6","description":"6 חזרות של 600 מ׳ surge + 600 מ׳ float. יחס 1:1 שווה. 7.2 ק״מ רצוף over/under. אימון בסיסי ויעיל.","category":"fartlek_structured","priority":3,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":35,"tags":["distance","600m","equal_ratio","classic"],"blocks":[{"id":"FD-600/600-x6","type":"interval","blockMode":"pace","zoneType":"interval_short","measureBy":"distance","baseValue":600,"sets":6,"restBetweenSetsSeconds":600,"restType":"jog","restMeasureBy":"distance","label":"surge 600 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 600 מ׳"}]},{"_comment":"===== DISTANCE FD12: 1000/500 ×4 (Medium) =====","name":"פארטלק 1000/500 × 4","description":"4 חזרות של 1000 מ׳ surge + 500 מ׳ float. יחס 2:1. 6 ק״מ over/under. Float קצר = לחץ VO2max מתמשך.","category":"fartlek_structured","priority":2,"isQualityWorkout":true,"targetProfileTypes":[3],"estimatedMinutes":32,"tags":["distance","1000m","asymmetric","vo2max"],"blocks":[{"id":"FD-1000/500-x4","type":"interval","blockMode":"pace","zoneType":"tempo","measureBy":"distance","baseValue":1000,"sets":4,"restBetweenSetsSeconds":500,"restType":"jog","restMeasureBy":"distance","label":"surge 1000 מ׳","isQualityExercise":true,"colorHex":"#9C27B0","restZoneType":"fartlek_medium","restLabel":"float 500 מ׳"}]}];
/* eslint-enable @typescript-eslint/no-explicit-any */

type Stage = 'ready' | 'deleting' | 'uploading' | 'done' | 'error';

interface UploadResult {
  found: number;
  protected: string[];
  deleted: number;
  uploaded: number;
  errors: string[];
  totalBlocks: number;
  sprintPromoted: number;
  colorsFixed: number;
  restFixed: number;
}

export default function CleanUploadFartlekPage() {
  const [stage, setStage] = useState<Stage>('ready');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const handleRun = async () => {
    setStage('deleting');
    setLog([]);
    const errors: string[] = [];
    let deleted = 0;
    const protectedFound: string[] = [];

    try {
      addLog('🔍 שלב 1: מחפש תבניות fartlek_structured...');

      const q = query(collection(db, COLLECTION), where('category', '==', 'fartlek_structured'));
      const snap = await getDocs(q);
      addLog(`נמצאו ${snap.size} תבניות`);

      for (const d of snap.docs) {
        const data = d.data();
        const name = data.name as string;
        if (PROTECTED_NAMES.includes(name)) {
          protectedFound.push(name);
          addLog(`🛡️ מוגן: "${name}" (${d.id})`);
          continue;
        }
        await deleteDoc(doc(db, COLLECTION, d.id));
        deleted++;
      }
      addLog(`✅ נמחקו ${deleted} | מוגנות: ${protectedFound.length}`);

      setStage('uploading');
      addLog(`\n📤 שלב 2: מעבד ומעלה ${RAW_TEMPLATES.length} תבניות...`);

      let uploaded = 0;
      let totalBlocks = 0;
      let sprintPromoted = 0;
      let colorsFixed = 0;
      let restFixed = 0;

      for (const tpl of RAW_TEMPLATES) {
        const { _comment, ...data } = tpl;

        const blocks = (data.blocks as Record<string, unknown>[]).map((block: Record<string, unknown>) => {
          totalBlocks++;
          const oldZone = block.zoneType as string;

          const newZone = resolveZoneType(block);
          if (newZone !== oldZone && block.type === 'interval') {
            sprintPromoted++;
            addLog(`  ⚡ ${data.name} → ${block.id}: ${oldZone} → ${newZone}`);
          }

          const oldColor = block.colorHex as string;
          const newColor = resolveColor(newZone);
          if (oldColor !== newColor) colorsFixed++;

          return { ...block, zoneType: newZone, colorHex: newColor };
        });

        if (data.category === 'fartlek_structured' && blocks.length === 1) {
          const b = blocks[0] as Record<string, unknown>;
          if (b.restBetweenSetsSeconds && !b.restZoneType) {
            b.restZoneType = 'fartlek_medium';
            restFixed++;
            addLog(`  🔄 ${data.name}: restZoneType → fartlek_medium`);
          }
        }

        const ref = doc(collection(db, COLLECTION));
        await setDoc(ref, { ...data, blocks, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        uploaded++;
        if (uploaded % 6 === 0) addLog(`  ${uploaded}/${RAW_TEMPLATES.length} הועלו...`);
      }

      addLog(`\n✅ הועלו ${uploaded} תבניות (${totalBlocks} בלוקים)`);
      addLog(`⚡ ${sprintPromoted} בלוקים קודמו ל-sprint (≤60s / ≤300m)`);
      addLog(`🎨 ${colorsFixed} צבעים עודכנו דינמית לפי zoneType`);
      addLog(`🔄 ${restFixed} תבניות תוקנו ל-restZoneType=fartlek_medium`);

      setResult({ found: snap.size, protected: protectedFound, deleted, uploaded, errors, totalBlocks, sprintPromoted, colorsFixed, restFixed });
      setStage('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`❌ שגיאה: ${msg}`);
      errors.push(msg);
      setResult({ found: 0, protected: protectedFound, deleted, uploaded: 0, errors, totalBlocks: 0, sprintPromoted: 0, colorsFixed: 0, restFixed: 0 });
      setStage('error');
    }
  };

  return (
    <div dir="rtl" className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-black text-gray-900 mb-2">ניקוי והעלאת תבניות פארטלק v2</h1>
      <p className="text-sm text-gray-500 mb-2">
        מוחק תבניות <code className="bg-gray-100 px-1 rounded">fartlek_structured</code> ומעלה 24 חדשות עם תיקונים:
      </p>
      <ul className="text-xs text-gray-500 list-disc list-inside mb-4 space-y-1">
        <li>צבעים דינמיים לפי zoneType (sprint=אדום, interval_short=רוז, float=סגול בהיר)</li>
        <li>≤60s או ≤300m → sprint (בלוקי interval בלבד)</li>
        <li>restZoneType=fartlek_medium לכל אימוני 1-block</li>
      </ul>

      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 text-amber-800 font-bold mb-2">
          <Shield size={18} /> אימונים מוגנים:
        </div>
        <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
          {PROTECTED_NAMES.map((n) => <li key={n}><strong>{n}</strong></li>)}
        </ul>
      </div>

      <div className="flex gap-3 mb-4">
        {['sprint', 'interval_short', 'fartlek_medium', 'tempo', 'recovery'].map((z) => (
          <div key={z} className="flex items-center gap-1.5 text-xs">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: ZONE_COLOR_MAP[z] }} />
            <span>{z}</span>
          </div>
        ))}
      </div>

      {stage === 'ready' && (
        <button onClick={handleRun} className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors">
          <Trash2 size={18} /> מחק + העלה 24 תבניות מתוקנות
        </button>
      )}

      {(stage === 'deleting' || stage === 'uploading') && (
        <div className="flex items-center gap-3 text-purple-600 font-medium">
          <Loader2 size={20} className="animate-spin" />
          {stage === 'deleting' ? 'מוחק (מגן על מתחילים)...' : 'מעבד ומעלה...'}
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-6 bg-gray-900 text-gray-100 p-4 rounded-xl text-sm font-mono space-y-1 max-h-96 overflow-auto">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {stage === 'done' && result && (
        <div className="mt-6 bg-emerald-50 border border-emerald-300 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg">
            <CheckCircle size={22} /> הפעולה הושלמה
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-white p-3 rounded-lg border"><div className="text-gray-500">נמחקו</div><div className="text-2xl font-black text-red-600">{result.deleted}</div></div>
            <div className="bg-white p-3 rounded-lg border"><div className="text-gray-500">מוגנים</div><div className="text-2xl font-black text-amber-600">{result.protected.length}</div></div>
            <div className="bg-white p-3 rounded-lg border"><div className="text-gray-500">הועלו</div><div className="text-2xl font-black text-emerald-600">{result.uploaded}</div></div>
            <div className="bg-white p-3 rounded-lg border"><div className="text-gray-500">⚡ sprint</div><div className="text-2xl font-black text-red-500">{result.sprintPromoted}</div></div>
            <div className="bg-white p-3 rounded-lg border"><div className="text-gray-500">🎨 צבעים</div><div className="text-2xl font-black text-purple-600">{result.colorsFixed}</div></div>
            <div className="bg-white p-3 rounded-lg border"><div className="text-gray-500">🔄 rest fix</div><div className="text-2xl font-black text-blue-600">{result.restFixed}</div></div>
          </div>

          {result.protected.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold mb-1"><Shield size={16} /> שמורים:</div>
              {result.protected.map((n, i) => <div key={i} className="text-sm text-amber-600">🛡️ {n}</div>)}
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-700 font-bold mb-1"><AlertTriangle size={16} /> שגיאות</div>
              {result.errors.map((e, i) => <div key={i} className="text-xs text-red-600">{e}</div>)}
            </div>
          )}
        </div>
      )}

      {stage === 'error' && (
        <div className="mt-6 bg-red-50 border border-red-300 rounded-xl p-5">
          <div className="flex items-center gap-2 text-red-700 font-bold"><AlertTriangle size={20} /> שגיאה</div>
        </div>
      )}
    </div>
  );
}
