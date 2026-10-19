'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  Settings, Footprints, Users, Trophy, ShieldAlert, Save, CheckCircle2,
  Map as MapIcon, Dumbbell, Route as RouteIcon, Star, FlaskConical, ListChecks, X,
  type LucideIcon,
} from 'lucide-react';
import { FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';
import { resolveLoadedFlags, type LoadResult } from './resolve-loaded-flags';
import ExerciseAutocomplete from '@/components/admin/ExerciseAutocomplete';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';

// ============================================================================
// TYPES
// ============================================================================

interface FlagState {
  enable_running_programs: boolean;
  enable_community_feed: boolean;
  enable_leagues: boolean;
  enable_hybrid_slots: boolean;
  enable_full_park_workout: boolean;
  enable_route_stops: boolean;
  enable_recommended_hybrid: boolean;
  enable_mock_location_panel: boolean;
  enable_guided_station: boolean;
  enable_walk_to_first_stop: boolean;
  enable_carousel_swipe_hint: boolean;
  enable_hybrid_cards_v2: boolean;
  enable_route_direction_adapt: boolean;
  enable_no_auto_strength_level: boolean;
  enable_league_aggregates: boolean;
  enable_home_v2: boolean;
  enable_calm_return_v1: boolean;
  ai_coach_enabled: boolean;
  ai_coach_free_for_all: boolean;
  coach_note_llm: boolean;
  ai_coach_schedule_advisor: boolean;
  ai_coach_phase2: boolean;
  weather_enabled: boolean;
  weather_admins_only: boolean;
  kelly_unified_v1: boolean;
  ai_coach_proactive: boolean;
  ai_coach_proactive_llm: boolean;
  ai_coach_memory: boolean;
  ai_coach_round4: boolean;
  enable_keyboard_insets_v1: boolean;
  enable_fast_startup_v1: boolean;
  enable_budget_light_mode: boolean;
  enable_route_quality_v1: boolean;
  enable_graphhopper_routes: boolean;
  enable_loops_prefer_official: boolean;
  enable_generation_review: boolean;
  enable_generation_review_llm: boolean;
}

// ============================================================================
// CARD REGISTRY — add a card here only; the render loop below never changes.
// `parentKey`: when set, this card is a "child" — visually disabled and its
// toggle inert whenever the parent flag is off (the parent gate already makes
// it meaningless at runtime; this just keeps the panel honest about that).
// ============================================================================

interface FlagCardConfig {
  key: keyof FlagState;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  parentKey?: keyof FlagState;
}

const FLAG_CARDS: FlagCardConfig[] = [
  {
    key: 'enable_running_programs',
    icon: Footprints,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'תוכניות ריצה',
    description: 'מסלול ריצה באונבורדינג, ווידג׳טים בדאשבורד, כרטיסיות הבית לריצה',
  },
  {
    key: 'enable_community_feed',
    icon: Users,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    title: 'פיד קהילה וארנה',
    description: 'טאבים ״קהילה״ ו-״הליגה״ בניווט, עמודי /feed ו-/arena, פרסום פוסטים אחרי אימון',
  },
  {
    key: 'enable_leagues',
    icon: Trophy,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'ליגות וארנה',
    description: 'טאב ״הליגה״ ב/community, דירוגי עיר/ארגון/פארק, ליגות חברתיות — בלתי תלוי בפיד',
  },
  {
    key: 'enable_league_aggregates',
    icon: Trophy,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'ליגות מהאימונים עצמם',
    description: 'טבלאות שכונות/ערים/יישובים מהסיכומים בשרת במקום מהפוסטים בפיד, כולל השכונות בכל הארץ, היישובים ו״הכי משתפרים״',
    parentKey: 'enable_leagues',
  },
  {
    key: 'enable_home_v2',
    icon: Users,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    title: 'העיצוב החדש (v2)',
    description: 'דף הבית, הבר התחתון, מחולל ותכנון אימונים, צעדים, פארק, קבוצה, פרופיל, הגדרות, ליגות ופיד בעיצוב החדש. מנהלי־על רואים אותו תמיד',
  },
  {
    key: 'enable_calm_return_v1',
    icon: Dumbbell,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    title: 'חזרה רגועה אחרי הפסקה',
    description: 'מי שחוזר אחרי כמה ימים בלי אימון מקבל אימון קליל יותר, בלי חלונות קופצים ובלי באנר "פספסת". 4-6 ימים: רק כותרת הכרטיס משתנה. שבוע ומעלה: שבוע חדש מהיום וכרטיס אחד בפתיחה הראשונה. רצף: יום חסד אחד בשבוע. כבוי = כמו היום',
  },
  {
    key: 'enable_hybrid_slots',
    icon: MapIcon,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    title: 'שכבת "מה עושים היום?"',
    description: 'כפתור הכניסה במפה, קרוסלת ההצעות המשולבות, והמתג בתפריט ריצה חופשית',
  },
  {
    key: 'enable_full_park_workout',
    icon: Dumbbell,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    title: 'אימון מלא בפארק',
    description: 'הליכה/ריצה לפארק מצויד + אימון כוח מלא + חזרה — כרטיס בתוך השכבה למעלה',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_route_stops',
    icon: RouteIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    title: 'מסלול + עצירות',
    description: 'מסלול מבוסס-מיקום עם עצירות אימון לאורך הדרך — ללא כיסוי בדיקות קצה-לקצה',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_recommended_hybrid',
    icon: Star,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    title: 'משולב מומלץ',
    description: 'הכרטיס הראשון בקרוסלה — "ריצה + כוח" / "הליכה + כוח" — כולל תג ה׳מומלץ׳ והמסלול המחושב מראש',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_mock_location_panel',
    icon: FlaskConical,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'כלי מיקום מדומה (🧪)',
    description: 'כרטיס/פאנל override מיקום במפה (בחירת עיר או קואורדינטות ידניות) — פתוח לבדיקות זמנית, כיבוי מיידי מכאן ללא deploy. הבאנר וחסימת ההפעלה בזמן אימון תמיד פעילים, ללא קשר לדגל זה.',
  },
  {
    key: 'enable_guided_station',
    icon: ListChecks,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    title: 'ליווי צעד-אחר-צעד בתחנה',
    description: 'מתג חירום: כבוי = כל המשתמשים במצב מהיר (תחנה כמו היום). דלוק = לפי הבחירה של כל משתמש בהגדרות (ברירת מחדל דלוק).',
  },
  {
    key: 'enable_walk_to_first_stop',
    icon: Footprints,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'הליכה לתחנה (מסלול + עצירות)',
    description: 'כרטיס הליכה קבוע עם מרחק חי לתחנה הבאה + כפתור "הגעתי" משני. כפתור "הגעתי לתחנה" הגדול רק אחרי שנכנסים לרדיוס התחנה בהליכה — לא מיד בהתחלה ליד גינה. כבוי = ההתנהגות של היום.',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_carousel_swipe_hint',
    icon: MapIcon,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'רמז החלקה בקרוסלה',
    description: 'קרוסלת "מה עושים היום?": הכרטיס הבא מציץ יותר, תנועת רמז חד-פעמית למשתמש, ולחיצה על כרטיס שמציץ רק ממרכזת אותו (לא מתחילה "יוצאים מיד" בטעות). כבוי = כמו היום.',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_hybrid_cards_v2',
    icon: MapIcon,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'כרטיסים לפי המצב (מה עושים היום?)',
    description: 'הקרוסלה בוחרת ומסדרת את הכרטיסים לפי המצב: "הליכה + כוח" חכם דרך גינת כושר קרובה (לפי הצעדים שנשארו להיום והסטים שנשארו לשבוע, נעלם כשאין גינה קרובה), "אימון מלא בפארק" בעיקר ביום כוח, "מסלול + עצירות" רק ליד מסלול עם עצירות. כל כרטיס עם שורה קצרה שמסבירה למה. גם "תחנות כוח" בהליכה חופשית עובר להליכה החכמה. כבוי = כמו היום.',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_route_direction_adapt',
    icon: RouteIcon,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'התאמת כיוון המסלול',
    description: 'מסלול מעגלי: אם בתחילת ההליכה (60–150 מ׳) הולכים בכיוון ההפוך — סדר העצירות מתהפך + הודעה קצרה. חץ כיוון בנקודת ההתחלה עד שמתחילים ללכת. מסלול חד-כיווני לא מתהפך. כבוי = כמו היום.',
    parentKey: 'enable_hybrid_slots',
  },
  {
    key: 'enable_no_auto_strength_level',
    icon: Dumbbell,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    title: 'אין רמת כוח בלי שאלון',
    description: 'משתמש שלא מילא את שאלון הכוח לא מקבל רמה או תוכנית: לא באונבורדינג (גם לא מתשובת "רמת כושר" או בחירת שרירים), ולא אחרי אימון כוח (היסטוריה ו-XP נשמרים כרגיל). משתמשים קיימים לא משתנים. במסך הסיכום כרטיס הרמה מוסתר למשתמשים האלה. ⚠️ להפעיל רק אחרי בדיקת שטח. כבוי = כמו היום.',
  },
  // OUT AI Phase 0 (18.10.2026) — the server enforces these (src/lib/ai/), the panel only flips them.
  {
    key: 'ai_coach_enabled',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'מאמן AI (מתג ראשי)',
    description: 'קלי AI בצ׳אט ובמסך הבית למשתמשים עם הרשאה. כבוי = אין שום קריאה לספק ה-AI, לאף משתמש (כולל מנהלים). התקציב היומי ומתג החירום נמצאים ב-app_config/ai.',
  },
  {
    key: 'ai_coach_free_for_all',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'AI חינם לכולם (השקה)',
    description: '⚠️ דלוק = כל משתמש בוגר מקבל AI, וזה עולה כסף. כבוי = רק משתמשים עם הרשאה פעילה (entitlements). פועל רק כשהמתג הראשי דלוק.',
  },
  {
    key: 'coach_note_llm',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'הערת מאמן מ-AI',
    description: 'הערת המאמן אחרי אימון נכתבת על ידי ה-AI במקום התבנית. עדיין לא מחובר. פועל רק כשהמתג הראשי דלוק.',
  },
  {
    key: 'ai_coach_schedule_advisor',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — יועץ הלו״ז',
    description: 'קלי ממליץ על שבוע ועל האימון של היום לפי אותם חוקים של בונה הלו״ז (קריאה בלבד, בלי לשנות לו״ז), רואה אימונים שפוספסו, ולא מציע לבנות את האימון של היום אם הוא כבר בוצע. כבוי = כמו היום. פועל רק כשהמתג הראשי דלוק.',
    parentKey: 'ai_coach_enabled',
  },
  {
    key: 'ai_coach_phase2',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — שלב 2',
    description: 'כפתורי תשובה מהירה לפי המצב (שעה, אימון היום, חזרה מהפסקה, מזג אוויר) ורמזים מתחלפים בשורת הכתיבה; תשובות על האפליקציה מתוך מאגר ידע; שינוי לו״ז מהצ׳אט עם כרטיס אישור (שום דבר לא נשמר בלי לחיצה של המשתמש); תיוג נושאי שאלות בסקירה היומית + "נושאים מובילים" במסך שיחות קלי. כבוי = כמו היום. פועל רק כשהמתג הראשי דלוק.',
    parentKey: 'ai_coach_enabled',
  },
  {
    key: 'weather_enabled',
    icon: MapIcon,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'מזג אוויר',
    description: 'צ׳יפ מזג אוויר במסך הבית + אימונים שמתאימים את עצמם: גשם → אימון בבית, חום → קצר יותר עם יותר מנוחה, קור → חימום ארוך יותר. ⚠️ ה-API החינמי (Open-Meteo) מיועד לשימוש לא-מסחרי — לפרודקשן צריך מפתח בתשלום או השירות המטאורולוגי. כבוי = כמו היום.',
  },
  {
    key: 'weather_admins_only',
    icon: ShieldAlert,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'מזג אוויר — מנהלים בלבד (בדיקה)',
    description: 'דלוק = מזג האוויר מופיע רק לסופר-אדמינים (לבדיקה על החשבון שלך). כבוי = לכל המשתמשים. פועל רק כשמזג אוויר דלוק.',
    parentKey: 'weather_enabled',
  },
  // Unified Kelly, phase 1 (18.10.2026).
  {
    key: 'kelly_unified_v1',
    icon: Star,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'קלי אחד (AI + צוות בשיחה אחת)',
    description: 'שיחה אחת עם קלי לכל משתמש: תשובות AI, תשובות הצוות (מסך "קלי · ממתינים למענה" בפאנל), הודעת הפתיחה והעברות לצוות. משתמשים בלי AI (קטינים, בלי הרשאה, תקציב/מגבלה) מקבלים את אותו מסך במצב "הצוות יענה כאן". ⚠️ להריץ קודם את סקריפט ההעברה של הודעות התמיכה הישנות. כבוי = כמו היום (קלי AI נפרד + צ׳אט קלי בהודעות).',
  },
  // Kelly phase 3 (19.10.2026).
  {
    key: 'ai_coach_proactive',
    icon: Star,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'קלי — הודעות יזומות',
    description: 'קלי כותב ראשון, לכל היותר הודעה אחת ביום (ונספרת במכסת ההתראות היומית): שורת בוקר ביום אימון, סיכום שבועי ביום שישי בבוקר, תזכורת לבדיקת רמה, טיפ מזג אוויר, ו"איך היה?" אחרי אימון (קל / בדיוק / קשה). לא בשעות שקט, לא בשבת למי שבחר, לא למי שלא מתאמן כבר כמה ימים (שם רק תזכורות החזרה הקיימות), ובהגדרות אפשר לכבות. דורש "קלי אחד" ו-AI למשתמש. כבוי = כמו היום.',
    parentKey: 'kelly_unified_v1',
  },
  {
    key: 'ai_coach_proactive_llm',
    icon: Star,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'קלי — משפט אישי בהודעה היזומה',
    description: 'משפט אחד בהודעה היזומה נכתב על ידי ה-AI (מודל מהיר וזול, בתוך תקציב ה-AI). כבוי = רק התבנית הקבועה. פועל רק כשהודעות יזומות דלוקות.',
    parentKey: 'ai_coach_proactive',
  },
  {
    key: 'ai_coach_memory',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — זיכרון',
    description: 'פעם בלילה קלי שומר עד 20 עובדות קבועות שהמשתמש סיפר (פציעה או רגישות, אילוצי לו״ז, יעד או אירוע קרוב, העדפות) ומשתמש בהן בשיחה. המשתמש רואה ומוחק אותן במסך "מה קלי זוכר". לא נשמרות אבחנות או מידע רגיש שלא קשור לאימון. כבוי = בלי זיכרון.',
    parentKey: 'ai_coach_enabled',
  },
  // Kelly round 4 (19.10.2026).
  {
    key: 'ai_coach_round4',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — סבב 4 (אירובי, פארקים, מזג אוויר, הדרכה)',
    description: 'קלי בונה הליכה או ריצה (וגם ריצה ובסוף בטן, הליכה ועוד כוח) לפי תוכנית הריצה, ובלי תוכנית ריצה מציע את שאלון הריצה ובינתיים ריצה קלה לפי תחושה או הליכה, עם מסלול מעגלי אם יש מיקום. מוצא 3 גינות כושר קרובות לפי הציוד, יודע את מזג האוויר (לפי מתג מזג האוויר), אומר בכנות כשבבית אין מספיק תוכן ברמה של המשתמש ומציע גינה. "איך משתמשים": הסיור הראשון אפשר להפעיל שוב מההגדרות ומקלי, ומסך "איך משתמשים ושאלות נפוצות" עם חיפוש. כבוי = כמו היום.',
    parentKey: 'ai_coach_enabled',
  },
  // iOS keyboard insets (19.10.2026).
  {
    key: 'enable_keyboard_insets_v1',
    icon: ListChecks,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'מקלדת לא מסתירה את ההקלדה (iPhone)',
    description: 'צ׳אט, חיפוש במפה, שמירת בית/עבודה, ההרשמה וכל הגיליונות עם שדות טקסט עולים מעל המקלדת, השדה שבפוקוס נגלל לאמצע המסך ובלי קפיצות אחרי ההקלדה. מנהלי־על רואים אותו תמיד. כבוי = כמו היום.',
  },
  // Fast startup v1 (19.10.2026).
  {
    key: 'enable_fast_startup_v1',
    icon: ListChecks,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'פתיחה מהירה של האפליקציה',
    description: 'משתמש רשום נכנס ישר לבית בלי לחכות במסך הפתיחה (הבדיקה מול השרת רצה ברקע ומחזירה אותו למקום הנכון אם צריך), האימונים של היום מופיעים מיד מהעותק השמור ומתעדכנים במקום, ותוכניות/ציוד/כותרות נשמרים במכשיר עד 30 דקות. השינוי מגיע למכשיר בפתיחה הבאה. כבוי = כמו היום.',
  },
  // Budget light mode (19.10.2026).
  {
    key: 'enable_budget_light_mode',
    icon: Dumbbell,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'אימון קל כשתקציב הכוח נגמר',
    description: 'כשסטי הכוח של היום או של השבוע כבר נעשו, ההמלצות (הבית, כרטיסי המפה, אימון בפארק וקלי) נותנות אימון כוח קל יותר עם הסבר קצר למה, במקום מתיחות או טבטה של בטן. אימון שהמשתמש בונה בעצמו לא מוגבל בכלל. כבוי = כמו היום.',
  },
  // Route quality v1 (19.10.2026).
  {
    key: 'enable_route_quality_v1',
    icon: RouteIcon,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'איכות מסלולים מעגליים (v1)',
    description: 'מחולל המסלולים המעגליים: נקודות ביניים על רחובות שקטים בלבד, בלי נקודות "עיוורות", בלי פרסות וחזרה על אותו רחוב, בלי מסלולים צרים מדי ובלי חציות לא מסומנות של כבישים ראשיים; פחות קריאות מהשרת; בלי נתונים מומצאים (תאורה, תנועה, ספסלים, דירוג). השוואה לפני/אחרי: ניהול ← מסלולים ← איכות מסלולים. כבוי = כמו היום.',
  },
  // GraphHopper routes (19.10.2026).
  {
    key: 'enable_graphhopper_routes',
    icon: RouteIcon,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'מסלולים מעגליים משרת הניווט שלנו (GraphHopper)',
    description: 'המסלולים המעגליים נבנים בשרת הניווט של OUT (GraphHopper, ישראל) במקום Mapbox: רחובות שקטים, הימנעות ממעברי חצייה לא מסומנים, בלי ענפים מתים, ונבחרים 3 הטובים מתוך 6. כל תקלה או המתנה של יותר מ־2 שניות חוזרת אוטומטית למחולל הנוכחי. דורש שהשרת פרוס ו־GRAPHHOPPER_URL מוגדר ב־Vercel. השוואה: ניהול ← מסלולים ← איכות מסלולים. כבוי = כמו היום.',
  },
  // Loops prefer our routes (19.10.2026).
  {
    key: 'enable_loops_prefer_official',
    icon: RouteIcon,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'מסלולים מעגליים עוברים במסלולים שלנו',
    description: 'כשיש ליד המשתמש מסלולים רשמיים שמיפינו (שאנחנו יודעים את האיכות, הרמה והגובה שלהם), המסלול המעגלי מנסה לעבור עליהם: נקודות ביניים על המסלולים עצמם ועדיפות למסלול שעובר יותר עליהם — בלי לוותר על ספי האיכות ועל המרחק המבוקש. עובד יחד עם "איכות מסלולים מעגליים (v1)" ועם GraphHopper. השוואה: ניהול ← מסלולים ← איכות מסלולים. כבוי = כמו היום.',
  },
  // Generation review (19.10.2026).
  {
    key: 'enable_generation_review',
    icon: ListChecks,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'בקרת איכות לאימונים ולמסלולים שנוצרו',
    description: 'כל אימון או מסלול שהאפליקציה בונה ומציגה (שלישיית הבית, אימונים של קלי, הליכה/ריצה + כוח, אימון מלא בפארק, מסלול + עצירות, מסלולים מעגליים, ריצות מתוכננות) נשמר בתקציר (בלי שמות, אזור בדיוק של כ-5 ק״מ, בלי תחילת וסוף המסלול) ל-60 יום. כל לילה נבדקים חוקים קבועים (פארק שהמסלול לא עובר בו, בלי עצירת כוח, רק דחיפה, 0 דקות, סוג פעילות שגוי, איכות מסלול ועוד) והתוצאות במסך "בקרת אימונים ומסלולים". כפתור "דווח על בעיה" במסכי הסקירה. מנהלי־על תמיד נכללים. אחוז דגימה: app_config/generation_review.samplePct (ברירת מחדל 100). כבוי = כמו היום.',
  },
  {
    key: 'enable_generation_review_llm',
    icon: Star,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'בקרת אימונים — חוות דעת AI',
    description: 'בבדיקה הלילית, ה-AI (Sonnet) עובר גם על מדגם קטן (עד 20 ביום) ושואל "האם זה הגיוני למשתמש הזה", ומחזיר הערה בעברית. בתוך תקציב ה-AI ועם תקרה יומית משלו. כבוי = רק החוקים הקבועים.',
    parentKey: 'enable_generation_review',
  },
];

const FLAG_KEYS = FLAG_CARDS.map((c) => c.key);

// ============================================================================
// FOUNDATION EXERCISES — system_config/foundation_exercises
// Admin-curated foundation exercise list per package. Display/save only —
// no user-facing code reads this doc yet (see build brief "Slice 2a").
// ============================================================================

type FoundationPackageKey = 'pull' | 'push' | 'legs' | 'core';

type FoundationLists = Record<FoundationPackageKey, string[]>;

const EMPTY_FOUNDATION_LISTS: FoundationLists = { pull: [], push: [], legs: [], core: [] };

const FOUNDATION_PACKAGES: { key: FoundationPackageKey; nameHe: string }[] = [
  { key: 'pull', nameHe: 'משיכה' },
  { key: 'push', nameHe: 'דחיפה' },
  { key: 'legs', nameHe: 'רגליים' },
  { key: 'core', nameHe: 'ליבה' },
];

/**
 * Same source as useFeatureFlags.ts's SAFE_DEFAULTS (FIRESTORE_FLAG_DEFAULTS,
 * feature-flag-defs.ts) — not a separately hardcoded copy. Used both as the initial
 * form state (before any read completes) and, via resolveLoadedFlags, as the
 * per-field fallback when the document is missing a key.
 */
const INITIAL_FLAGS: FlagState = Object.fromEntries(
  FLAG_KEYS.map((k) => [k, FIRESTORE_FLAG_DEFAULTS[k]]),
) as unknown as FlagState;

// ============================================================================
// TOGGLE COMPONENT
// ============================================================================

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        enabled ? 'bg-cyan-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ============================================================================
// FLAG CARD
// ============================================================================

function FlagCard({
  config,
  enabled,
  onChange,
  disabled,
  parentDisabled,
}: {
  config: FlagCardConfig;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  /** True when this card's parentKey flag is off — greys the card out. */
  parentDisabled: boolean;
}) {
  const Icon = config.icon;
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 transition-opacity ${
        parentDisabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon size={18} className={config.iconColor} />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-sm">{config.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{config.description}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {enabled ? '● פעיל' : '○ כבוי'}
              </span>
              {parentDisabled && (
                <span className="text-[10px] text-slate-400">לא פעיל — תלוי ב"מה עושים היום?"</span>
              )}
            </div>
          </div>
        </div>
        <Toggle enabled={enabled} onChange={onChange} disabled={disabled || parentDisabled} />
      </div>
    </div>
  );
}

// ============================================================================
// FOUNDATION PACKAGE LIST — add/remove exercises for one package via the
// existing single-value ExerciseAutocomplete: the picker's own selectedId
// always stays '' (an "add new" control), and the chosen id is appended to
// this package's list in the parent's state instead of controlling the
// picker itself.
// ============================================================================

function FoundationPackageList({
  nameHe,
  exercises,
  selectedIds,
  onAdd,
  onRemove,
  disabled,
}: {
  nameHe: string;
  exercises: Exercise[];
  selectedIds: string[];
  onAdd: (exerciseId: string) => void;
  onRemove: (exerciseId: string) => void;
  disabled: boolean;
}) {
  const getName = (id: string) => {
    const ex = exercises.find((e) => e.id === id);
    if (!ex) return id;
    return getLocalizedText(ex.name, 'he') || getLocalizedText(ex.name, 'en') || id;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-bold text-slate-900 text-sm mb-3">{nameHe}</h3>

      {selectedIds.length === 0 ? (
        <p className="text-xs text-slate-400 mb-3">אין תרגילים עדיין</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {selectedIds.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2"
            >
              <span className="text-sm text-slate-800 truncate">{getName(id)}</span>
              <button
                type="button"
                onClick={() => onRemove(id)}
                disabled={disabled}
                aria-label={`הסר ${getName(id)}`}
                className="text-red-500 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ExerciseAutocomplete
        exercises={exercises}
        selectedId=""
        onChange={(exerciseId) => onAdd(exerciseId)}
        placeholder="הוסף תרגיל..."
      />
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function SystemSettingsPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  const [flags, setFlags] = useState<FlagState>(INITIAL_FLAGS);
  const [flagsLoading, setFlagsLoading] = useState(true);
  // True when the initial getDoc failed — `flags` is then defaults-only, NOT a real
  // read, so Save must be blocked until a successful reload (see resolveLoadedFlags).
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Foundation exercises (system_config/foundation_exercises) ────────────────
  // Independent doc, independent load/save from the flags above.
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [foundationLists, setFoundationLists] = useState<FoundationLists>(EMPTY_FOUNDATION_LISTS);
  const [foundationLoading, setFoundationLoading] = useState(true);
  const [foundationLoadFailed, setFoundationLoadFailed] = useState(false);
  const [foundationSaving, setFoundationSaving] = useState(false);
  const [foundationSavedAt, setFoundationSavedAt] = useState<Date | null>(null);
  const [foundationError, setFoundationError] = useState<string | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/login');
        return;
      }
      try {
        const roleInfo = await checkUserRole(user.uid, user.email);
        if (!roleInfo.isSuperAdmin) {
          // Non-super-admins cannot access this page
          router.replace('/admin');
          return;
        }
        setIsSuperAdmin(true);
        setCurrentUid(user.uid);
      } catch {
        router.replace('/admin');
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  // ── Load current flags ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSuperAdmin) return;
    getDoc(doc(db, 'system_config', 'feature_flags'))
      .then((snap) => {
        const result: LoadResult = { status: 'ok', data: snap.exists() ? snap.data() : undefined };
        const { flags: loaded, loadFailed: failed } = resolveLoadedFlags(result, FLAG_KEYS, FIRESTORE_FLAG_DEFAULTS);
        setFlags(loaded as FlagState);
        setLoadFailed(failed);
      })
      .catch((e) => {
        console.error('[SystemSettings] Failed to load flags:', e);
        const { flags: loaded, loadFailed: failed } = resolveLoadedFlags({ status: 'error' }, FLAG_KEYS, FIRESTORE_FLAG_DEFAULTS);
        setFlags(loaded as FlagState);
        setLoadFailed(failed);
        setError('טעינת ההגדרות נכשלה — לא ניתן לשמור עד לרענון מוצלח של הדף.');
      })
      .finally(() => setFlagsLoading(false));
  }, [isSuperAdmin]);

  // ── Load foundation exercises + exercise catalog ──────────────────────────────
  useEffect(() => {
    if (!isSuperAdmin) return;
    Promise.all([
      getDoc(doc(db, 'system_config', 'foundation_exercises')),
      getAllExercises(),
    ])
      .then(([snap, exercisesData]) => {
        setExercises(exercisesData);
        if (snap.exists()) {
          const data = snap.data();
          setFoundationLists({
            pull: Array.isArray(data.pull) ? data.pull : [],
            push: Array.isArray(data.push) ? data.push : [],
            legs: Array.isArray(data.legs) ? data.legs : [],
            core: Array.isArray(data.core) ? data.core : [],
          });
        }
        // Doc doesn't exist yet → keep the empty-state defaults (nothing curated yet).
      })
      .catch((e) => {
        console.error('[SystemSettings] Failed to load foundation exercises:', e);
        setFoundationLoadFailed(true);
        setFoundationError('טעינת תרגילי הבסיס נכשלה — לא ניתן לשמור עד לרענון מוצלח של הדף.');
      })
      .finally(() => setFoundationLoading(false));
  }, [isSuperAdmin]);

  const addFoundationExercise = (pkg: FoundationPackageKey, exerciseId: string) => {
    if (!exerciseId) return;
    setFoundationLists((prev) =>
      prev[pkg].includes(exerciseId) ? prev : { ...prev, [pkg]: [...prev[pkg], exerciseId] }
    );
  };

  const removeFoundationExercise = (pkg: FoundationPackageKey, exerciseId: string) => {
    setFoundationLists((prev) => ({ ...prev, [pkg]: prev[pkg].filter((id) => id !== exerciseId) }));
  };

  const handleSaveFoundationExercises = async () => {
    // foundationLoadFailed: current state came from defaults, not a real read —
    // writing it would silently clobber whatever is actually in Firestore.
    if (!currentUid || foundationLoadFailed) return;
    setFoundationSaving(true);
    setFoundationError(null);
    try {
      await setDoc(
        doc(db, 'system_config', 'foundation_exercises'),
        {
          ...foundationLists,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setFoundationSavedAt(new Date());
    } catch (e) {
      console.error('[SystemSettings] Save foundation exercises failed:', e);
      setFoundationError('שמירה נכשלה. נסה שוב.');
    } finally {
      setFoundationSaving(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    // loadFailed: the current `flags` state came from defaults, not a real read —
    // writing it would silently clobber whatever is actually in Firestore.
    if (!currentUid || loadFailed) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'system_config', 'feature_flags'),
        {
          ...flags,
          updated_at: serverTimestamp(),
          updated_by: currentUid,
        },
        { merge: true },
      );
      setSavedAt(new Date());
    } catch (e) {
      console.error('[SystemSettings] Save failed:', e);
      setError('שמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / guard states ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">בודק הרשאות...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Settings size={20} className="text-slate-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">הגדרות מערכת</h1>
        </div>
        <p className="text-slate-500 text-sm">
          שליטה בזמן אמת על פיצ׳רים באפליקציה. מנהלי-על עוקפים את כל ההגדרות אוטומטית לצורך בדיקות.
        </p>
      </div>

      {/* Super Admin Notice */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>מנהל-על:</strong> אתה רואה את כל הפיצ׳רים ללא קשר לדגלים. הגדרות אלו משפיעות על משתמשים רגילים בלבד.
        </p>
      </div>

      {flagsLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
        </div>
      ) : (
        <div className="space-y-4">

          {FLAG_CARDS.map((config) => (
            <FlagCard
              key={config.key}
              config={config}
              enabled={flags[config.key]}
              onChange={(v) => setFlags((f) => ({ ...f, [config.key]: v }))}
              disabled={saving}
              parentDisabled={!!config.parentKey && !flags[config.parentKey]}
            />
          ))}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || loadFailed}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <Save size={16} />
                  שמור שינויים
                </>
              )}
            </button>

            {savedAt && !saving && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <CheckCircle2 size={16} />
                נשמר בהצלחה
              </div>
            )}
          </div>
        </div>
      )}

      {/* Foundation Exercises — separate system_config doc, independent load/save */}
      <div className="mt-10">
        <div className="mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
            <ListChecks size={18} className="text-cyan-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">תרגילי בסיס לפי חבילה</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              רשימה קצרה ומאוצרת של תרגילי בסיס לכל חבילה. לתצוגה בלבד — אינה מוצגת למשתמשים ואינה
              משפיעה על שום מנוע היום.
            </p>
          </div>
        </div>

        {foundationLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {FOUNDATION_PACKAGES.map((pkg) => (
              <FoundationPackageList
                key={pkg.key}
                nameHe={pkg.nameHe}
                exercises={exercises}
                selectedIds={foundationLists[pkg.key]}
                onAdd={(exerciseId) => addFoundationExercise(pkg.key, exerciseId)}
                onRemove={(exerciseId) => removeFoundationExercise(pkg.key, exerciseId)}
                disabled={foundationSaving}
              />
            ))}

            {foundationError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                {foundationError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveFoundationExercises}
                disabled={foundationSaving || foundationLoadFailed}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
              >
                {foundationSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    שומר...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    שמור תרגילי בסיס
                  </>
                )}
              </button>

              {foundationSavedAt && !foundationSaving && (
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 size={16} />
                  נשמר בהצלחה
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
