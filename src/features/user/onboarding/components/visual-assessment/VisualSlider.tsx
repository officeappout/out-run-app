'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import VideoPlayer, { type VideoTier } from './VideoPlayer';
import CoverflowStrip from './CoverflowStrip';
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
import { resolveTierLabel, stepProportion, levelProportion } from '../../utils/assessment-tier-label';
import { hapticSelection } from '@/lib/haptics';

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
  // `resolved` carries text metadata only (exerciseName, bubbleText, reps, etc.).
  // Video rendering is handled by the tier carousel below.
  const [resolved, setResolved] = useState<ResolvedContent | null>(null);
  // Carousel state: every level visited (or pre-fetched) gets a permanent VideoTier entry.
  // Tiers are never removed mid-session — switching is pure CSS opacity toggling.
  const [mountedTiers, setMountedTiers] = useState<VideoTier[]>([]);
  const [activeTierId, setActiveTierId] = useState<string | null>(null);
  const [contentFading, setContentFading] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [userInteracted, setUserInteracted] = useState(false);
  // Show the JIT tutorial overlay only on the very first slider (stepIndex === 0).
  // Dismissed by tapping the dark mask OR by the first drag gesture.
  const [showTutorial, setShowTutorial] = useState(stepIndex === 0);
  // Coverflow strip: level -> thumbnailUrl (null once resolved-but-absent, so
  // the strip can tell "still loading" apart from "confirmed no image").
  const [thumbnails, setThumbnails] = useState<Record<number, string | null>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Monotonically-incrementing counter used to discard stale fetchContent completions
  // when the slider moves faster than the resolver can respond.
  const fetchCounterRef = useRef(0);
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

  // ── Coverflow strip: batch-resolve every step's thumbnail up front ──
  // Cheap relative to video prefetching (static <img> vs byte-range video
  // fetches) — reuses resolveContent's own in-memory cache, so this doesn't
  // duplicate the per-level fetches fetchContent() below already performs
  // when the user actually lands on a level.
  useEffect(() => {
    if (!isSimple || !steps) { setThumbnails({}); return; }
    let cancelled = false;
    setThumbnails({});
    steps.forEach((stepLevel) => {
      resolveContent(category, stepLevel, demographics, lang)
        .then((content) => {
          if (cancelled) return;
          setThumbnails((prev) => ({ ...prev, [stepLevel]: content.thumbnailUrl }));
        })
        .catch(() => {
          if (cancelled) return;
          setThumbnails((prev) => ({ ...prev, [stepLevel]: null }));
        });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isSimple, steps, demographics, lang]);

  // ── Load content on mount / category change ─────────────────
  useEffect(() => {
    if (stepsLoading) return;
    mountedRef.current = true;
    setShowHint(true);
    setUserInteracted(false);
    // Clear the tier carousel so no stale video from the previous category bleeds through.
    setMountedTiers([]);
    setActiveTierId(null);
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
      // Stamp this invocation so stale completions from rapid slider movement
      // cannot overwrite a newer result that already landed.
      const myCount = ++fetchCounterRef.current;
      try {
        setContentFading(true);
        const content = await resolveContent(cat, lvl, demographics, lang);

        // Bail if unmounted OR if a newer fetch has since been dispatched.
        if (!mountedRef.current || myCount !== fetchCounterRef.current) return;

        setResolved(content);
        setTimeout(() => setContentFading(false), 50);

        // ── Tier carousel: register this level as a permanently mounted video node ──
        const tierId = String(lvl);
        const newTier: VideoTier = {
          id: tierId,
          videoUrlWebm: content.videoUrlWebm ?? null,
          videoUrlMov:  content.videoUrlMov  ?? null,
          videoUrl:     content.videoUrl     ?? null,
          thumbnailUrl: content.thumbnailUrl ?? null,
        };
        setMountedTiers(prev => prev.some(t => t.id === tierId) ? prev : [...prev, newTier]);
        setActiveTierId(tierId);

        // Secondary HTTP cache warm-up (still useful as a byte-level layer).
        prefetchAdjacent(cat, lvl, demographics, lang, minLevel, maxLevel);
        if (content.videoUrlWebm) prefetchVideoUrl(content.videoUrlWebm);
        if (content.videoUrlMov)  prefetchVideoUrl(content.videoUrlMov);
        if (content.videoUrl)     prefetchVideoUrl(content.videoUrl);

        // Pre-mount the adjacent level's video node so it is already buffered and
        // at frame 0 before the user slides to it.  prefetchAdjacent above likely
        // populated the in-memory service cache, so this resolveContent is instant.
        const adjLvl = lvl < maxLevel ? lvl + 1 : lvl > minLevel ? lvl - 1 : null;
        if (adjLvl !== null) {
          resolveContent(cat, adjLvl, demographics, lang)
            .then(adj => {
              if (!mountedRef.current) return;
              const adjId = String(adjLvl);
              const adjTier: VideoTier = {
                id: adjId,
                videoUrlWebm: adj.videoUrlWebm ?? null,
                videoUrlMov:  adj.videoUrlMov  ?? null,
                videoUrl:     adj.videoUrl     ?? null,
                thumbnailUrl: adj.thumbnailUrl ?? null,
              };
              setMountedTiers(prev => prev.some(t => t.id === adjId) ? prev : [...prev, adjTier]);
            })
            .catch(() => { /* preload-only — silent failure is acceptable */ });
        }
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
      // First drag dismisses the tutorial overlay permanently.
      setShowTutorial(false);
      const clamped = Math.max(sliderMin, Math.min(sliderMax, newSliderVal));

      // Haptic feedback — only fires when the step actually changes.
      // Was a raw navigator.vibrate() scaled 5-40ms by position (no iOS
      // support); Capacitor's selectionChanged() is a fixed-intensity tick,
      // so the by-position intensity scaling is intentionally dropped here.
      if (prevSliderValRef.current !== null && clamped !== prevSliderValRef.current) {
        hapticSelection();
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
    <div className="flex flex-col h-full bg-white relative">
      {/* ── Unified header: back button + story bar + Kelly avatar slot ── */}
      <header className="flex-shrink-0 flex items-center gap-2 px-3 pb-1">
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

      {/* ── Instruction text — compact 1-line layout ── */}
      <div className="px-6 pt-1 pb-1 flex-shrink-0">
        <p className="text-lg font-black text-slate-900 text-center leading-snug">
          מה מצב הכושר שלך?
        </p>
        <p className="text-xs font-medium text-slate-400 text-center mt-0.5 leading-snug">
          {isFemale ? 'הזיזי את הסליידר לרמה שהכי קרובה אלייך' : 'הזז את הסליידר לרמה שהכי קרובה אליך'}
        </p>
      </div>

      {/* ── Hero video — outer wrapper is NOT overflow-hidden so top gradient can bleed up freely ── */}
      <div className="flex-1 min-h-0 w-full relative">
        {/* Inner clip box — keeps video pixels inside its bounds */}
        <div className="absolute inset-0 overflow-hidden">
          <VideoPlayer
            tiers={mountedTiers}
            activeTierId={activeTierId}
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

      {/*
        ── Unified punch-through spotlight: description card + slider track ─────────
        When the tutorial is active, `relative z-40` lifts this entire block above
        the z-30 frosted mask, keeping the exercise info and slider crisp and
        interactive while the video above and the Next button below stay masked.
      */}
      <div className={clsx(showTutorial && 'relative z-40')}>

        {/* ── Tier pill — replaces the old always-visible 3-point track labels.
            Always rendered (not gated on exerciseLabel/repsLabel) so the level
            is still communicated even on the ~12 levels with no admin copy. ── */}
        <div className="flex-shrink-0 px-6 pb-1 flex justify-center">
          <span
            className="text-[11px] font-bold px-3 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(0,186,247,0.08)', color: '#00BAF7' }}
          >
            {isSimple && steps
              ? resolveTierLabel(stepProportion(sliderVal, steps.length), isFemale)
              : resolveTierLabel(levelProportion(level, minLevel, maxLevel), isFemale)}
          </span>
        </div>

        {/* ── Description card — exercise name + reps only ── */}
        <AnimatePresence mode="wait">
          {(exerciseLabel || repsLabel) && (
            <motion.div
              key={`${exerciseLabel}_${targetReps}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: contentFading ? 0 : 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="flex-shrink-0 px-6 pb-2"
            >
              <div className="bg-[#00BAF7]/6 border border-[#00BAF7]/20 rounded-2xl px-4 py-2 text-center space-y-0.5">
                {/* 1 — Exercise name */}
                {exerciseLabel && (
                  <h3 className="text-xl font-bold text-slate-950 leading-snug">
                    {exerciseLabel}
                  </h3>
                )}
                {/* 2 — Performance benchmark (reps/seconds) */}
                {repsLabel && (
                  <p className="text-base font-normal text-slate-950 leading-snug">
                    {repsLabel}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Coverflow thumbnail strip (simple mode, 2+ admin-defined steps) ── */}
        {isSimple && steps ? (
          <div className="flex-shrink-0 pb-1">
            {/* Persistent helper line — always visible (unlike the one-time JIT
                tutorial bubble below, which only shows on the very first slider
                and gets dismissed after the first touch). */}
            <div className="px-6 pb-1.5 text-center">
              <p className="text-sm font-semibold text-slate-700 leading-snug">
                {isFemale
                  ? 'החלק ועצרי על התרגיל הכי קשה שאת בטוחה שתבצעי'
                  : 'החלק ועצור על התרגיל הכי קשה שאתה בטוח שתבצע'}
              </p>
              <p className="text-xs font-normal text-slate-400 mt-0.5 leading-snug">
                {isFemale ? 'לא בטוחה? בחרי בערך — נדייק בהמשך' : 'לא בטוח? בחר בערך — נדייק בהמשך'}
              </p>
            </div>
            <CoverflowStrip
              steps={steps}
              selectedIndex={sliderVal}
              thumbnails={thumbnails}
              onSelect={handleSliderChange}
            />
          </div>
        ) : (
          /* ── Degraded mode: plain continuous slider (unchanged fallback) —
             covers deep/continuous mode and any simple-mode category with
             fewer than 2 admin-defined onboarding levels (e.g. muscle_up,
             hspu today). No dots, no strip — matches pre-redesign behaviour
             exactly, since dots were already conditional on isSimple here. */
          <div className="flex-shrink-0 px-6 pb-1">
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
            </div>
          </div>
        )}

      </div>{/* end punch-through */}

      {/* ── Confirm button — separate wrapper, stays behind z-30 overlay during tutorial ──
          Dynamic label ties the button to the currently selected exercise
          ("{name} — זו הרמה שלי"), falling back to the plain next/finish label
          on the ~12 levels with no admin-set exerciseName. CALM (muted, low
          contrast) until the user's first interaction with the slider/strip
          (reuses `userInteracted`, the same flag that already drives the
          drag-hint dismissal) — avoids inviting a press before anything is
          actually chosen — then PROMOTED to the full gradient + bold near-black
          text once touched. */}
      <div
        className="flex-shrink-0 px-6 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <button
          onClick={handleConfirm}
          className={clsx(
            'w-full py-4 rounded-full font-black text-lg active:scale-95 transition-all duration-300 flex items-center justify-center gap-2',
            userInteracted ? 'text-slate-950' : 'text-slate-400',
          )}
          style={{
            backgroundImage: userInteracted
              ? 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)'
              : 'linear-gradient(98deg, rgba(12,242,227,0.14) 0%, rgba(0,186,247,0.14) 98%)',
            fontFamily: 'var(--font-simpler)',
            boxShadow: userInteracted
              ? '0 8px 20px rgba(0,186,247,0.25), 0 0 40px rgba(112,0,255,0.10), 0 0 0 1px rgba(0,186,247,0.12)'
              : 'none',
          }}
        >
          {exerciseLabel ? (
            <span className="w-full flex items-center justify-center gap-1 overflow-hidden px-2">
              <span className="truncate min-w-0">{exerciseLabel}</span>
              <span className="flex-shrink-0 whitespace-nowrap">— זו הרמה שלי</span>
            </span>
          ) : stepIndex < totalSteps - 1 ? (
            <>
              <span>הבא</span>
              <span className="text-xl">←</span>
            </>
          ) : (
            <span>סיום הערכה</span>
          )}
        </button>
      </div>

      {/* ── JIT Spotlight Tutorial Overlay ───────────────────────────
          Shown only on the first slider (stepIndex === 0).
          Single full-screen frosted layer:
            • Covers the entire viewport INCLUDING the Next button
              so the user cannot skip before interacting.
            • `onPointerDown` fires on the very first touch/tap anywhere
              (whether on the dark area or on the slider zone) and
              dismisses the overlay instantly, letting the subsequent
              pointer-move continue as a normal slider drag.
            • `handleSliderChange` also calls `setShowTutorial(false)`
              as a belt-and-suspenders fallback.
      ─────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && (
          <>
            {/* Full-screen light frosted mask — blocks Next button + catches first tap */}
            <motion.div
              key="tutorial-mask"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="absolute inset-0 z-30 bg-white/50 backdrop-blur-3xl"
              onPointerDown={() => setShowTutorial(false)}
              aria-hidden
            />

            {/* Speech bubble — floats above the unified exercise card + slider spotlight zone */}
            <motion.div
              key="tutorial-bubble"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, delay: 0.12, ease: 'easeOut' }}
              className="absolute left-4 right-4 z-50 pointer-events-none"
              style={{ bottom: 245 }}
              dir="rtl"
            >
              {/* Bubble card */}
              <div className="bg-white/95 backdrop-blur-2xl rounded-3xl p-6 border border-slate-100 shadow-xl">
                <div className="space-y-6">
                  <p className="text-lg font-medium text-slate-800 text-center leading-snug">
                    {isFemale
                      ? 'גררי כדי לשנות את הקושי והתרגיל'
                      : 'גרור כדי לשנות את הקושי והתרגיל'
                    }
                  </p>
                  <p className="text-lg font-medium text-slate-800 text-center leading-snug">
                    {isFemale
                      ? 'בדקי את המינימום: הזמן והחזרות יופיעו כאן'
                      : 'בדוק את המינימום: הזמן והחזרות יופיעו כאן'
                    }
                  </p>
                </div>

                {/* Divider + anxiety-relief note */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <p className="text-sm font-normal text-slate-500 text-center leading-loose px-2">
                    {isFemale
                      ? 'לא בטוחה ב-100%? לא מצליחה? תבחרי בערך, המערכת תלמד אותך ותתקן בהמשך'
                      : 'לא בטוח ב-100%? לא מצליח? תבחר בערך, המערכת תלמד אותך ותתקן בהמשך'
                    }
                  </p>
                </div>
              </div>

              {/* Arrow pointing down → toward the top edge of the illuminated spotlight block */}
              <div className="flex justify-center mt-3" aria-hidden>
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '10px solid transparent',
                    borderRight: '10px solid transparent',
                    borderTop: '12px solid rgba(255,255,255,0.95)',
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
