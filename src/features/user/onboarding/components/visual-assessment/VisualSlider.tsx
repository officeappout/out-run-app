'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import OnboardingStoryBar from '../OnboardingStoryBar';
import { STRENGTH_PHASES } from '../../constants/onboarding-phases';
import type { UserDemographics } from '../../types/visual-assessment.types';
import {
  resolveContent,
  prefetchAdjacent,
  prefetchVideoUrl,
  getOnboardingLevelsForCategory,
  type ResolvedContent,
} from '../../services/visual-content-resolver.service';

// ── Category display metadata ──────────────────────────────────────

const CATEGORY_META: Record<string, { he: string; en: string; emoji: string; color: string }> = {
  push:      { he: 'דחיפה',            en: 'Push',      emoji: '💪', color: '#5BC2F2' },
  pull:      { he: 'משיכה',            en: 'Pull',      emoji: '🤸', color: '#8b5cf6' },
  legs:      { he: 'פלג גוף תחתון',   en: 'Legs',      emoji: '🦵', color: '#10b981' },
  core:      { he: 'ליבה',             en: 'Core',      emoji: '🔥', color: '#f59e0b' },
  handstand: { he: 'עמידת ידיים',    en: 'Handstand', emoji: '🤸‍♂️', color: '#ec4899' },
  skills:    { he: 'מיומנויות',      en: 'Skills',    emoji: '⭐', color: '#6366f1' },
  oap:               { he: 'מתח יד אחת',     en: 'One Arm Pull-up',   emoji: '💪', color: '#8b5cf6' },
  pull_up_pro:       { he: 'מתח יד אחת',     en: 'One Arm Pull-up',   emoji: '💪', color: '#8b5cf6' },
  one_arm_pullup:    { he: 'מתח יד אחת',     en: 'One Arm Pull-up',   emoji: '💪', color: '#8b5cf6' },
  muscle_up:         { he: 'עליית כוח',      en: 'Muscle Up',         emoji: '🤸', color: '#6366f1' },
  muscleup:          { he: 'עליית כוח',      en: 'Muscle Up',         emoji: '🤸', color: '#6366f1' },
  planche:           { he: 'פלאנץ׳',         en: 'Planche',           emoji: '⚖️', color: '#f59e0b' },
  front_lever:       { he: 'פרונט ליבר',     en: 'Front Lever',       emoji: '🏋️', color: '#10b981' },
  handstand_pushup:  { he: 'שכיבות סמיכה בעמידת ידיים', en: 'Handstand Push-up', emoji: '🤸‍♂️', color: '#ec4899' },
  hspu:              { he: 'שכיבות סמיכה בעמידת ידיים', en: 'Handstand Push-up', emoji: '🤸‍♂️', color: '#ec4899' },
};

// ── Hardcoded fallback steps ─────────────────────────────────────
const FALLBACK_SIMPLE_STEPS: Record<string, number[]> = {
  push: [1, 4, 7, 10, 13, 16, 20],
  pull: [1, 4, 7, 10, 13, 16, 20],
  legs: [1, 4, 7, 10, 13, 16, 20],
  core: [1, 4, 7, 10, 13, 16, 20],
};

function nearestStepIndex(steps: number[], realLevel: number): number {
  let best = 0;
  let bestDist = Math.abs(steps[0] - realLevel);
  for (let i = 1; i < steps.length; i++) {
    const dist = Math.abs(steps[i] - realLevel);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  return best;
}

// ── Props ──────────────────────────────────────────────────────────

interface VisualSliderProps {
  category: string;
  initialLevel: number;
  demographics: UserDemographics;
  lang?: string;
  onLevelConfirm: (level: number) => void;
  onBack?: () => void;
  stepIndex: number;
  totalSteps: number;
  minLevel?: number;
  maxLevel?: number;
  mode?: 'simple' | 'deep';
}

// ── Component ──────────────────────────────────────────────────────

export default function VisualSlider({
  category,
  initialLevel,
  demographics,
  lang = 'he',
  onLevelConfirm,
  onBack,
  stepIndex,
  totalSteps,
  minLevel = 1,
  maxLevel = 25,
  mode = 'deep',
}: VisualSliderProps) {
  const [dynamicSteps, setDynamicSteps] = useState<number[] | null>(null);
  const [stepsLoading, setStepsLoading] = useState(mode === 'simple');
  const [level, setLevel] = useState(Math.max(minLevel, Math.min(maxLevel, initialLevel)));
  const [sliderVal, setSliderVal] = useState(0);
  const [resolved, setResolved] = useState<ResolvedContent | null>(null);
  const [contentFading, setContentFading] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [userInteracted, setUserInteracted] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const sliderRef = useRef<HTMLInputElement>(null);
  const prevSliderValRef = useRef<number | null>(null);

  const meta = useMemo(() =>
    CATEGORY_META[category] ?? CATEGORY_META[category.toLowerCase()] ?? {
      he: category, en: category, emoji: '📊', color: '#5BC2F2',
    },
  [category]);

  // ── Phase-based progress: assessment is Phase 4 of 5 ────────
  const assessmentFillPercent = totalSteps > 0
    ? Math.min(100, Math.round(((stepIndex + 1) / totalSteps) * 100))
    : 100;

  // ── Load admin-defined onboarding levels ────────────────────
  useEffect(() => {
    if (mode !== 'simple') { setDynamicSteps(null); setStepsLoading(false); return; }
    let cancelled = false;
    setStepsLoading(true);
    getOnboardingLevelsForCategory(category).then(levels => {
      if (cancelled) return;
      const filtered = levels.filter(l => l >= minLevel && l <= maxLevel);
      if (filtered.length >= 2) {
        setDynamicSteps(filtered);
      } else {
        const fb = FALLBACK_SIMPLE_STEPS[category.toLowerCase()];
        setDynamicSteps(fb ? fb.filter(s => s >= minLevel && s <= maxLevel) : null);
      }
      setStepsLoading(false);
    }).catch(() => {
      if (cancelled) return;
      const fb = FALLBACK_SIMPLE_STEPS[category.toLowerCase()];
      setDynamicSteps(fb ? fb.filter(s => s >= minLevel && s <= maxLevel) : null);
      setStepsLoading(false);
    });
    return () => { cancelled = true; };
  }, [category, mode, minLevel, maxLevel]);

  const steps = mode === 'simple' ? dynamicSteps : null;
  const isSimple = !!steps && steps.length > 1;
  const sliderMin = isSimple ? 0 : minLevel;
  const sliderMax = isSimple ? steps!.length - 1 : maxLevel;

  // ── Load content on mount / category change ─────────────────
  useEffect(() => {
    if (stepsLoading) return;
    mountedRef.current = true;
    setShowHint(true);
    setUserInteracted(false);
    const sv = isSimple ? 0 : minLevel;
    const realLvl = isSimple ? steps![0] : minLevel;
    setLevel(realLvl);
    setSliderVal(sv);
    prevSliderValRef.current = sv;
    fetchContent(category, realLvl);

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, initialLevel, minLevel, maxLevel, mode, stepsLoading, dynamicSteps]);

  // Auto-dismiss hint after the animation finishes (2 loops × 3s = ~6s)
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 6500);
    return () => clearTimeout(t);
  }, [category]);

  const fetchContent = useCallback(
    async (cat: string, lvl: number) => {
      try {
        setContentFading(true);
        const content = await resolveContent(cat, lvl, demographics, lang);
        if (!mountedRef.current) return;
        setResolved(content);
        setTimeout(() => setContentFading(false), 50);

        prefetchAdjacent(cat, lvl, demographics, lang, minLevel, maxLevel);
        if (content.videoUrlWebm) prefetchVideoUrl(content.videoUrlWebm);
        if (content.videoUrlMov) prefetchVideoUrl(content.videoUrlMov);
        if (content.videoUrl) prefetchVideoUrl(content.videoUrl);
      } catch (err) {
        console.error('[VisualSlider] resolve error:', err);
        setContentFading(false);
      }
    },
    [demographics, lang, minLevel, maxLevel],
  );

  const handleSliderChange = useCallback(
    (newSliderVal: number) => {
      if (!userInteracted) { setUserInteracted(true); setShowHint(false); }
      const clamped = Math.max(sliderMin, Math.min(sliderMax, newSliderVal));

      // Haptic feedback — only fires when the step actually changes
      if (prevSliderValRef.current !== null && clamped !== prevSliderValRef.current) {
        const range = sliderMax - sliderMin;
        const normalizedPos = range > 0 ? (clamped - sliderMin) / range : 0;
        const vibrationMs = Math.round(5 + normalizedPos * 35); // 5ms (easy) → 40ms (hard)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(vibrationMs);
        }
      }
      prevSliderValRef.current = clamped;

      setSliderVal(clamped);
      const realLevel = isSimple ? steps![clamped] : clamped;
      setLevel(realLevel);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchContent(category, realLevel);
      }, 300);
    },
    [category, fetchContent, sliderMin, sliderMax, isSimple, steps, userInteracted],
  );

  const handleConfirm = () => onLevelConfirm(level);

  // ── Derived values ───────────────────────────────────────────
  const sliderRange = sliderMax - sliderMin;
  const fillPct = sliderRange > 0 ? ((sliderVal - sliderMin) / sliderRange) * 100 : 0;

  const isFemale = demographics.gender === 'female';

  // Resolves CMS slash patterns like "דוחף/ת" → "דוחפת" (female) or "דוחף" (male).
  // Pattern: base/suffix — suffix appended for female, stripped for male.
  const resolveGenderedText = (text: string): string =>
    text.replace(/(\S+)\/(\S+)/g, (_, base: string, suffix: string) =>
      isFemale ? base + suffix : base,
    );

  // Bubble text: ONLY show admin-set onboardingBubbleText (no fallback)
  const rawBubbleText = resolved?.onboardingBubbleText || null;
  const bubbleText = rawBubbleText ? resolveGenderedText(rawBubbleText) : null;

  // Exercise name for below-video label: ONLY exerciseName (no fallback)
  const exerciseLabel = resolved?.exerciseName || null;

  // Gender-aware performance label (reps or seconds)
  const targetReps = resolved?.targetReps || null;
  const unitType = resolved?.unitType ?? 'reps';
  const verb = unitType === 'seconds' ? 'להחזיק' : 'לבצע';
  const unitWord = unitType === 'seconds' ? 'שניות' : 'חזרות';
  const repsLabel = targetReps
    ? isFemale
      ? `מסוגלת ${verb} ${targetReps} ${unitWord}`
      : `מסוגל ${verb} ${targetReps} ${unitWord}`
    : null;


  if (stepsLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Unified header: back button + story bar ── */}
      <header className="flex-shrink-0 flex items-center gap-2 px-3 pb-2">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-slate-100/80 active:bg-slate-200 transition-colors touch-manipulation"
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
            phaseFillPercent={assessmentFillPercent}
            phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.ASSESSMENT]}
            noPadding
          />
        </div>
        <div className="flex-shrink-0 w-9" aria-hidden />
      </header>

      {/* ── Instruction text — Large, Black, Bold ── */}
      <div className="px-6 pt-3 pb-1 flex-shrink-0">
        <p className="text-xl font-black text-slate-900 text-center leading-snug">
          {isFemale
            ? 'בואי נבדוק מה מצב הכושר שלך כיום '
            : 'בוא נבדוק מה מצב הכושר שלך כיום '}
        </p>
        <p className="text-sm font-medium text-slate-500 text-center mt-1 leading-relaxed">
          {isFemale
            ? 'הזיזי את הסליידר למה שהכי קרוב אלייך. לא בטוחה? תבחרי בערך, והמערכת כבר תדע לעשות את ההתאמות המדויקות לרמת הכושר שלך באימונים 🤍'
            : 'הזיז את הסליידר למה שהכי קרוב אליך. לא בטוח? תבחר בערך, והמערכת כבר תדע לעשות את ההתאמות המדויקות לרמת הכושר שלך באימונים'}
        </p>
      </div>

      {/* ── Hero video — outer wrapper is NOT overflow-hidden so top gradient can bleed up freely ── */}
      <div className="flex-1 min-h-0 w-full relative">
        {/* Inner clip box — keeps video pixels inside its bounds */}
        <div className="absolute inset-0 overflow-hidden">
          <VideoPlayer
            videoUrl={resolved?.videoUrl ?? null}
            videoUrlMov={resolved?.videoUrlMov ?? null}
            videoUrlWebm={resolved?.videoUrlWebm ?? null}
            thumbnailUrl={resolved?.thumbnailUrl ?? null}
            className="w-full h-full"
            whiteGradient
          />
        </div>
        {/* Top gradient — sibling of clip box, escapes overflow-hidden, bleeds into header */}
        <div
          className="absolute top-[-6px] left-0 right-0 pointer-events-none z-10"
          style={{
            height: 'clamp(56px, 20%, 110px)',
            background: 'linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,0.85), rgba(255,255,255,0.5), rgba(255,255,255,0))',
          }}
        />
      </div>

      {/* ── Description card — exercise name + strength description + reps ── */}
      <AnimatePresence mode="wait">
        {(exerciseLabel || bubbleText || repsLabel) && (
          <motion.div
            key={`${exerciseLabel}_${bubbleText}_${targetReps}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: contentFading ? 0 : 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex-shrink-0 px-6 pb-3"
          >
            <div className="bg-[#00BAF7]/6 border border-[#00BAF7]/20 rounded-2xl px-4 py-3 text-center space-y-0.5">
              {/* 1 — Exercise name */}
              {exerciseLabel && (
                <h3 className="text-2xl font-bold text-slate-950 leading-snug">
                  {exerciseLabel}
                </h3>
              )}
              {/* 2 — Performance benchmark (reps/seconds) */}
              {repsLabel && (
                <p className="text-lg font-normal text-slate-950 leading-snug">
                  {repsLabel}
                </p>
              )}
              {/* 3 — Dynamic strength description sentence */}
              {bubbleText && (
                <p className="text-sm font-normal text-slate-950 leading-snug">
                  {bubbleText}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom controls — flex-shrink-0, anchored above safe area ── */}
      <div
        className="flex-shrink-0 px-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        {/* Range slider — px-0 so the track endpoints align exactly with dot paddingLeft/Right: 14 */}
        <div className="relative px-0">
          <input
            ref={sliderRef}
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={sliderVal}
            onChange={e => handleSliderChange(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer slider-thumb relative z-10"
            style={{
              background: `linear-gradient(to left, #00BAF7 0%, #00BAF7 ${fillPct}%, #e2e8f0 ${fillPct}%, #e2e8f0 100%)`,
            }}
          />

          {/* Step dot markers — visible in simple mode only.
               left/right: 14px = thumb half-width, so right:0% lands exactly on the
               right-end thumb center and right:100% on the left-end thumb center. */}
          {isSimple && steps && steps.length > 1 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-[5]"
              style={{ left: 14, right: 14 }}
            >
              {steps.map((_, i) => {
                const pct = (i / (steps.length - 1)) * 100;
                const active = i <= sliderVal;
                return (
                  <div
                    key={i}
                    className="absolute -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2 transition-colors duration-150"
                    style={{
                      top: '50%',
                      right: `${pct}%`,
                      backgroundColor: active ? '#00BAF7' : 'white',
                      borderColor: active ? '#00BAF7' : '#cbd5e1',
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Sliding hand hint — plays twice on mount, larger & slower */}
          <AnimatePresence>
            {showHint && !userInteracted && (
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20"
                initial={{ right: '15%', opacity: 0 }}
                animate={{
                  right: ['15%', '75%', '15%', '75%', '40%'],
                  opacity: [0, 0.9, 0.3, 0.9, 0],
                }}
                transition={{ duration: 5, ease: 'easeInOut' }}
                onAnimationComplete={() => setShowHint(false)}
              >
                <span className="text-4xl drop-shadow-lg">👆</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 3-point proficiency labels — gender-aware, aligned under first/mid/last dots */}
          <div className="flex items-center mt-2 px-1">
            <span className="text-[10px] font-medium text-slate-400 text-right" style={{ width: '33.33%' }}>
              {isFemale ? 'מתחילה' : 'מתחיל'}
            </span>
            <span className="text-[10px] font-medium text-slate-400 text-center" style={{ width: '33.33%' }}>
              בינוני
            </span>
            <span className="text-[10px] font-medium text-slate-400 text-left" style={{ width: '33.33%' }}>
              {isFemale ? 'מתקדמת' : 'מתקדם'}
            </span>
          </div>
        </div>

        {/* Confirm button — gradient fill + AI glow */}
        <button
          onClick={handleConfirm}
          className="w-full py-4 mt-3 rounded-full font-black text-lg text-white active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            backgroundImage: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
            fontFamily: 'var(--font-simpler)',
            boxShadow:
              '0 8px 20px rgba(0,186,247,0.25), 0 0 40px rgba(112,0,255,0.10), 0 0 0 1px rgba(0,186,247,0.12)',
          }}
        >
          {stepIndex < totalSteps - 1 ? (
            <>
              <span>הבא</span>
              <span className="text-xl">←</span>
            </>
          ) : (
            <span>סיום הערכה</span>
          )}
        </button>
      </div>

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: 3px solid #00BAF7;
          box-shadow: 0 2px 8px rgba(0, 186, 247, 0.25);
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .slider-thumb::-webkit-slider-thumb:active {
          transform: scale(1.15);
        }
        .slider-thumb::-moz-range-thumb {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: 3px solid #00BAF7;
          box-shadow: 0 2px 8px rgba(0, 186, 247, 0.25);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
