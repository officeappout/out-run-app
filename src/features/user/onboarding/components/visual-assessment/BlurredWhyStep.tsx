'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import OnboardingStoryBar from '../OnboardingStoryBar';
import { STRENGTH_PHASES } from '../../constants/onboarding-phases';

// ── Age group buckets ──────────────────────────────────────────────

export function calcAgeGroup(age: number): string {
  if (age < 18) return '14-18';
  if (age < 21) return '18-21';
  if (age < 26) return '21-26';
  if (age < 50) return '26-50';
  return '50+';
}

// ── Target-area ID → clean Hebrew display name ────────────────────

const TARGET_AREA_NAMES: Record<string, string> = {
  push:             'דחיפה',
  pull:             'משיכה',
  legs:             'פלג גוף תחתון',
  core:             'ליבה',
  handstand:        'עמידת ידיים',
  skills:           'מיומנויות',
  muscle_up:        'עליית כוח',
  muscleup:         'עליית כוח',
  planche:          "פלאנץ'",
  front_lever:      'פרונט לבר',
  back_lever:       'בק לבר',
  handstand_pushup: 'שכיבות סמיכה בעמידת ידיים',
  hspu:             'שכיבות סמיכה בעמידת ידיים',
  one_arm_pullup:   'מתח יד אחת',
  oap:              'מתח יד אחת',
  pull_up_pro:      'מתח יד אחת',
  pull_up:          'מתח',
  push_up:          'שכיבות סמיכה',
  l_sit:            'L-סיט',
  human_flag:       'דגל אנושי',
  chest:            'חזה',
  back:             'גב',
  shoulders:        'כתפיים',
  biceps:           'ביספס',
  triceps:          'טרייספס',
  full_body:        'גוף מלא',
  abs:              'בטן',
  glutes:           'ישבן',
  arms:             'ידיים',
};

function sanitizeTargetArea(raw: string | null): string | null {
  if (!raw) return null;
  return TARGET_AREA_NAMES[raw.toLowerCase().trim()] ?? null;
}

// ── Copy matrix types ──────────────────────────────────────────────

interface IntroContent {
  body: (targetArea: string | null, exerciseCount: number) => string;
  cta: string;
}

type GoalKey = 'health' | 'muscle' | 'skills';

// ── Full copy matrix ───────────────────────────────────────────────

const MATRIX: {
  [ageGroup: string]: {
    [goal in GoalKey]?: { male?: IntroContent; female?: IntroContent };
  };
} = {

  '14-18': {
    skills: {
      male: {
        body: (t, n) =>
          `לשלוט בגוף ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} זו מטרה מעולה. כדי להגיע לזה בצורה חכמה ובלי פציעות, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים, תסמן בדיוק מה אתה מצליח כדי שנתאים את השלבים לקצב שלך.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `לשלוט בגוף ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} זו מטרה מדהימה. כדי להגיע לזה בצורה חכמה ובלי פציעות, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים, תסמני בדיוק מה את מצליחה כדי שנתאים את השלבים לקצב שלך.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    muscle: {
      female: {
        body: (t, n) =>
          `אם המטרה שלך היא להרשים את החברות בים ולעצב בדיוק את ${t ?? 'האזורים שבחרת'}, אנחנו חייבים לדעת מאיפה להתחיל. מתחילוים במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שהתוכנית תתאים לך בול.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    health: {
      male: {
        body: (_t, n) =>
          `אם המטרה שלך היא לשפר את הכושר הכללי ולהרגיש אנרגטי יותר ביום יום, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שהתוכנית תתאים לך בול.`,
        cta: 'בוא נתקדם!',
      },
      female: {
        body: (_t, n) =>
          `אם המטרה שלך היא לשפר את הכושר הכללי ולהרגיש אנרגטית ובטוחה בעצמך ביום יום, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שהתוכנית תתאים לך בול.`,
        cta: 'בואי נתקדם!',
      },
    },
  },

  '18-21': {
    muscle: {
      male: {
        body: (t, n) =>
          `אם המטרה שלך היא לנצח את המנצ'ז של השקם בבסיס ולחטב בדיוק את ${t ?? 'האזורים שבחרת'}, אנחנו חייבים לדעת מאיפה להתחיל. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שנתאים לך אימונים קצרים שאפשר לתקתק בין המשימות.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `אם המטרה שלך היא לנצח את המשמינים בצבא ולחטב בדיוק את ${t ?? 'האזורים שבחרת'}, אנחנו חייבים לדעת מאיפה להתחיל. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שנתאים לך אימונים קצרים שאפשר לתקתק בין המשימות.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    skills: {
      male: {
        body: (t, n) =>
          `לשלוט בגוף ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} גם בתוך הלו"ז הצבאי השוחק זו מטרה מעולה. כדי להגיע לזה בצורה חכמה ובלי לפצוע את הגוף, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים, תסמן בדיוק מה אתה מצליח כדי שנתאים את השלבים לקצב שלך.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `לשלוט בגוף ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} גם בתוך הלו"ז הצבאי השוחק זו מטרה מדהימה. כדי להגיע לזה בצורה חכמה ובלי לפצוע את הגוף, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים, תסמני בדיוק מה את מצליחה כדי שנתאים את השלבים לקצב שלך.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    health: {
      male: {
        body: (_t, n) =>
          `אם המטרה שלך היא לשמור על הבריאות ולהרגיש הרבה יותר חזק ואנרגטי גם בתוך הלו"ז השוחק של הבסיס, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שנתאים לך אימונים שנכנסים בזמן הפנוי שלך.`,
        cta: 'בוא נתקדם!',
      },
      female: {
        body: (_t, n) =>
          `אם המטרה שלך היא לשמור על הבריאות והאנרגיה ולנצח את השגרה המעייפת של הבסיס, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שנתאים לך אימונים שאפשר לתקתק בקלות בחדר.`,
        cta: 'בואי נתקדם!',
      },
    },
  },

  '21-26': {
    muscle: {
      male: {
        body: (t, n) =>
          `אם המטרה שלך היא להחזיר שגרת אימונים מסודרת ולבנות בדיוק את ${t ?? 'האזורים שבחרת'} בלי לשלם הון לחדר כושר, אנחנו חייבים לדעת מאיפה להתחיל. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שנבנה לך שגרה שטסה איתך לכל מקום.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `אם המטרה שלך היא להחזיר שגרת אימונים מסודרת ולעצב בדיוק את ${t ?? 'האזורים שבחרת'} בלי לשבור תוכנית חיסכון על סטודיו יקר, אנחנו חייבות לדעת מאיפה להתחיל. מתחילות במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שנבנה לך שגרה שמתאימה ללייף סטייל שלך עכשיו.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    skills: {
      male: {
        body: (t, n) =>
          `לשלוט בגוף ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} בכל מקום שבו תהיה זו מטרה מעולה. כדי להגיע לזה בצורה חכמה, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים, תסמן בדיוק מה אתה מצליח כדי שנתאים את השלבים לקצב שלך.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `לשלוט בגוף ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} בכל מקום שבו תהיי זו מטרה מדהימה. כדי להגיע לזה בצורה חכמה, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים, תסמני בדיוק מה את מצליחה כדי שנתאים את השלבים לקצב שלך.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    health: {
      male: {
        body: (_t, n) =>
          `אם המטרה שלך היא לשמור על שגרה בריאה ולשפר את הכושר הכללי בין כל הבלגן, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שנבנה לך שגרה בריאה ויציבה.`,
        cta: 'בוא נתקדם!',
      },
      female: {
        body: (_t, n) =>
          `אם המטרה שלך היא לשמור על שגרה בריאה ולשפר את הכושר הכללי בין כל הבלגן, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שנבנה לך שגרה בריאה ויציבה.`,
        cta: 'בואי נתקדם!',
      },
    },
  },

  '26-50': {
    muscle: {
      male: {
        body: (t, n) =>
          `בתוך המרדף המטורף של הקריירה והבית, אם המטרה שלך היא להחזיר את האנרגיה ולחטב בדיוק את ${t ?? 'האזורים שבחרת'}, אנחנו חייבים לדעת מאיפה להתחיל. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שנתאים לך אימוני תכל'ס קצרים שנכנסים בלו"ז שלך בול.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `בתוך המרדף המטורף של הקריירה והבית, אם המטרה שלך היא להחזיר את האנרגיה ולעצב בדיוק את ${t ?? 'האזורים שבחרת'}, אנחנו חייבות לדעת מאיפה להתחיל. מתחילות במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שנתפור לך תוכנית שנכנסת בקלות בלו"ז שלך.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    skills: {
      male: {
        body: (t, n) =>
          `לשלוט בגוף בצורה מטורפת ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} גם כשהלו"ז צפוף זו מטרה מעולה. כדי להגיע לזה בצורה חכמה ובלי לפצוע את הגוף, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים, תסמן בדיוק מה אתה מצליח כדי שנתאים את שלבי ההתקדמות לקצב שלך.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `לשלוט בגוף בצורה מטורפת ולהצליח לעשות ${t ?? 'האלמנט שבחרת'} גם כשהלו"ז צפוף זו מטרה מדהימה. כדי להגיע לזה בצורה חכמה ובלי לפצוע את הגוף, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים, תסמני בדיוק מה את מצליחה כדי שנתאים את שלבי ההתקדמות לקצב שלך.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
    health: {
      male: {
        body: (_t, n) =>
          `אם המטרה שלך היא להחזיר את האנרגיה, למנוע כאבי גב ולשפר את הכושר הכללי בתוך כל עומס החיים, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח כדי שנתאים לך אימוני תכל'ס קצרים שיגנו על הגוף שלך.`,
        cta: 'בוא נתקדם!',
      },
      female: {
        body: (_t, n) =>
          `אם המטרה שלך היא להחזיר את האנרגיה, להרגיש בריאה וחזקה יותר ביום יום ולשפר את הכושר הכללי, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה כדי שנתפור לך תוכנית בריאה שנכנסת בקלות בלו"ז שלך.`,
        cta: 'בואי נתקדם!',
      },
    },
  },

  '50+': {
    health: {
      male: {
        body: (_t, n) =>
          `לשמור על החיוניות, להגן על המפרקים ולהישאר חזק בשביל המשפחה זו המטרה הכי חשובה ביום יום. כדי שנתקדם בצורה בטוחה ובקצב האישי שלך, נתחיל במבדק כוח קצר של ${n} תרגילים. תסמן בדיוק מה אתה מצליח והמערכת כבר תדאג לכל השאר.`,
        cta: 'בוא נתקדם!',
      },
      female: {
        body: (_t, n) =>
          `לשמור על החיוניות, להגן על המפרקים ולהישאר חזקה בשביל המשפחה זו המטרה הכי חשובה ביום יום. כדי שנתקדם בצורה בטוחה ובקצב האישי שלך, נתחיל במבדק כוח קצר של ${n} תרגילים. תסמני בדיוק מה את מצליחה והמערכת כבר תדאג לכל השאר.`,
        cta: 'בואי נתקדם!',
      },
    },
    skills: {
      male: {
        body: (t, n) =>
          `להציב לעצמך מטרה כמו ${t ?? 'האלמנט שבחרת'} ולשלוט בגוף בצורה חלקה זו השראה אמיתית. כדי לעשות את זה נכון ובלי להעמיס על המפרקים, הבסיס חייב להיות חזק. מתחילים במבדק כוח קצר של ${n} תרגילים, תסמן בדיוק מה אתה מצליח כדי שנתאים לך את שלבי הפרוגרסיה הבטוחים ביותר.`,
        cta: 'אני מוכן, בוא נמשיך!',
      },
      female: {
        body: (t, n) =>
          `להציב לעצמך מטרה כמו ${t ?? 'האלמנט שבחרת'} ולשלוט בגוף בצורה חלקה זו השראה אמיתית. כדי לעשות את זה נכון ובלי לפצוע את הגוף, הבסיס חייב להיות חזק. מתחילות במבדק כוח קצר של ${n} תרגילים, תסמני בדיוק מה את מצליחה כדי שנתאים לך את שלבי ההתקדמות הנכונים.`,
        cta: 'אני מוכנה, בואי נמשיך!',
      },
    },
  },
};

// ── Matrix lookup with fallback chain ─────────────────────────────

export function getOnboardingIntroText(
  gender: 'male' | 'female',
  ageGroup: string,
  goal: string | null,
  targetArea: string | null,
  exerciseCount: number,
): { title: string; body: string; cta: string } {
  const normalizedGoal: GoalKey =
    goal === 'body_focus' || goal === 'muscle'
      ? 'muscle'
      : goal === 'skills'
        ? 'skills'
        : 'health';

  const ageEntry = MATRIX[ageGroup] ?? MATRIX['26-50']!;
  const goalEntry = ageEntry[normalizedGoal] ?? ageEntry['health'];
  const entry: IntroContent | undefined =
    goalEntry?.[gender] ??
    goalEntry?.[gender === 'female' ? 'male' : 'female'] ??
    MATRIX['26-50']!.health![gender] ??
    MATRIX['26-50']!.health!.male!;

  const area = sanitizeTargetArea(targetArea);

  return {
    title: gender === 'female' ? 'בואי נכיר קצת יותר.' : 'בוא נכיר קצת יותר.',
    body: entry.body(area, exerciseCount),
    cta: entry.cta,
  };
}

// ── Props ──────────────────────────────────────────────────────────

interface BlurredWhyStepProps {
  gender: 'male' | 'female';
  ageGroup: string;
  goal: string | null;
  targetArea: string | null;
  exerciseCount: number;
  onNext: () => void;
  onBack?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Split body copy into individual sentence strings for paragraph rendering. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Animation easing ──────────────────────────────────────────────
const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

// ── Component ──────────────────────────────────────────────────────

export default function BlurredWhyStep({
  gender,
  ageGroup,
  goal,
  targetArea,
  exerciseCount,
  onNext,
  onBack,
}: BlurredWhyStepProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const intro = getOnboardingIntroText(gender, ageGroup, goal, targetArea, exerciseCount);
  const sentences = splitSentences(intro.body);

  return (
    <div className="relative flex flex-col h-full bg-slate-50" dir="rtl">

      {/* ── Layer 1: Decorative ambient blobs ───────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute top-[40%] -right-20 w-56 h-56 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-[8%] left-[10%] w-52 h-52 rounded-full bg-sky-200/25 blur-3xl" />
      </div>

      {/* ── Layer 2: Frosted glass — fades in first (delay 0ms) ──────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="absolute inset-0 backdrop-blur-3xl bg-white/10 pointer-events-none"
        aria-hidden
      />

      {/* ── Layer 3: UI content ─────────────────────────────────────── */}
      <div className="relative flex flex-col h-full">

        {/* Header — back + story bar only (no mascot icon) */}
        <header className="flex-shrink-0 flex items-center gap-2 px-3 pb-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white/60 active:bg-white/80 transition-colors touch-manipulation backdrop-blur-sm"
              aria-label="חזרה"
            >
              <ChevronRight size={22} className="text-slate-600" />
            </button>
          ) : (
            <div className="flex-shrink-0 w-9" aria-hidden />
          )}
          <div className="flex-1 min-h-[36px] flex flex-col justify-center">
            <OnboardingStoryBar
              totalPhases={STRENGTH_PHASES.TOTAL}
              currentPhase={STRENGTH_PHASES.ASSESSMENT}
              phaseFillPercent={0}
              phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.ASSESSMENT]}
              noPadding
            />
          </div>
          <div className="flex-shrink-0 w-9" aria-hidden />
        </header>

        {/* ── Scrollable content — stacked vertical layout ──────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center px-4 pt-2 pb-6">

            {/* Title — full width, centred above Kelly — delay 150ms */}
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: EASE_OUT }}
              className="w-full text-3xl font-black text-slate-900 text-center mt-4 mb-3 tracking-tight leading-tight"
            >
              {intro.title}
            </motion.h2>

            {/*
              Kelly mascot — right-aligned.
              In dir="rtl", `justify-start` = visual RIGHT (inline-start).
            */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.55, ease: EASE_OUT }}
              className="w-full flex justify-start select-none"
              aria-hidden
            >
              {imgFailed ? (
                <span
                  className="text-6xl"
                  style={{ filter: 'drop-shadow(0 6px 16px rgba(0,186,247,0.25))' }}
                >
                  🦊
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/assets/lemur/lemur_curious_peek.png"
                  alt=""
                  className="w-24 h-auto object-contain"
                  style={{ filter: 'drop-shadow(0 8px 20px rgba(0,186,247,0.22))' }}
                  onError={() => setImgFailed(true)}
                />
              )}
            </motion.div>

            {/* Full-width speech bubble — delay 300ms */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: EASE_OUT }}
              className="w-full relative mt-2"
            >
              {/*
                Bubble tail: upward-pointing triangle sitting on top of the card,
                aligned to the right where Kelly stands.
                `right-8` = 32px from the physical right edge.
              */}
              <div
                className="absolute -top-3 right-8 z-10 pointer-events-none"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderBottom: '12px solid rgba(255,255,255,0.65)',
                }}
                aria-hidden
              />

              {/* Bubble card — full width glassmorphism */}
              <div
                className="w-full bg-white/65 backdrop-blur-xl border border-white/40 rounded-3xl p-6"
                style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.06)' }}
              >
                {/* Body sentences — delay 450ms */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.5, ease: EASE_OUT }}
                  className="space-y-5"
                >
                  {sentences.map((sentence, i) => (
                    <p
                      key={i}
                      className="text-lg font-normal text-slate-700 text-right leading-relaxed tracking-wide"
                    >
                      {sentence}
                    </p>
                  ))}
                </motion.div>
              </div>
            </motion.div>

          </div>
        </div>

        {/* ── CTA — delay 600ms, pinned at bottom ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5, ease: EASE_OUT }}
          className="flex-shrink-0 px-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          <button
            onClick={onNext}
            className="w-full py-4 rounded-full font-black text-lg text-white active:scale-95 transition-all duration-200"
            style={{
              backgroundImage: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
              fontFamily: 'var(--font-simpler)',
              boxShadow:
                '0 8px 20px rgba(0,186,247,0.25), 0 0 40px rgba(112,0,255,0.10), 0 0 0 1px rgba(0,186,247,0.12)',
            }}
          >
            {intro.cta}
          </button>
        </motion.div>

      </div>
    </div>
  );
}
