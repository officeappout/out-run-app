'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  Settings, Footprints, Users, Trophy, ShieldAlert, Save, CheckCircle2, CalendarDays,
  Map as MapIcon, Dumbbell, Route as RouteIcon, Star, FlaskConical, ListChecks, X, MessageCircle, Bot, Pointer, Languages, MapPinned, Flame, QrCode, Tv, MoreHorizontal, Mountain, Share2,
  type LucideIcon,
} from 'lucide-react';
import { FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';
import { resolveLoadedFlags, type LoadResult } from './resolve-loaded-flags';
import ExerciseAutocomplete from '@/components/admin/ExerciseAutocomplete';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import AppVersionAdminCard from '@/features/app-version/components/AppVersionAdminCard';

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
  progression_rules_from_admin: boolean;
  enable_league_aggregates: boolean;
  enable_home_v2: boolean;
  enable_calm_return_v1: boolean;
  enable_shabbat_free_streak: boolean;
  enable_streak_shields: boolean;
  enable_streak_pushes: boolean;
  enable_streak_celebrations_v1: boolean;
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
  ai_coach_smart_routing: boolean;
  ai_coach_fast_thinking: boolean;
  ai_coach_model_routing_all_users: boolean;
  ai_coach_request_fidelity: boolean;
  enable_keyboard_insets_v1: boolean;
  enable_fast_startup_v1: boolean;
  enable_budget_light_mode: boolean;
  enable_route_quality_v1: boolean;
  enable_graphhopper_routes: boolean;
  enable_loops_prefer_official: boolean;
  enable_cycling_fixes_v1: boolean;
  enable_route_pref_shade: boolean;
  enable_route_time_aware: boolean;
  enable_route_shade_tag: boolean;
  enable_loops_prefer_marked_trails: boolean;
  enable_levelup_v2: boolean;
  enable_skill_cap_true_skills: boolean;
  enable_adaptive_reps_v1: boolean;
  enable_goal_presence_v1: boolean;
  enable_unified_search: boolean;
  enable_shared_workout_preview_v1: boolean;
  enable_entry_whatnow_v1: boolean;
  enable_entry_single_choice_v1: boolean;
  enable_home_two_cards_v1: boolean;
  enable_run_done_state_v1: boolean;
  enable_generation_review: boolean;
  enable_generation_review_llm: boolean;
  enable_org_access_code_prompt: boolean;
  enable_entry_globe_v1: boolean;
  enable_jit_identity_v1: boolean;
  enable_entry_intro_v1: boolean;
  enable_strength_quiz_hint_v2: boolean;
  enable_onboarding_step_funnel: boolean;
  enable_landing_real_fallback: boolean;
  enable_run_player_drawer_v1: boolean;
  enable_haptics_v1: boolean;
  enable_week_builder_v1: boolean;
  enable_map_polish_v1: boolean;
  enable_map_surface_filter_v1: boolean;
  enable_destination_planner_v1: boolean;
  enable_push_measure_all: boolean;
  enable_demo_users: boolean;
  demo_life_llm: boolean;
  enable_ai_testers: boolean;
  demo_kelly: boolean;
  enable_i18n: boolean;
  enable_locale_en: boolean;
  enable_locale_ru: boolean;
  enable_locale_de: boolean;
  enable_content_locale: boolean;
  push_locale_v1: boolean;
  hide_he_only_onboarding_steps: boolean;
  enable_app_session_signal: boolean;
  enable_osm_attribution: boolean;
  admin_ai_assistant_v1: boolean;
  enable_city_mapping_hub: boolean;
  pyramid_injection_off: boolean;
  enable_hide_route_connectors: boolean;
  enable_scoped_official_routes: boolean;
  enable_swap_fixes_v1: boolean;
  enable_location_gate_v1: boolean;
  enable_strength_drawer_v1: boolean;
  enable_wide_player_v1: boolean;
  enable_site_qr_links: boolean;
  enable_history_summary_parity: boolean;
  enable_progress_hub_v2: boolean;
  enable_workout_insights_v1: boolean;
  enable_group_fixes_v1: boolean;
  enable_together_layer_v1: boolean;
  enable_tv_mode_v1: boolean;
  enable_overview_more_menu_v1: boolean;
  enable_hill_finder_v1: boolean;
  enable_run_drawer_from_me_v1: boolean;
  enable_map_tutorial_v1: boolean;
  enable_park_live_v2: boolean;
  enable_commute_v2_player_v1: boolean;
  enable_workout_coach_note_v1: boolean;
  enable_method_info_sheet_v1: boolean;
  enable_feature_info_sheets_v1: boolean;
  enable_combo_flow_v1: boolean;
  enable_home_after_v1: boolean;
  enable_share_router_v1: boolean;
  enable_workout_post_v1: boolean;
  enable_combo_generator_v1: boolean;
  enable_home_progress_slot_v1: boolean;
  enable_where_to_train_v1: boolean;
  enable_place_workouts_v1: boolean;
  enable_flame_tiers_v1: boolean;
  enable_workout_tutorial_v1: boolean;
  enable_equipment_scan_v1: boolean;
  enable_pilot_decisions_v1: boolean;
  enable_pilot_ah_v1: boolean;
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
    key: 'enable_shabbat_free_streak',
    icon: Dumbbell,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'שבת לא שוברת רצף',
    description: 'לכל המשתמשים: שבת בלי פעילות לא שוברת את הרצף ולא מוסיפה לו יום. שבת עם פעילות נספרת כרגיל. כבוי = כמו היום',
  },
  {
    key: 'enable_streak_shields',
    icon: Dumbbell,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'מגן רצף',
    description: 'כל 7 ימי רצף מקבלים מגן אחד (עד 2). ביום שלא נסגר המגן נכנס לפעולה לבד והרצף נשמר. כבוי = כמו היום',
  },
  {
    key: 'enable_streak_pushes',
    icon: Dumbbell,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'פושים של רצף',
    description: 'הצלת רצף ב-19:30 (רצף 2+) ושוב ב-21:15 (רצף 7+, אם הראשון לא נפתח), "הרצף נעצר" ב-10:00 (רצף 7+), ואבני דרך ב-20:00 למי שלא ראה באפליקציה. דורש פריסה של streakRescueScheduler',
  },
  {
    key: 'enable_streak_celebrations_v1',
    icon: Dumbbell,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: 'חגיגות רצף',
    description: 'מסך חגיגה כשיום הרצף נסגר: יום נשמר, שבוע מלא, אבני דרך 7, 30 ו-100, מגן שנכנס לפעולה וחזרה אחרי הפסקה. פעם ביום לכל היותר, אחרי מסך העלייה ברמה או בכניסה לבית. מנהלי־על רואים אותו תמיד',
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
  {
    key: 'progression_rules_from_admin',
    icon: Dumbbell,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    title: 'התקדמות לפי הגדרות הפאנל',
    description: 'אחרי אימון כוח, אחוז ההתקדמות מחושב לפי מה שהוגדר ב"מנהל התקדמות": כללים לפי תוכנית ורמה (רמה מעל האחרונה שהוגדרה = האחרונה), בונוס יעד פעם אחת לכל יעד ברמה (היום: בכל אימון), בונוס אימון ראשון ברמה, בונוס התמדה חודשי, בונוס RPE (כשנרשם), ותקרת סטים. ⚠️ משנה את קצב ההתקדמות למשתמשים. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום (ברירות מחדל קבועות).',
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
  // Kelly model routing (23.10.2026).
  {
    key: 'ai_coach_smart_routing',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — מודל חכם לשאלות מורכבות',
    description: 'הודעות פשוטות (שלום, תודה, "מה יש לי היום", "מה הרמה שלי") נשארות על המודל המהיר והזול. בקשות מורכבות — בניית אימון או שינוי שלו, שילובים ("מתח ופלאנץ׳", "ריצה ובסוף בטן"), טבטה / EMOM / AMRAP / משהו עצים או קצר, תכנון השבוע ושינוי לו״ז, הודעה ארוכה עם כמה בקשות, תלונה או תיקון ("לא קשור", "למה", "טעית") והמשך של שיחה כזו — עוברות למודל החכם (Sonnet), שחושב לפני שהוא עונה. ⚠️ תור במודל החכם יקר בערך פי 20 מתור במודל המהיר. כבוי = כמו היום (הכול על המודל המהיר).',
    parentKey: 'ai_coach_enabled',
  },
  {
    key: 'ai_coach_fast_thinking',
    icon: Star,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — המודל המהיר חושב לפני שעונה',
    description: 'גם בתשובות של המודל המהיר (Haiku) קלי חושב קצת לפני התשובה, במקום לענות מיד. תשובות טבעיות יותר, קצת יותר איטי ויקר (עדיין זול מאוד). כבוי = כמו היום.',
    parentKey: 'ai_coach_enabled',
  },
  {
    key: 'ai_coach_model_routing_all_users',
    icon: ShieldAlert,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — מודל חכם / חשיבה: לכל המשתמשים',
    description: 'כבוי = שני המתגים "מודל חכם לשאלות מורכבות" ו"המודל המהיר חושב" פועלים רק לסופר-אדמינים (לבדיקה על החשבון שלך). דלוק = לכל המשתמשים עם AI. בשימוש בקלי, כל תור נרשם בעלויות לפי המודל (ai_coach_chat_fast / ai_coach_chat_smart).',
    parentKey: 'ai_coach_enabled',
  },
  // Kelly owner chat review fixes (23.10.2026).
  {
    key: 'ai_coach_request_fidelity',
    icon: ListChecks,
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-500',
    title: 'קלי — נאמן לבקשה',
    description: 'קלי שואל איפה מתאמנים כשלא נאמר (במקום לבנות לבית), בודק את השבוע שהמשתמש הציע לפי מנוחה ונפח ומציע שיפורים קטנים (במקום לפסול כי זה לא הסידור שלו), אומר בכנות כשהבונה בחר מבנה אחר מטבטה / EMOM שביקשו, אומר שספירת הסטים השבועית לפי אזור נמצאת רק בטלפון, ומשבח רק מה שהמספרים מראים. כבוי = כמו היום.',
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
  // "Shadiest route" option (RC6, 21.10.2026).
  {
    key: 'enable_route_pref_shade',
    icon: RouteIcon,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-700',
    title: 'אפשרות "המסלול המוצל ביותר"',
    description: 'שורה חדשה בהגדרות הנוספות של ריצה חופשית: "המסלול המוצל ביותר". השרת מבקש מ-GraphHopper 6 מסלולים ומדרג אותם לפי מפות הצל של הטכניון, ב-13 הערים שיש להן שכבה. בשאר הערים חוזרים 3 המסלולים הרגילים. מוצג רק כש"מסלולים מעגליים משרת הניווט שלנו" דלוק. כבוי = כמו היום.',
  },
  // Cycling fixes v1 (22.10.2026).
  {
    key: 'enable_cycling_fixes_v1',
    icon: RouteIcon,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-700',
    title: 'תיקוני רכיבה באופניים (v1)',
    description: 'מתקן כמה פערים ברכיבה: מסלולים מעורבים (הליכה, ריצה ואופניים) מוצעים גם לרוכבים; לולאות "מעדיפות מסלולים שלנו" נצמדות רק למסלולים מאותה פעילות; מהירות אופניים אחת בכל חישובי הזמן והקלוריות של מסלולים חדשים; רכיבה ביעד (Commute) ובתכנון מקטעים נשארת רכיבה; ורכיבה שהתחילה מהמפה מוצגת ונשמרת בהיסטוריה כרכיבה ולא כריצה. ה-XP לא משתנה (אותה נוסחה כמו ריצה). כבוי = כמו היום.',
  },
  // Time-aware route preference (RC7, 21.10.2026).
  {
    key: 'enable_route_time_aware',
    icon: RouteIcon,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-700',
    title: 'מסלול לפי שעה: צל ביום, תאורה בלילה',
    description: 'בשעות חמות ושמשיות (מאי עד אוקטובר, שמש גבוהה מ-25°) השרת מבקש 6 מסלולים ומדרג אותם לפי הצל בשעה הנוכחית. אחרי השקיעה הוא מדרג לפי רחובות מוארים. בשאר השעות, ובערים בלי שכבת צל לפי שעה או שכבת תאורה, חוזרים 3 המסלולים הרגילים. עובד רק כש"מסלולים מעגליים משרת הניווט שלנו" דלוק. "המסלול המוצל ביותר", כשנבחר, גובר. כבוי = כמו היום.',
  },
  // Route shade tag (22.10.2026).
  {
    key: 'enable_route_shade_tag',
    icon: RouteIcon,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-700',
    title: 'תגית "מוצל %" על מסלולים',
    description: 'על כרטיס מסלול: "🌳 מוצל X%" — רק כשמפת הצל של הטכניון מכסה לפחות חצי מהמסלול (אחרת אין תגית, אף פעם לא "0%"). בפרטי המסלול: שורת צל עם האחוז הכללי, "עכשיו · בצהריים · אחה״צ" כשיש לעיר שכבת צל לפי שעה (פרופיל קיץ), ו"מואר בלילה X%" כשיש נתוני תאורה. שורה בלי נתונים לא מוצגת. מסלולים שמורים נקראים מ-route_scores דרך השרת; מסלולים מעגליים משרת הניווט מקבלים את האחוז מהשרת. לא משנה דירוג. כבוי = כמו היום.',
  },
  // Loops prefer marked trails (22.10.2026).
  {
    key: 'enable_loops_prefer_marked_trails',
    icon: RouteIcon,
    iconBg: 'bg-lime-50',
    iconColor: 'text-lime-700',
    title: 'מסלולים מעגליים מעדיפים שבילים מסומנים',
    description: 'ריצה והליכה מחוץ לערים הגדולות: מסלול מעגלי מנסה להישאר על שבילים, דרכי עפר ושבילי טיול מסומנים (גם כאלה בלי שם, שאנחנו לא מציגים כמסלולים) ופחות על רחובות סלולים. השרת מוריד מעט את הדירוג של רחובות שאינם חלק משביל מסומן — אף פעם לא מעלה גישה אסורה ולא משנה את המרחק המבוקש, והמסלולים שעוברים יותר על שבילים מקבלים יתרון קל בדירוג. עובד רק עם GraphHopper. פרטים והמלצת בנייה מחדש של הגרף: docs/routes/MARKED-TRAILS-GENERATOR.md. כבוי = כמו היום.',
  },
  // Level-up v2 (22.10.2026).
  {
    key: 'enable_levelup_v2',
    icon: Trophy,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-700',
    title: 'מסך עליית אחוזים חדש',
    description: 'אחרי אימון כוח: התוצאה מופיעה מיד (מחושבת במכשיר באותן נוסחאות של השמירה), השמירה רצה ברקע ("שומר…" ← "נשמר") ואם המספר השמור שונה הוא מתעדכן בשקט. מספר אחד = בדיוק מה שנשמר (בתוכנית-אם: הממוצע השמור של תתי-התוכניות). טבעת בלבד, הבונוסים מופיעים אחד אחרי השני ודוחפים אותה; עלייה ברמה = חגיגה עם הרמה החדשה. אימון התאוששות / בלי אחוזים / תקלה: מצב רגוע מיד, הכפתורים פעילים מיד. מנהלי-על רואים אותו גם כשהוא כבוי. כבוי = המסך הקיים.',
  },
  // Adaptive progression 3d (22.10.2026).
  {
    key: 'enable_skill_cap_true_skills',
    icon: Dumbbell,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    title: 'תקרת 5 חזרות רק לסקילים אמיתיים',
    description: 'תקרת 5 חזרות ו-12 שניות החזקה רק לסקילים אמיתיים: מתח יד אחת, פרונט/בק לבר, פלאנץ׳, שכיבות סמיכה בעמידת ידיים, עליית כוח, דגל אנושי ופיסטול. תרגיל רגיל (מתח, מקבילים, שכיבות) ברמה אחת מעל המתאמן מקבל 3-6 חזרות, ושתי רמות ומעלה 2-5 (במקום 1-3), כך שיעד כמו "10 מתח" בר-השגה. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Adaptive progression 3a (22.10.2026).
  {
    key: 'enable_adaptive_reps_v1',
    icon: Dumbbell,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    title: 'התקדמות כפולה לכל תרגיל',
    description: 'כל תרגיל זוכר איך הלך בפעם הקודמת: כל הסטים הגיעו ליעד ⇐ +1 חזרה (או +5 שניות בהחזקה) עד ראש הטווח. בראש הטווח פעמיים ברצף ⇐ +1 סט, שלוש פעמים ⇐ המערכת מעדיפה את הווריאציה הקשה הבאה. פספוס ⇐ אותו יעד, פספוס פעמיים ברצף ⇐ צעד אחורה (ובמינימום, וריאציה קלה יותר). אימון דילואד, חום, חזרה רגועה, תרגיל שהוחלף וחימום לא נספרים. סט שנשמר בלי לגעת בבורר נחשב "הגיע ליעד" רק כשהוצע ראש הטווח. המיקום בתוך הטווח קבוע (לא אקראי). אין בחירת וריאציה למשתמש, הוא עדיין יכול להחליף תרגיל. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Adaptive progression 3e (22.10.2026).
  {
    key: 'enable_goal_presence_v1',
    icon: Trophy,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    title: 'תרגילי יעד: נוכחות, רמפה וחגיגה',
    description: 'תרגיל יעד שלא הופיע בשני האימונים האחרונים של התחום שלו מקבל עדיפות קטנה בבחירה (לא מוכנס בכוח, ולא באימון קל, דילואד, חום או התאוששות). היעד באימון נקבע לפי הביצוע: הכי טוב בפעם הקודמת (+1 חזרה או +5 שניות), אף פעם לא מעל היעד, בלי "30% מהיעד" בהתחלה. כשסט מגיע ליעד: חגיגה קטנה באימון ("הגעת ליעד!") ושורה חגיגית בסיכום, פעם אחת לכל יעד באימון. בונוס ה-% פעם אחת ליעד מגיע מ"התקדמות לפי הגדרות הפאנל". מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Unified search (19.10.2026).
  {
    key: 'enable_unified_search',
    icon: ListChecks,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'חיפוש מאוחד',
    description: 'מסך החיפוש מחפש בבת אחת בתרגילים, גינות, מסלולים, אנשים וקבוצות, אירועים, מאמרים ועזרה (התוכן מ"תוכן ושאלות" בניהול): צ׳יפים עם מספרים, "הכל" מקובץ, חיפושים אחרונים, הצעות לפי המצב, "אולי חיפשת" ושאל את קלי. ספריית התרגילים תחת "תרגילים" נשארת בדיוק כמו היום. בחיפוש במפה נוספים צ׳יפים מהירים ושורת "חיפוש בכל האפליקציה". מנהלי־על רואים אותו תמיד. כבוי = כמו היום.',
  },
  // Shared strength workout link (22.10.2026).
  {
    key: 'enable_shared_workout_preview_v1',
    icon: ListChecks,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'קישור אימון משותף: תצוגה כמו באפליקציה',
    description: 'קישור לאימון כוח משותף מציג את אותה רשימת תרגילים כמו תצוגת האימון באפליקציה (חימום, סופרסטים, ציוד ושרירים), נבנית מהאימון ששותף. אם חסר מידע באימון המשותף — התצוגה הנוכחית. כבוי = כמו היום.',
  },
  // Entry flow v2 — step 2 on the map (20.10.2026).
  {
    key: 'enable_entry_whatnow_v1',
    icon: ListChecks,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כניסה: מה בא לך עכשיו + הדרכה',
    description: 'אחרי אישור הבית: מגירה עם 3 אפשרויות לפי המצב, ובועות אצבע במסלול הראשון.',
  },
  {
    key: 'enable_entry_single_choice_v1',
    icon: ListChecks,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כניסה: שאלה אחת בלבד',
    description: 'מי שכבר ענה (או סגר) את "מה בא לך עכשיו?" במפה לא יקבל גם את "מה הדבר הראשון?" בבית. כבוי = כמו היום (המגירה בבית לכל מי שלא התאמן).',
  },
  // Home two start cards (22.10.2026).
  {
    key: 'enable_home_two_cards_v1',
    icon: ListChecks,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'בית: שני כרטיסי התחלה + "מוכן לנסות לרוץ?"',
    description: 'משתמש בלי תוכנית רואה שני כרטיסים: "כוח" ו"הליכה וריצה" (שאלון אחד להליכה או לריצה). מי שהלך 4 שבועות ברצף מקבל כרטיס אחד "מוכן לנסות לרוץ?" (נסגר ל-30 יום עם "לא עכשיו"). כבוי = כמו היום.',
  },
  // Run-done state (23.10.2026).
  {
    key: 'enable_run_done_state_v1',
    icon: ListChecks,
    iconBg: 'bg-lime-50',
    iconColor: 'text-lime-700',
    title: 'בית: ריצה שבוצעה מסומנת בתוכנית',
    description: 'אחרי ריצה מתוכננת שהגיעה ל-70% מהיעד שלה (או ריצה חופשית של לפחות 10 דקות ו-50% מהמתוכנן) האימון בלוח מסומן כבוצע, וכרטיס "הריצה של היום" כבר לא מציע להתחיל. ריצה קצרה מדי מוצגת בכרטיס קטן ולא נספרת לתוכנית ולא ליעד השבועי. הכרטיס עצמו תלוי ב"בית v2" ופועל גם כשהדגל הזה כבוי; הדגל שולט רק בכתיבת הסימון ללוח. כבוי = כמו היום.',
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
  // Org access-code prompt (19.10.2026).
  {
    key: 'enable_org_access_code_prompt',
    icon: Users,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'קוד גישה מהארגון לעובדי משרד',
    description: 'כשמשתמש בוחר "עובד משרד / עובדת משרד" במסך "שנכיר?", נפתח חלון "יש לך קוד גישה מהארגון?" (לא חובה, אפשר לדלג). קוד תקין מצרף אותו לארגון ופותח את לשונית הליגה של החברה. מיועד ללקוחות B2B. כבוי = הפרסונה פשוט נבחרת, בלי חלון קוד (עד היום החלון הופיע לכל המשתמשים).',
  },
  // Entry flow v2 — location step (20.10.2026).
  {
    key: 'enable_entry_globe_v1',
    icon: MapIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כניסה: כדור הארץ והמיקום',
    description: 'שלב המיקום בכניסה בעיצוב החדש: כדור הארץ, צלילה לשכונה, אישור הבית וחיפוש.',
  },
  // JIT identity before the health declaration (20.10.2026).
  {
    key: 'enable_jit_identity_v1',
    icon: ShieldAlert,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    title: 'פרטים לפני הצהרת הבריאות',
    description: 'משתמש בלי שם (הרשמה מהירה) ממלא שם, פנייה ותאריך לידה לפני ההצהרה, כדי שההצהרה תיחתם על שמו.',
  },
  // Entry flow v2 — landing + intro stories (20.10.2026).
  {
    key: 'enable_entry_intro_v1',
    icon: MapIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כניסה: מסך פתיחה וסיפורי החסמים',
    description: 'מסך הפתיחה החדש (העיר), 5 סיפורי החסמים, והמעגל שנסגר לכדור הארץ.',
  },
  // Entry flow v2 — strength quiz drag hint (20.10.2026).
  {
    key: 'enable_strength_quiz_hint_v2',
    icon: Pointer,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'שאלון כוח: הדרכת גרירה חדשה',
    description: 'בלי טשטוש: השורה מדגימה את עצמה בקטגוריה הראשונה, תזכורת קצרה בשאר, וההדרכה נשארת עד הגרירה הראשונה.',
  },
  // Analytics — onboarding step funnel (22.10.2026).
  {
    key: 'enable_onboarding_step_funnel',
    icon: ListChecks,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'אנליטיקה: משפך שלבי הרשמה',
    description: 'כל שלב באונבורדינג שהושלם נרשם פעם אחת (אירוע onboarding_step_completed), כדי למדוד נטישה בין שלב לשלב ולא רק "איפה אנשים עומדים עכשיו". בלי מיקום ובלי פרטים אישיים, כ-10 כתיבות למשתמש לכל ההרשמה.',
  },
  // Run / walk live players — map first, metrics drawer, attached story bars (21.10.2026).
  {
    key: 'enable_run_player_drawer_v1',
    icon: Footprints,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'נגן ריצה/הליכה: המפה קודם',
    description: 'הרץ והמסלול תמיד גלויים מעל מגירת המדדים (קומפקטית / מלאה), קו מסלול בולט, חזרה אוטומטית למעקב, ופסי הסטורי מחוברים לראש המסך.',
  },
  // Haptics v1 — one helper, a "רטט" setting, web no-op (22.10.2026).
  {
    key: 'enable_haptics_v1',
    icon: Pointer,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'רטט (הפטיקה) v1',
    description: 'טיק קל בבחירה בבוררים ובמתגים, ורטט קל בכפתורים הראשיים בנגנים (התחלה, השהייה, המשך, סיימתי). כל הרטטים באפליקציה מכבדים הגדרת "רטט" חדשה בהגדרות (ברירת מחדל דלוקה) ואת הגדרת הפחתת התנועה של המכשיר. באפליקציה בלבד, לא בדפדפן.',
  },
  // Two-level schedule UI — simple days picker / week builder (21.10.2026).
  {
    key: 'enable_week_builder_v1',
    icon: CalendarDays,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'לו״ז: בונה השבוע',
    description: 'תוכנית פשוטה (אימון אחד שחוזר) נשארת עם בחירת ימים. תוכנית מורכבת (פיצול, שני מסלולים, הליכה לצד מסלול אחר או 5+ ימים) מקבלת את בונה השבוע: כרטיס לכל יום עם "למה", גרירה ליום אחר שהמנוע בודק, ואישור השבוע. גם בהוספת מסלול שני.',
  },
  // Map polish — one navigation, compact park card, v2 route details (21.10.2026).
  {
    key: 'enable_map_polish_v1',
    icon: MapIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'מפה: ניווט אחד וכרטיסים קומפקטיים',
    description: 'כל כפתור "ניווט לשם" (גינה, מסלול, משתמש חי) נכנס לניווט שבתוך האפליקציה, פרטי מסלול נשארים במסך המסלול החדש, כרטיס גינה קטן יותר, ובשכבות אפשר להסתיר גינות כושר ומסלולים.',
  },
  // Map surface filter — layers panel (23.10.2026).
  {
    key: 'enable_map_surface_filter_v1',
    icon: MapIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'מפה: סינון לפי סוג משטח',
    description: 'בפאנל השכבות נוסף בורר "סוג משטח" (הכל / סלול / שביל עפר; ברכיבה: אופני כביש / אופני שטח) שמסנן את המסלולים במפה ובקרוסלה לפי המשטח שנשמר בהם. מסלול בלי נתוני משטח מוסתר כל עוד סינון פעיל. מוצג "מוצגים X מתוך Y", איפוס, ותג על כפתור השכבות. הבחירה נשמרת במכשיר.',
  },
  // Destination planner — address pick → planner → commute player (22.10.2026).
  {
    key: 'enable_destination_planner_v1',
    icon: MapIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'מפה: תכנון דרך ליעד',
    description: 'אחרי בחירת כתובת או "נווט לכאן": מסך תכנון עם הליכה / ריצה / רכיבה וזמן לכל אחת, העדפות (דרך גינת כושר, הכי קצר, מואר ומוצל רק איפה שיש נתונים) ועד 2 דרכים לבחירה עם תגים מנתונים אמיתיים בלבד. "התחל" מפעיל את הניווט הקיים עם הדרך שנבחרה. דורש את הבית החדש.',
  },
  // Analytics — measure every push type (22.10.2026).
  {
    key: 'enable_push_measure_all',
    icon: MessageCircle,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'אנליטיקה: מדידת כל סוגי הפושים',
    description: 'כל פוש שנשלח (לא רק 10 הסוגים שנמדדים היום) נרשם: נשלח, נפתח, ומה המשתמש עשה אחריו, עם מזהה הסוג בכל רשומה. כתיבה אחת לכל פוש לכל נמען, ועוד אחת-שתיים כשנפתח. דורש פריסת functions.',
  },
  // Retire /gateway as the fallback (21.10.2026).
  {
    key: 'enable_landing_real_fallback',
    icon: MapIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כניסה: בלי מסך הבחירה הישן',
    description: 'במקום מסך הבחירה הישן (/gateway): משתמש חדש עם Google/Apple, קישורי הזמנה, פוש "המשך הרשמה" וסטטוס לא מוכר עוברים למסלול האמיתי (פתיחה, מפה או בית).',
  },
  // Demo world (20.10.2026).
  {
    key: 'enable_demo_users',
    icon: Users,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'משתמשי דמו',
    description: 'מפעיל את הסימולטור של עולם הדמו הסגור (עיריית דמו, יחידת דמו, ארגון דמו). כבוי = הסימולטור לא כותב כלום. משתמשי דמו לעולם לא מופיעים למשתמשים אמיתיים, גם כשהדגל דולק. לא נדלק אוטומטית לסופר-אדמין.',
  },
  // Demo control center sub-switches (20.10.2026) — also switched live from /admin/demo.
  {
    key: 'demo_life_llm',
    icon: MessageCircle,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'דמו: AI בצ׳אט',
    description: 'משתמשי הדמו עונים בצ׳אטים של הדמו עם מודל AI קטן (בעלות). כבוי = משפטים מוכנים מבנק. פועל רק כשמשתמשי הדמו דולקים.',
    parentKey: 'enable_demo_users',
  },
  {
    key: 'enable_ai_testers',
    icon: Bot,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'דמו: בודקי AI',
    description: 'מאפשר להריץ את בודקי ה-AI (סיור באפליקציה כמשתמשי דמו). כבוי = שום סיור לא מתחיל, וסיור פעיל נעצר. פועל רק כשמשתמשי הדמו דולקים. מפעילים ממרכז הדמו.',
    parentKey: 'enable_demo_users',
  },
  {
    key: 'demo_kelly',
    icon: MessageCircle,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'דמו: קלי לדמו',
    description: 'קלי ירוץ גם על משתמשי הדמו (הודעות יזומות, זיכרון, סוקר אימונים) — נספר בתקציב הדמו. פועל רק כשמשתמשי הדמו דולקים.',
    parentKey: 'enable_demo_users',
  },
  // i18n wave 1 (21.10.2026) — translation layer + one switch per language.
  {
    key: 'enable_i18n',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'שפות (i18n)',
    description: 'מתג ראשי לשפות: האפליקציה בוחרת שפה לפי ההגדרה של המשתמש, ואחריה שפת המכשיר, מבין השפות שדלוקות למטה. כבוי = עברית בלבד, בדיוק כמו היום.',
  },
  {
    key: 'enable_locale_en',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'שפה: אנגלית',
    description: 'משתמשים שבחרו אנגלית (או שהמכשיר שלהם באנגלית) יקבלו את האפליקציה באנגלית. להדליק רק כשהתרגום מלא. לא נדלק אוטומטית לסופר-אדמין.',
    parentKey: 'enable_i18n',
  },
  {
    key: 'enable_locale_ru',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'שפה: רוסית',
    description: 'משתמשים שבחרו רוסית (או שהמכשיר שלהם ברוסית) יקבלו את האפליקציה ברוסית. להדליק רק כשהתרגום מלא. לא נדלק אוטומטית לסופר-אדמין.',
    parentKey: 'enable_i18n',
  },
  {
    key: 'enable_locale_de',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'שפה: גרמנית',
    description: 'משתמשים שבחרו גרמנית (או שהמכשיר שלהם בגרמנית) יקבלו את האפליקציה בגרמנית. להדליק רק כשהתרגום מלא. לא נדלק אוטומטית לסופר-אדמין.',
    parentKey: 'enable_i18n',
  },
  {
    key: 'enable_content_locale',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'תוכן בשפת המשתמש',
    description: 'שמות תרגילים, תיאורים והנחיות מוצגים באנגלית למשתמשים באנגלית. שדה שאין לו תרגום מוצג בעברית. דורש את מתג השפות הראשי. כבוי = תוכן בעברית, בדיוק כמו היום.',
    parentKey: 'enable_i18n',
  },
  {
    key: 'push_locale_v1',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'פושים לפי שפה',
    description: 'פוש נשלח בשפת המשתמש (core.locale): שורות הספרייה של אותה שפה, אחר כך ברירות מחדל מתורגמות, ואחרת עברית. דורש את מתג השפות הראשי. כבוי = כל הפושים בעברית, בדיוק כמו היום. השרת קורא את הערך השמור (לא את ברירת המחדל של הסופר-אדמין).',
    parentKey: 'enable_i18n',
  },
  {
    key: 'hide_he_only_onboarding_steps',
    icon: Languages,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'הרשמה: דילוג על שלבים בעברית בלבד',
    description: 'כשהשפה אינה עברית, ההרשמה מדלגת על שלב הפרסונה (צה"ל / תלמיד / עובד משרד), כי אין פרסונה צבאית באנגלית. כבוי = ההרשמה בדיוק כמו היום לכולם. דלוק + עברית = בלי שינוי.',
    parentKey: 'enable_i18n',
  },
  // Analytics — app-session signal (22.10.2026).
  {
    key: 'enable_app_session_signal',
    icon: Users,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'אנליטיקה: כניסות לאפליקציה',
    description: 'מונה יומי לכל משתמש: כמה פעמים נכנס לאפליקציה וכמה מהכניסות היו מהקשה על פוש — כדי לדעת מי חוזר בלי פוש. בלי מיקום ובלי פרטים אישיים, כתיבה אחת לכניסה (עד 12 ביום). להדליק רק אחרי פריסת חוקי Firestore.',
  },
  // OSM attribution + credits page (22.10.2026).
  {
    key: 'enable_osm_attribution',
    icon: Languages,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'קרדיטים ורישיונות (OpenStreetMap)',
    description: 'מדליק את דף "רישיונות וקרדיטים" (/legal/credits), את השורה "מקור: OpenStreetMap" במסך פרטי מסלול שמקורו ב-OSM, ואת הקישור אליו מההגדרות. כבוי = הדף מחזיר 404 ושום דבר לא מוצג.',
  },
  // Admin-panel AI assistant (22.10.2026) — docs/admin/ADMIN-AI-ASSISTANT-PLAN.md.
  {
    key: 'admin_ai_assistant_v1',
    icon: Bot,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'פאנל: עוזר AI ("שאל את OUT")',
    description: 'צ׳אט בתוך פאנל הניהול לסופר-אדמין ולמנהלי השורש בלבד: ניווט לעמודים (בלי מודל), תשובות מהירות ושאלות על נתוני הפאנל. קריאה בלבד. התקציב היומי נקבע ב-app_config/ai (adminAiBudgetUsd). לא נדלק אוטומטית לסופר-אדמין.',
  },
  // Pyramid kill switch (22.10.2026) — only pyramids; other protocols stay as configured.
  {
    key: 'pyramid_injection_off',
    icon: Dumbbell,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    title: 'פירמידות כבויות',
    description: 'דלוק = המחולל לא מכניס פירמידה לאף אימון: היא יורדת מרשימת הפרוטוקולים של כל תוכנית ורמה, האפשרות ה"עצימה" לא מקבלת פירמידה כפויה, ולכן גם אימוני פארק משולבים לא יכילו שלבי פירמידה. סופרסטים, EMOM וטבטה ממשיכים כפי שהוגדרו. נקרא פעם אחת בכל יצירת אימון. כבוי = כמו היום.',
  },  // Scoped official_routes read (22.10.2026) — the app stops reading the first 200 routes nationwide.
  {
    key: 'enable_scoped_official_routes',
    icon: RouteIcon,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    title: 'מסלולים רשמיים לפי רשות',
    description: 'דלוק = האפליקציה קוראת רק את המסלולים הרשמיים של הרשות של המשתמש ושל העיר שבה הוא נמצא (עד 300), ואם אין — רק מסלולים מאושרים (עד 200). כבוי = כמו היום: 200 המסלולים הראשונים מכל הארץ, כך שעם ייבוא ארצי רוב הערים לא יראו כלום. לפני הדלקה: להריץ את backfill-route-publish-status ולשייך רשות ל-16 המסלולים הישנים בלי authorityId.',
  },
  // Route connectors (RC10, 22.10.2026) — src/lib/route-collections/display-role.ts.
  {
    key: 'enable_hide_route_connectors',
    icon: RouteIcon,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    title: 'מסלולים: הסתרת מקטעי חיבור',
    description: 'מסלולים שסומנו כ"מקטע חיבור" (displayRole: connector — למשל "מקטע 2" או "תוספת א" מהמסלולים של עיריית שדרות) נשארים במערכת אבל לא מוצגים למשתמשים ברשימות המסלולים, בקרוסלת המפה ובחיפוש. כבוי = הכול מוצג כמו היום. לא נדלק אוטומטית לסופר-אדמין.',
  },
  // City-mapping hub (22.10.2026) — docs/admin/CITY-MAPPING-HUB-DESIGN.md.
  {
    key: 'enable_city_mapping_hub',
    icon: MapPinned,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-700',
    title: 'פאנל: מרכז מיפוי ערים',
    description: 'דף חדש לסופר-אדמין ב-/admin/city-mapping/hub: כל הרשויות בטבלה אחת (חיפוש, סינון, מיון), מפה עם מסלולים, נקודות ותרומות משתמשים, ואישור או דחייה ישירות מהמפה. כבוי = הדף מציג "כבוי". דף מיפוי העיר הקיים לא משתנה.',
  },
  // Swap fixes (22.10.2026) — swap/hybrid audit §1.
  {
    key: 'enable_swap_fixes_v1',
    icon: Dumbbell,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    title: 'החלפת תרגיל — תיקונים',
    description: 'תרגיל שכבר באימון לא מוצע להחלפה; בתצוגה מקדימה ההחלפה לפי המקום ולא לפי התרגיל; באימון פעיל טווח הרמות סביב רמת התרגיל עצמו והחזרות/ההחזקה מותאמות; בתחנה סינון לפי ציוד הפארק לפני הבחירה של 3; החלפה נשמרת בהמשך אימון ומופיעה בסיכום; אין החלפה בזמן עבודה בטבטה; החלפת שלב בפירמידה משולבת מחליפה רק את השלב ולפי ציוד הפארק; תמונה לפי שיטת הביצוע שנבחרה. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Location-switch gate (23.10.2026) — agent-briefs/variant-empty-media-audit.md.
  {
    key: 'enable_location_gate_v1',
    icon: Dumbbell,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'מעבר מיקום באימון: שער כיסוי תוכן',
    description: 'במעבר מיקום בתצוגה המקדימה (בית / פארק / שירות) נבדק מראש שלכל תרגיל יש וידאו או תמונה במיקום החדש, או תרגיל חלופי מתאים (אותה קבוצת תנועה, אותו שריר ראשי, חזרות/החזקה כמו המקור, לא כבר באימון, תרגילי יעד/מיומנות רק בתוך המשפחה שלהם, קל יותר ברמה אחת רק כשאין באותה רמה). אם הכיסוי נמוך מהסף (80% והחסרים לכל היותר אחד) האפשרות מוצגת באפור עם הסבר קצר והמעבר נחסם; הנגן מנגן רק מה שהוחלט בתצוגה. בנוסף: שיטה עם וידאו בלי תמונה מציגה תמונה שנגזרת מהוידאו. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Strength / timed players — collapsible drawer, details in the list (22.10.2026).
  {
    key: 'enable_strength_drawer_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'נגן כוח/טבטה/AMRAP/EMOM: מגירה מתקפלת',
    description: 'הכרטיס התחתון בנגן הכוח ובטבטה/AMRAP/EMOM נהיה מגירה: קומפקטית (שם התרגיל, טיימר/סבב, יעד וכפתור ראשי) או מלאה, בגרירה או בהקשה, והבחירה נשמרת. הווידאו נשאר גלוי. "צפה בהסבר המלא" עובר לכפתור "הסבר" קטן בפינת הווידאו ולפרטי התרגיל ברשימה, ושורות הרשימה נפתחות לשרירים, דגשים וציוד כמו בעמוד התרגיל.',
  },
  // Wide player (23.10.2026) — the strength / timed players on landscape, tablet, desktop and TV screens.
  {
    key: 'enable_wide_player_v1',
    icon: Dumbbell,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'נגן כוח/טבטה/AMRAP/EMOM: מסך רחב (נוף, טאבלט, מחשב, טלוויזיה)',
    description: 'כשהמסך רחב (לפחות 900 פיקסלים, או טלפון במצב נוף), הנגן עובר לפריסה לצד הווידאו: הווידאו גדול בצד אחד, ובצד השני שם התרגיל, טיימר או יעד גדול, כפתור "סיימתי סט" והתרגיל הבא. אין מגירה תחתונה, יש שוליים בטוחים, ואפשר לשלוט במקלדת: רווח, חצים ו-Esc. דורש את בית v2. מנהל-על רואה את זה כבר עכשיו. כבוי = הנגן כמו היום.',
    parentKey: 'enable_home_v2',
  },
  // Site QR links (22.10.2026) — the marketing site's app-store QR codes.
  {
    key: 'enable_site_qr_links',
    icon: QrCode,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'פאנל: קישורי QR של האתר',
    description: 'כרטיס בראש מרכז הקישורים השיווקיים (/admin/links) עם שלושת הקישורים הקבועים שקודי ה-QR באתר מפנים אליהם: app-ios (App Store), app-android (Google Play) ו-app-smart (לפי המכשיר). רואים אם קיימים וכמה סריקות, ויוצרים את החסרים בלחיצה. משנים יעד בעריכת הקישור — הקוד המודפס לא משתנה. מנהל-על רואה את זה כבר עכשיו. כבוי = הדף כמו היום.',
  },  // History = the same strength summary as right after the workout (22.10.2026).
  {
    key: 'enable_history_summary_parity',
    icon: Dumbbell,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'היסטוריה: אותו סיכום אימון כוח כמו מיד אחריו',
    description: 'אימון כוח שנפתח מההיסטוריה מציג את אותו סיכום שראו בסוף האימון: הבלוקים של התוכנית עם הסטים המתוכננים והתמונות, "השתפרת מהפעם הקודמת", טבעת הרמה וההתקדמות של אותו אימון, כרטיס הרצף של אותו שבוע והקלוריות האמיתיות. הנתונים נשמרים עם כל אימון חדש מעכשיו; אימונים ישנים נשארים בתצוגה המצומצמת של היום. דורש את בית v2. מנהל-על רואה את זה כבר עכשיו. כבוי = מסך ההיסטוריה כמו היום.',
    parentKey: 'enable_home_v2',
  },
  // Progress hub v2 (23.10.2026) — canvas page 12 PG-2…PG-6.
  {
    key: 'enable_progress_hub_v2',
    icon: ListChecks,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    title: 'התקדמות: עמוד ראשי עם 3 כרטיסים ועמודי עומק',
    description: 'בלשונית ההתקדמות: נשארים הכותרת, מתג השבוע/החודש וטבעת הסיכום, ומתחתם שלושה כרטיסים — כוח, ריצה (או הליכה כשהתוכנית היא הליכה) וצעדים בכתום. כל כרטיס פותח עמוד עומק: ריצה (נפח שבועי, שבועות התוכנית, תחזית, יעדי קצב, ריצות אחרונות), כוח (מפות התקדמות, תובנות, איזון שרירים, סטים לשבוע, תרגילים) וצעדים (יום/שבוע/חודש/שנה). חץ חזרה או החלקה מהקצה. רצועת השבוע, בלוק ההתמדה וקיצור השיאים יוצאים מהעמוד הראשי. דורש את בית v2. מנהל-על רואה את זה כבר עכשיו. כבוי = הלשונית כמו היום.',
    parentKey: 'enable_home_v2',
  },
  // Workout insights (22.10.2026) — Kelly in the green card + the lemur's funny line.
  {
    key: 'enable_workout_insights_v1',
    icon: Bot,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'תובנות קלי והלמור אחרי אימון כוח',
    description: 'אחרי אימון כוח: בכרטיס הירוק "שיפור מהפעם הקודמת" קלי כותב שורת תובנה ומחמאה, וכפתור כוכב פותח שיחה איתו על האימון. במסך עליית האחוזים הלמור אומר משפט מצחיק בבועה מתחת לטבעת (למשל כמה גורי פילים הרמת, לפי משקל הגוף). המשפטים נכתבים ב-AI תחת מגבלות קלי (בגיר, הרשאת AI, תקציב יומי ומתג כיבוי); אם אין תשובה — פשוט לא מוצג כלום. מנהל-על רואה את זה כבר עכשיו. כבוי = המסכים כמו היום.',
  },
  // Group / together-training fixes (22.10.2026) — group audit P1 + P2.
  {
    key: 'enable_group_fixes_v1',
    icon: Users,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: 'קבוצות ואימון משותף — תיקונים',
    description: 'כל ההצטרפויות (קישור הזמנה, קישור אימון, גוגל, זהות מהירה, התראות) נוחתות בדף הקבוצה לפי מזהה — גם לקבוצה מעיר אחרת ובלי עיר; הזמנה ממתינה לא הולכת לאיבוד אחרי התחברות; המצטרף נכנס לצ׳אט הקבוצה ומאמן שהוגדר מקבל ניהול; סיכום "יחד" מחושב בשרת; ריצה עם "הזמן חבר" נשמרת כריצה קבוצתית; הזמנה חוזרת רק בריצה קבוצתית ובשעה המקומית; הרשמה לאימון בטרנזקציה עם הודעת שגיאה ומונה מסונכרן; מנהל יחיד לא יכול לעזוב בלי למנות מחליף; /join מחכה לטעינת הפרופיל ומראה שגיאות; "להוסיף ליומן" עובד גם מהבית. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Together layer v1 — presence rail, lobby, race bar, cheers, richer summary (22.10.2026).
  {
    key: 'enable_together_layer_v1',
    icon: Users,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'שכבת "יחד" באימון',
    description: 'באימון משותף: פס חברים בצד עם סטטוס חי (ק״מ/קצב או סט/סבב/דקה), לובי שמסביר במשפט אחד אם כולם באותו אימון או כל אחד ברמה שלו וסופר 3-2-1 מסונכרן מהשרת, פס מרוץ מול חבר נבחר, כיף (עידוד) עם רטט והתראה כשמישהו מסיים סבב, וסיכום "יחד" עשיר (סך הכול, השוואה, הכי הרבה כיפים, MVP). ההזמנה מציגה את השעה, ומי שנרשם לאימון מאוחר מקבל "נזכיר לך 15 דק׳ לפני" והוספה ליומן; הלובי נפתח כ-10 דק׳ לפני. דורש גם enable_home_v2. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // TV mode (23.10.2026) — owner-approved canvas W-13..W-20.
  {
    key: 'enable_tv_mode_v1',
    icon: Tv,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'הצגת אימון על מסך גדול (טלוויזיה)',
    description: 'בתצוגת האימון, בתפריט ⋯, נוספת האפשרות "הצגה על מסך גדול". הטלוויזיה פותחת outrun.co.il/tv ומציגה QR וקוד של 6 ספרות; הטלפון הראשון שמזין את הקוד הוא המארח והשלט (הפעלה/השהיה/הבא/דילוג/עוצמת קול), טלפונים נוספים מצטרפים כמשתתפים ומופיעים בשורת החברים. הקוד תקף 4 שעות. דורש שכללי tvSessions יפורסמו (דוד) וכן מדיניות TTL. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום, וכתובת /tv מציגה "לא זמין".',
  },
  // Workout overview single ⋯ menu (23.10.2026) — owner-approved canvas W-17 variant B.
  {
    key: 'enable_overview_more_menu_v1',
    icon: MoreHorizontal,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'תפריט ⋯ אחד בתצוגת האימון',
    description: 'בתצוגת האימון, במקום שורת האייקונים (שיתוף / אהבתי / הורדה) יש כפתור ⋯ אחד שפותח תפריט: הורדה לטלפון, אהבתי, שיתוף, ואם הצגה על מסך גדול פעילה גם "הצגה על מסך גדול". אותן פעולות בדיוק, רק מאחורי תפריט אחד. מנהל-על רואה את זה כבר עכשיו. כבוי = שורת האייקונים כמו היום.',
  },
  // Hill finder for hill-repeat runs (23.10.2026) — route-fit/hill-finder.ts.
  {
    key: 'enable_hill_finder_v1',
    icon: Mountain,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'מציאת גבעה לאימון עליות',
    description: 'בתצוגת אימון הריצה, כשהאימון של היום הוא אימון עליות ואף אחד מהמסלולים שהוצעו לא כולל עלייה מתאימה (שיפוע ואורך החזרה), מופיעה שורה עם הגבעה המתאימה הקרובה: מקטעי עלייה מאושרים (climb_segments) ועליות שזוהו בפרופיל הגובה של מסלולים רשמיים קרובים, עד 5 ק״מ. קריאה בלבד, לא נכתב כלום. מנהל-על רואה את זה כבר עכשיו. כבוי = התצוגה כמו היום, בלי קריאות נוספות.',
  },
  // Run drawer "from me" (27.10.2026) — canvas page 11, board RP-14.
  {
    key: 'enable_run_drawer_from_me_v1',
    icon: RouteIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'מגירת הריצה: מתחילים ממני',
    description: 'בתצוגת אימון הריצה על המפה, הכול מתחיל מהמיקום שלך: מתחת לכותרת האימון מופיעה שורת אריחי מסלולים — לולאות שנוצרו מכאן לאימון הזה (אותו מחולל לולאות), ומסלול רשמי רק כשהוא קרוב (עד ק״מ) ומתאים לאימון. האריח הראשון נבחר, לכל אריח שורה ירוקה "למה מתאים", ו"הצעה אחרת" מבקשת סט לולאות חדש. אין קרוסלה מעל המפה ואין מצב "ממסלול". מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // First-run map tutorial (27.10.2026) — canvas boards M1-M8, pilot notes L3, L5, L7-L13.
  {
    key: 'enable_map_tutorial_v1',
    icon: RouteIcon,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'טוטוריאל מפה ראשון',
    description: 'משתמש חדש במפה: במגירת "גרים ב…" הסבר על הליגה והגרירה מעל הלמור (למור קטן יותר וזום קרוב), כרטיס המסלול במגירת "מה בא לך" עם הקופי החדש, "רק להסתכל מסביב" מבטיח 3 דברים במפה, סיור המסלול (פרטים, העצירה בגינה, הסדר, "יאללה, בואו נתחיל" שפותח את המסלול), כרטיס המסלול האמיתי עם כפתור i ("למה קיבלתי את המסלול") ולחיצה על כל הכרטיס, סיור במגירת האימון, וכרטיס השאלון החדש. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Live park workout v2 (28.10.2026): canvas boards Park 1-12.
  {
    key: 'enable_park_live_v2',
    icon: RouteIcon,
    iconBg: 'bg-lime-50',
    iconColor: 'text-lime-600',
    title: 'אימון פארק לייב: הליכה + מתקנים',
    description: 'באימון הליכה עם תחנות מתקנים: כרטיס הליכה (זמן, מרחק, מרחק לתחנה, בלי קצב) עם הכפתורים של היום, שורת הודעה מתחת לפסי הסטורי כשמתקרבים לתחנה, טוטוריאל הלייב בסדר החדש, מסך פתיחה אחד לתחנה (מתקנים בתמונות, שרירים, הסבר טבטה, קושי בברקים, ברירת מחדל קל), "הניחו את הטלפון על הרצפה" לפני הטיימר, "מצאו את המתקן הבא" + החלפה במנוחה, מסך טבעת שבועית לפני הסיכום, ותיקוני הסיכום (טבעת הליכה, בלי פס דקות, כרטיס שאלון). דורש את בית v2. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Navigation on the v2 player (28.10.2026, phone test AA2).
  {
    key: 'enable_commute_v2_player_v1',
    parentKey: 'enable_home_v2',
    icon: RouteIcon,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'ניווט ליעד בנגן החדש',
    description: 'ניווט לפארק או למקום ("ניווט" בכרטיס הפארק / בדף הפארק) נפתח בנגן הריצה החדש של בית v2 במקום הנגן הישן (רשימת ההקפות הישנה, הדוק הכהה). בכותרת: היעד, המרחק שנותר ושעת ההגעה המשוערת. דורש את בית v2. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Workout coach note (28.10.2026, phone test AB2).
  {
    key: 'enable_workout_coach_note_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'דגשי האימון: למה בנינו את האימון הזה',
    description: 'בתצוגה המקדימה של אימון כוח: בלוק "דגשי האימון" עם 2-4 משפטים על הסיבה לאימון (התאוששות, חזרה אחרי הפסקה, פער שבועי, מיקוד, מקום) ומה מחכה בו (תרגילים, סטים, מנוחה, עצימות). נבנה ב-#415 ולא הופעל אף פעם. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Method "i" sheet (29.10.2026) — owner-approved canvas boards Method*.
  {
    key: 'enable_method_info_sheet_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'הסבר שיטת אימון ("i" ליד כותרת הבלוק)',
    description: 'כפתור i ליד כותרת בלוק כוח (בתצוגה המקדימה, ובנגן ליד סופר סט וטבטה) פותח הסבר קצר על השיטה: סטים רגילים, סופר סט, פירמידה עולה-יורדת, סט שיא או טבטה. ההדגמה בנויה מהתרגילים, החזרות והמנוחות של הבלוק עצמו, עם 3 שלבים ושתי שאלות מוכנות לקלי. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Feature "i" sheets (29.10.2026) — owner-approved canvas boards SwapCard / DragCard / StopsCard / TutStructureCard.
  {
    key: 'enable_feature_info_sheets_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'הסברי "i" לפיצ\'רים (מקום, לו"ז, מסלול עם עצירות, מבנה האימון)',
    description: 'כפתור i ליד "איפה מתאמנים?", ליד "לו"ז אימונים", ליד כותרת מסלול עם תחנות כוח וליד כותרת אימון הכוח פותח הסבר קצר עם הדגמה מהנתונים של המסך עצמו: המקומות שלכם, השבוע שלכם, המקטעים והתחנה של המסלול, והחלקים של האימון. 3 שלבים ושתי שאלות מוכנות לקלי. ההסבר נפתח מתוך ה-i ונסגר בחזרה אליו. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Combined workout flow (30.10.2026) — owner-approved canvas boards PlayerTransition* / PlayerCombo*.
  {
    key: 'enable_combo_flow_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'אימון משולב: מעברים בין שלבים (הליכה, תחנת כוח, ריצה)',
    description: 'באימון עם הליכה או ריצה ותחנת כוח: צ׳יפ "יוצאים לדרך" בהתחלה, כרטיס "הגעת לתחנה!" כשמגיעים לגינה, ומסך "סיימתם את תחנת הכוח" בעיצוב החדש. בהמשך: מהלך האימון יורד לרגע והנקודה עוברת לשלב הבא, ומסך סיום וסיכום משולבים. צריך את הבית החדש. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Home after a workout (30.10.2026), owner-approved canvas option B (HomeAfterB / HomeAfterRules).
  {
    key: 'enable_home_after_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'הבית אחרי אימון: הכל בקרוסלה אחת',
    description: 'אחרי שסיימתם אימון היום: כל מה שלהיום בקרוסלה אחת מתחת ללו"ז. קודם מה שנשאר (אימון משלים, הריצה של היום, שאר ההצעות), ובסוף כרטיס "בוצע היום" שלחיצה עליו פותחת את סיכום האימון. בלי פס העידוד, בלי כרטיס "הפעילות שלי היום" נפרד למעלה ובלי כרטיס ריצה נפרד. בהמשך: קלי עוברת לתפריט +, כרטיס הבוצע בעיצוב פוסט, והדרכת הבית. צריך את הבית החדש. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // One share button on workout summaries (pilot AG2, 30.10.2026).
  {
    key: 'enable_share_router_v1',
    icon: Share2,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כפתור "שתפו" אחד בסיכום אימון',
    description: 'בסיכום האימון, "שתפו" פותח חלון קטן עם 3 אפשרויות: פרסום בפיד של האפליקציה, תמונות מעוצבות לרשתות, ושליחה מהטלפון (וואטסאפ וכו׳). היום הכפתור פותח ישר את השיתוף של הטלפון. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Workout post card (30.10.2026), owner-approved canvas boards PostTypes / PostCompact / PostFeed.
  {
    key: 'enable_workout_post_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'כרטיס אימון אחד: בבית, בפיד ובשיתוף',
    description: 'כרטיס אחד לכל אימון שהסתיים, לפי הסוג (כוח, ריצה, הליכה, משולב): ריבוע עם מפת לילה או תמונה, שם האימון ו־3 טבעות בצבעי הווידג׳ט. בבית זה הכרטיס הקטן של "בוצע היום" בקרוסלה, ובפיד זה הפוסט. הליכה מקבלת טבעת צעדים ולא טבעת ריצה. בהמשך: תמונות השיתוף והסטיקרים. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },  // Combo generator (31.10.2026), vision stage 2.
  {
    key: 'enable_combo_generator_v1',
    icon: Dumbbell,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'מחולל שילובים: אימון משולב מבקשה אחת',
    description: 'בקשה אחת (אירובי, כוח, סדר, מקום אחד, זמן) הופכת לאימון שרץ בנגנים הקיימים: AMRAP או EMOM עם ריצה בכל סבב (רק מרמה 8 במשיכה ובדחיפה), טבטה או בטן אחרי ריצה, השלמה לפי סטים חסרים ויום בשני חלקים. קודם המנוע, המסך יגיע אחרי אישור הקנבס. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },

  // Home progress slot (23.10.2026) — owner-approved progress hub boards PG-1.
  {
    key: 'enable_home_progress_slot_v1',
    icon: Footprints,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    title: 'התקדמות בבית: כוח ↔ ריצה, וטבעת דקות הפעילות',
    description: 'בבית (עיצוב חדש), בלשונית "התקדמות שבועית": כרטיס התוכנית ליד הפסים הופך לזוג כרטיסים בהחלקה עם נקודות — תוכנית הכוח ↔ תוכנית הריצה (טבעת התקדמות בתוכנית, תחזית למרוץ, "שבוע N מתוך M"), ולמי שיש תוכנית הליכה כרטיס הליכה בכתום. בלי תוכנית ריצה/הליכה יש רק כרטיס הכוח. כרטיס "תחזית למרוץ" הגבוה יורד. בלשונית "מדדי בריאות": במקום טבעת הצעדים — טבעת דקות הפעילות של השבוע (כמו בראש מסך ההתקדמות), ולחיצה פותחת את מסך ההתקדמות. מנהל-על רואה את זה כבר עכשיו. כבוי = הבית כמו היום.',
  },
  // Where to train + one "I'm training here" sheet (26.10.2026) — canvas page 11, board RP-13 phones 4–7.
  {
    key: 'enable_where_to_train_v1',
    icon: Dumbbell,
    iconBg: 'bg-lime-50',
    iconColor: 'text-lime-600',
    title: 'איפה מתאמנים: גינות קרובות ושיתוף "מתאמן כאן"',
    description: 'בתצוגה המקדימה של אימון כוח: "איפה מתאמנים?" עולה מתחת לבחירת העצימות עם מתג פארק / בית. בפארק — קרוסלה של גינות קרובות (כרטיס המפה הקומפקטי), מדורגות לפי מרחק ולפי כמה מהציוד של האימון יש בגינה (בלי הודעות על ציוד חסר; האימון מתאים את עצמו כמו היום). בבית — רק שבב הציוד. לחיצה על גינה פותחת מגירה אחת "מתאמן ב…": האימון והמקום ממולאים, מתי (עכשיו / מאוחר יותר עם שעות), "שתף שאני מתאמן כאן" דלוק כברירת מחדל, למי גלוי (כולם / שותפי אימון). אותה מגירה נפתחת מהמתג "שתף שאני יוצא…" בדף האימון ובדף המסלול. השיתוף נשמר כהגעה מתוכננת (planned_sessions) ומופיע ב"מתאמנים כאן" בדף הפארק. תזכורת לשעה מאוחרת עדיין לא נשלחת. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Workouts that fit a place (26.10.2026) — owner-approved boards RP-12 / RP-13 (canvas page 11).
  {
    key: 'enable_place_workouts_v1',
    icon: MapPinned,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'אימונים שמתאימים למקום: דף פארק ודף מסלול',
    description: 'בדף הפארק: "מתאים לך כאן" מתחת לכותרת, עד 3 כרטיסי אימון (האימון מהתוכנית ראשון, אחריו חלופות שמתאימות לתוכנית ולמתקנים, ומשולב רק כשיש מסלול עד 400 מ׳ מהפארק). המתקנים מוצגים כאריחים כהים (6 ועוד N), והכפתור הקבוע למטה מתחיל את הכרטיס הראשון. בדף המסלול: הצללה ותאורה בשורת הנתונים (כשידוע), "אימונים על המסלול הזה" (אימון עליות רק כשיש עלייה מתאימה), "פירוט" סגור עם גובה, מה יש בדרך, קלוריות ושימושים, ו"מתאמנים כאן" כמו בדף הפארק. קריאה בלבד. דורש את בית v2. מנהל-על רואה את זה כבר עכשיו. כבוי = שני הדפים כמו היום.',
    parentKey: 'enable_home_v2',
  },
  // Done-today gate + flame tiers (26.10.2026, owner decisions).
  {
    key: 'enable_flame_tiers_v1',
    icon: Flame,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    title: '"סיימתי להיום" אמיתי ולהבות בשלוש דרגות',
    description: 'אימון כוח נחשב "סיימתי להיום" רק מ-⅔ מיעד הסטים היומי ולפחות 4 סטים (ביום מנוחה / בלי תקציב: 4 סטים). מתחת לזה הבית לא מציג "סיימת", אזור האימון נשאר וכרטיס "נשארו X סטים להיום" מופיע. אימוני "לדוגמה" נספרים כמו כל אימון. כל הלהבות (רצועת השבוע, הקפסולות בבית v2, נקודות השבוע במסכי הסיכום) מחושבות מאותו כלל: להבה קטנה = יום שנספר לרצף (10 דקות פעילות או יעד צעדים), בינונית = גם יעד יומי אחד (כוח או אירובי), גדולה ובולטת = גם כוח וגם אירובי. אימון מתחת לרף מקבל סימן "התחיל" קטן, לא להבה. מסך הסיכום כבר לא מסמן את היום כ"בוצע" אוטומטית. מונה הרצף לא משתנה. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Strength workout tutorial (30.10.2026, pilot S2).
  {
    key: 'enable_workout_tutorial_v1',
    icon: Flame,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'הדרכה באימון כוח',
    description: 'בדף המבט על, בפעם הראשונה: שתי בועות "עכשיו חימום" ו"עכשיו החלק העיקרי". בנגן: כרטיס מעבר קצר בתחילת החימום ובתחילת החלק העיקרי. בתחילת אימון שיש בו ציוד: חלון "מה צריך לאימון הזה" עם הציוד בתמונות, אפשר לבטל ולבחור "לא להציג שוב". בסט הראשון שממלאים אי פעם: בועה שמסבירה איך ממלאים חזרות או זמן. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Camera scan (31.10.2026, owner-approved boards).
  {
    key: 'enable_equipment_scan_v1',
    icon: Flame,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'סריקת מתקנים במצלמה',
    description: 'בדף הפארק: כפתור "צלמו מתקן". מצלמים מתקן, המערכת מזהה אותו מקטלוג המתקנים, ופותחת את מגירת המתקן עם "תרגילים ברמה שלך". בהוספת מיקום: מיפוי גינה מ-3 עד 5 תמונות מונחות, מיקום מה-GPS ושם מהרחוב הקרוב, והמתקנים שזוהו מסומנים מראש לאישור. מתקן שלא בקטלוג מגיע לפאנל עם התמונה. פתוח לכל המשתמשים כולל בני נוער, עד 30 תמונות בשעה ו-100 ביום למשתמש. תמונה עם אנשים לא נשמרת. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  },
  // Pilot owner decisions (31.10.2026): M21 / M23 / M12.
  {
    key: 'enable_pilot_decisions_v1',
    icon: Flame,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'החלטות פיילוט: פסי סטורי, צבע מסלול, שאלון בפארק דל',
    description: 'פסי הסטורי בתחנת כוח באימון משולב מראים את כל האימון (גם קטעי ההליכה והריצה), והתחנה בפוקוס. הקו שהלכתם על מסלול ירוק (אימון עם מקטעים נשאר בצבעי המקטעים). פארק עם פחות מ-3 סוגי מתקנים שונים: מי שעוד לא מילא שאלון כוח עונה עליו לפני האימון. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
  // Owner's iPhone notes (31.10.2026, section AH).
  {
    key: 'enable_pilot_ah_v1',
    icon: Flame,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    title: 'תיקוני פיילוט (אייפון, 31.10)',
    description: 'הסרגל התחתון לא משאיר חצי עיגול כשהוא מוסתר; מגירת השכבות במפה נסגרת; התג "שותפים לאימון" רק כשיש שותפים באזור; בלו"ז: חזרה אחורה במילוי, אייקון עריכה עדין, ה-i והסגירה בגרירה בלו"ז הגדול; כרטיס הכוח הקטן בבית מיושר; החלפת מיקום בבית מסבירה כשאין מספיק תרגילים. מנהל-על רואה את זה כבר עכשיו. כבוי = כמו היום.',
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
  // Server-only read: with the persistent multi-tab cache, getDoc can resolve from a
  // stale local entry (seen 30.10: a cached "no document" made every toggle show its
  // default). Saving from that state would overwrite the real flags, so a read that
  // cannot reach the server is treated as a failed load and Save stays blocked.
  useEffect(() => {
    if (!isSuperAdmin) return;
    getDocFromServer(doc(db, 'system_config', 'feature_flags'))
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
        setError('לא הצלחנו לקרוא את הדגלים מהשרת. בדקו את החיבור ורעננו את הדף. השמירה חסומה עד שהקריאה תצליח.');
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

      {/* Force update — app_config/app_version, independent load/save */}
      <AppVersionAdminCard />
    </div>
  );
}
