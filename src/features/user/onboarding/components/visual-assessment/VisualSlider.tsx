'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

  // Bubble text: ONLY show admin-set onboardingBubbleText (no fallback)
  const bubbleText = resolved?.onboardingBubbleText || null;

  // Exercise name for below-video label: ONLY exerciseName (no fallback)
  const exerciseLabel = resolved?.exerciseName || null;

  // Bubble position: track slider thumb (account for thumb width offset)
  const bubbleLeftPct = fillPct;

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
      {/* ── Shared story bar — 5-phase with partial fill for assessment ── */}
      <OnboardingStoryBar
        totalPhases={STRENGTH_PHASES.TOTAL}
        currentPhase={STRENGTH_PHASES.ASSESSMENT}
        phaseFillPercent={assessmentFillPercent}
        phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.ASSESSMENT]}
      />

      {/* ── Instruction text — Large, Black, Bold ── */}
      <div className="px-6 pt-3 pb-1 flex-shrink-0">
        <p className="text-xl font-black text-slate-900 text-center leading-snug">
          בואו נבין איפה אתם עומדים
        </p>
        <p className="text-sm font-medium text-slate-500 text-center mt-1">
          הזיזו את הסליידר עד שתמצאו את התרגיל שלכם
        </p>
      </div>

      {/* ── Hero video — fills maximum available space ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-0 min-h-0 relative">
        <div className="w-full max-w-md mx-auto">
          <VideoPlayer
            videoUrl={resolved?.videoUrl ?? null}
            videoUrlMov={resolved?.videoUrlMov ?? null}
            videoUrlWebm={resolved?.videoUrlWebm ?? null}
            thumbnailUrl={resolved?.thumbnailUrl ?? null}
            className="w-full"
            whiteGradient
          />
        </div>

        {/* Exercise name / bold title below the faded video */}
        <AnimatePresence mode="wait">
          {exerciseLabel && (
            <motion.div
              key={exerciseLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: contentFading ? 0 : 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="text-center px-6 mt-1"
            >
              <h3 className="text-lg font-black text-slate-800 leading-snug">
                {exerciseLabel}
              </h3>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom controls — anchored to safe area ── */}
      <div
        className="flex-shrink-0 px-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        {/* Following bubble — tracks the slider thumb */}
        <div className="relative h-10 mb-1">
          <AnimatePresence>
            {bubbleText && (
              <motion.div
                key={bubbleText}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: contentFading ? 0 : 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="absolute bottom-0 z-30"
                style={{
                  right: `${bubbleLeftPct}%`,
                  transform: 'translateX(50%)',
                  maxWidth: '240px',
                }}
              >
                <span
                  className="inline-block px-4 py-1.5 rounded-xl text-[13px] font-semibold text-white shadow-md whitespace-nowrap"
                  style={{
                    background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
                  }}
                >
                  {bubbleText}
                </span>
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45"
                  style={{ backgroundColor: meta.color }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Range slider */}
        <div className="relative px-1">
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
              background: `linear-gradient(to left, ${meta.color} 0%, ${meta.color} ${fillPct}%, #e2e8f0 ${fillPct}%, #e2e8f0 100%)`,
            }}
          />

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

          <div className="flex justify-between mt-1.5 px-0.5">
            <span className="text-[10px] font-bold text-slate-400">קל</span>
            <span className="text-[10px] font-bold text-slate-400">קשה</span>
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          className="w-full py-4 mt-3 rounded-2xl font-bold text-lg text-white active:scale-[0.97] shadow-lg transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: meta.color }}
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
          border: 3px solid ${meta.color};
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
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
          border: 3px solid ${meta.color};
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
