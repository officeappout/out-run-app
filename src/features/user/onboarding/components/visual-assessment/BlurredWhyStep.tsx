'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import OnboardingStoryBar from '../OnboardingStoryBar';
import { STRENGTH_PHASES } from '../../constants/onboarding-phases';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import { genderArg, type Gender, type MessageValues } from '@/lib/i18n/core/i18n-core';

// ── Age group buckets ──────────────────────────────────────────────

export function calcAgeGroup(age: number): string {
  if (age < 18) return '14-18';
  if (age < 21) return '18-21';
  if (age < 26) return '21-26';
  if (age < 50) return '26-50';
  return '50+';
}

// ── Target-area IDs with a clean display name ─────────────────────
// The names live in src/messages/he/onboarding.json (quiz.why.area, an ICU select on these ids).

const TARGET_AREA_IDS = new Set([
  'push', 'pull', 'legs', 'core', 'handstand', 'skills', 'muscle_up', 'muscleup', 'planche',
  'front_lever', 'back_lever', 'handstand_pushup', 'hspu', 'one_arm_pullup', 'oap', 'pull_up_pro',
  'pull_up', 'push_up', 'l_sit', 'human_flag', 'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'full_body', 'abs', 'glutes', 'arms',
]);

function sanitizeTargetArea(raw: string | null): string | null {
  if (!raw) return null;
  const id = raw.toLowerCase().trim();
  return TARGET_AREA_IDS.has(id) ? id : null;
}

// ── Copy matrix ────────────────────────────────────────────────────
// age group × goal → quiz.why.<age>.<goal>.body / .cta in src/messages/he/onboarding.json, each an
// ICU `gender` select (female / male / other = neutral, plural). The body's {area} falls back to "the
// element / the areas you picked" inside the message (`hasArea`), and {count} is "one exercise"
// for 1 (`=1`), "<n> exercises" otherwise — same as the old exerciseCountPhrase.

type GoalKey = 'health' | 'muscle' | 'skills';

const AGE_KEYS: Record<string, 'age14to18' | 'age18to21' | 'age21to26' | 'age26to50' | 'age50plus'> = {
  '14-18': 'age14to18',
  '18-21': 'age18to21',
  '21-26': 'age21to26',
  '26-50': 'age26to50',
  '50+': 'age50plus',
};

// ── Matrix lookup with fallback chain ─────────────────────────────

export function getOnboardingIntroText(
  t: (key: NamespaceKey<typeof onboarding>, values?: MessageValues) => string,
  gender: Gender | null | undefined,
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

  // Unknown age group → 26-50. Gender: male / female / other — unknown or "other" gets the
  // neutral (plural) title, body and CTA (owner decisions 21.10.2026, gender batch 3).
  const age = Object.prototype.hasOwnProperty.call(AGE_KEYS, ageGroup) ? AGE_KEYS[ageGroup] : 'age26to50';
  const copyGender = genderArg(gender);

  const areaId = sanitizeTargetArea(targetArea);
  const area = areaId ? t('quiz.why.area', { area: areaId }) : '';

  return {
    title: t('quiz.why.title', { gender: copyGender }),
    body: t(`quiz.why.${age}.${normalizedGoal}.body`, {
      gender: copyGender,
      hasArea: areaId ? 'yes' : 'no',
      area,
      count: exerciseCount,
    }),
    cta: t(`quiz.why.${age}.${normalizedGoal}.cta`, { gender: copyGender }),
  };
}

// ── Props ──────────────────────────────────────────────────────────

interface BlurredWhyStepProps {
  /** The quiz's gender: male / female / other (neutral copy). */
  gender: Gender;
  ageGroup: string;
  goal: string | null;
  targetArea: string | null;
  exerciseCount: number;
  onNext: () => void;
  onBack?: () => void;
  /** enable_home_v2 — v2 look; CTA adds no second bottom inset. */
  v2?: boolean;
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
  v2 = false,
}: BlurredWhyStepProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const t = useT(onboarding);
  const intro = getOnboardingIntroText(t, gender, ageGroup, goal, targetArea, exerciseCount);
  const sentences = splitSentences(intro.body);

  // ── v2 (enable_home_v2) ────────────────────────────────────────
  // Same copy, same handlers. <main> already pads the top and bottom
  // safe-area insets on this route, so the CTA only adds its own 12px
  // (the legacy max(inset,16px) doubled the bottom gap).
  if (v2) {
    return (
      <div className="relative flex h-full min-h-0 flex-col bg-v2-surface text-v2-ink" dir="rtl">
        <header className="flex flex-shrink-0 items-center gap-2 px-3 pb-1 pt-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] touch-manipulation"
              aria-label={t('quiz.why.back')}
            >
              <ChevronRight size={20} className="text-v2-ink" />
            </button>
          ) : (
            <div className="w-10 flex-shrink-0" aria-hidden />
          )}
          <div className="flex min-h-[40px] flex-1 flex-col justify-center">
            <OnboardingStoryBar
              totalPhases={STRENGTH_PHASES.TOTAL}
              currentPhase={STRENGTH_PHASES.ASSESSMENT}
              phaseFillPercent={0}
              phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.ASSESSMENT]}
              noPadding
            />
          </div>
          <div className="w-10 flex-shrink-0" aria-hidden />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col px-4 pb-4 pt-3">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.45, ease: EASE_OUT }}
              className="text-[26px] font-black leading-[1.15] !tracking-[-0.02em]"
            >
              {intro.title}
            </motion.h2>

            {!imgFailed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: EASE_OUT }}
                className="mt-2 flex w-full justify-start select-none"
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/lemur/lemur_curious_peek.png"
                  alt=""
                  className="h-auto w-20 object-contain"
                  onError={() => setImgFailed(true)}
                />
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.45, ease: EASE_OUT }}
              className={`relative w-full ${imgFailed ? 'mt-4' : 'mt-2'}`}
            >
              {!imgFailed && (
                <div
                  className="pointer-events-none absolute -top-[9px] right-7 z-10 h-[18px] w-[18px] rotate-45 rounded-[4px] bg-white"
                  aria-hidden
                />
              )}
              <div className="w-full space-y-3 rounded-v2-card bg-white p-5 shadow-v2-card">
                {sentences.map((sentence, i) => (
                  <p key={i} className="text-right text-[16px] font-medium leading-relaxed text-v2-ink-2">
                    {sentence}
                  </p>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.45, ease: EASE_OUT }}
          className="flex-shrink-0 px-4 pb-3 pt-2"
        >
          <button
            type="button"
            onClick={onNext}
            className="flex h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full bg-v2-cta text-[16.5px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <span className="truncate">{intro.cta}</span>
          </button>
        </motion.div>
      </div>
    );
  }

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
              aria-label="חזרה" // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
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
