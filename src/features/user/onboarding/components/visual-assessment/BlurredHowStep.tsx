'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import OnboardingStoryBar from '../OnboardingStoryBar';
import { STRENGTH_PHASES } from '../../constants/onboarding-phases';

// ── Bullet definitions — explicit male / female copy ──────────────

interface BulletDef {
  emoji: string;
  label: { male: string; female: string };
  detail: { male: string; female: string };
}

const HOW_BULLETS: BulletDef[] = [
  {
    emoji: '🎚️',
    label: {
      male:   'גרירת הסקאלה משנה את התרגיל',
      female: 'גרירת הסקאלה משנה את התרגיל',
    },
    detail: {
      male:   'בכל פעם שתזוז על הסקאלה, רמת הקושי תשתנה והסרטון יתחלף כדי להראות לך את התרגיל המדויק לרמה הזו.',
      female: 'בכל פעם שתזזי על הסקאלה, רמת הקושי תשתנה והסרטון יתחלף כדי להראות לך את התרגיל המדויק לרמה הזו.',
    },
  },
  {
    emoji: '📏',
    label: {
      male:   'בדוק את המינימום',
      female: 'בדקי את המינימום',
    },
    detail: {
      male:   'מתחת לכל סרטון יופיע טווח החזרות או הזמן המינימלי שצריך לבצע ברמה הזו.',
      female: 'מתחת לכל סרטון יופיע טווח החזרות או הזמן המינימלי שצריך לבצע ברמה הזו.',
    },
  },
  {
    emoji: '⬅️',
    label: {
      male:   'לא מצליח להגיע למינימום?',
      female: 'לא מצליחה להגיע למינימום?',
    },
    detail: {
      male:   'אל תישאר שם, פשוט תגלול שמאלה לרמות נמוכות וקלות יותר.',
      female: 'אל תישארי שם, פשוט תגללי שמאלה לרמות נמוכות וקלות יותר.',
    },
  },
  {
    emoji: '🤔',
    label: {
      male:   'לא בטוח ב-100%?',
      female: 'לא בטוחה ב-100%?',
    },
    detail: {
      male:   'תבחר בערך, אל תתקע. בהמשך הדרך המערכת תלמד אותך ותדייק את הרמות שלך אוטומטית.',
      female: 'תבחרי בערך, אל תתקעי. בהמשך הדרך המערכת תלמד אותך ותדייק את הרמות שלך אוטומטית.',
    },
  },
];

// ── Props ──────────────────────────────────────────────────────────

interface BlurredHowStepProps {
  gender: 'male' | 'female';
  exerciseCount: number;
  onNext: () => void;
  onBack: () => void;
}

// ── Animation easing ──────────────────────────────────────────────
const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

// ── Component ──────────────────────────────────────────────────────

export default function BlurredHowStep({
  gender,
  exerciseCount,
  onNext,
  onBack,
}: BlurredHowStepProps) {
  const g = gender === 'female' ? 'female' : 'male';

  return (
    <div className="relative flex flex-col h-full bg-slate-50" dir="rtl">

      {/* ── Layer 1: Decorative ambient blobs ───────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute top-[40%] -left-20 w-56 h-56 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] w-52 h-52 rounded-full bg-sky-200/25 blur-3xl" />
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

        {/* Header — back + story bar only */}
        <header className="flex-shrink-0 flex items-center gap-2 px-3 pb-2">
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white/60 active:bg-white/80 transition-colors touch-manipulation backdrop-blur-sm"
            aria-label="חזרה"
          >
            <ChevronRight size={22} className="text-slate-600" />
          </button>
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
              איך הבדיקה עובדת?
            </motion.h2>

            {exerciseCount > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4, ease: EASE_OUT }}
                className="w-full text-sm font-normal text-slate-400 text-center mb-2"
              >
                {exerciseCount} תרגילים · פחות מ-2 דקות
              </motion.p>
            )}

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/lemur/lemur_curious_peek.png"
                alt=""
                className="w-24 h-auto object-contain"
                style={{ filter: 'drop-shadow(0 8px 20px rgba(0,186,247,0.22))' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </motion.div>

            {/* Full-width speech bubble — delay 300ms */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: EASE_OUT }}
              className="w-full relative mt-2"
            >
              {/*
                Bubble tail: upward-pointing triangle on the top of the card,
                aligned to the right where Kelly stands.
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
                {/* Bullet rows — staggered 450ms → 750ms */}
                <div className="divide-y divide-white/30">
                  {HOW_BULLETS.map((bullet, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.45 + i * 0.08,
                        duration: 0.45,
                        ease: EASE_OUT,
                      }}
                      className="flex items-start gap-3 py-4"
                    >
                      <span className="text-2xl flex-shrink-0 mt-0.5 select-none" aria-hidden>
                        {bullet.emoji}
                      </span>
                      <div className="space-y-1.5 text-right">
                        <p className="text-base font-semibold text-slate-900 leading-snug">
                          {bullet.label[g]}
                        </p>
                        <p className="text-sm font-normal text-slate-600 leading-loose">
                          {bullet.detail[g]}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

          </div>
        </div>

        {/* ── CTA — delay 750ms (after last bullet), pinned at bottom ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5, ease: EASE_OUT }}
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
            הבנתי, בוא נתחיל בבדיקה!
          </button>
        </motion.div>

      </div>
    </div>
  );
}
