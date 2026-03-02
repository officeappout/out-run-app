'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import VideoPlayer from './VideoPlayer';
import type { UserDemographics } from '../../types/visual-assessment.types';
import {
  resolveContent,
  prefetchAdjacent,
  prefetchVideoUrl,
  type ResolvedContent,
} from '../../services/visual-content-resolver.service';

// ── Category display metadata ──────────────────────────────────────

const CATEGORY_META: Record<string, { he: string; en: string; emoji: string; color: string }> = {
  push:      { he: 'דחיפה',          en: 'Push',      emoji: '💪', color: '#5BC2F2' },
  pull:      { he: 'משיכה',          en: 'Pull',      emoji: '🤸', color: '#8b5cf6' },
  legs:      { he: 'רגליים',         en: 'Legs',      emoji: '🦵', color: '#10b981' },
  core:      { he: 'ליבה',           en: 'Core',      emoji: '🔥', color: '#f59e0b' },
  handstand: { he: 'עמידת ידיים',    en: 'Handstand', emoji: '🤸‍♂️', color: '#ec4899' },
  skills:    { he: 'מיומנויות',      en: 'Skills',    emoji: '⭐', color: '#6366f1' },
  // Path C (Skills) — skill-specific metadata for adaptive assessment
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

// ── Props ──────────────────────────────────────────────────────────

interface VisualSliderProps {
  category: string;
  initialLevel: number;
  demographics: UserDemographics;
  lang?: string;
  onLevelConfirm: (level: number) => void;
  stepIndex: number;
  totalSteps: number;
  /** Min slider value (default 1). Path 1: 1, Path 2: 10. */
  minLevel?: number;
  /** Max slider value (default 25). Path 1: 10, Path 2: 20, Path 3: skill max. */
  maxLevel?: number;
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
}: VisualSliderProps) {
  const clampedInitial = Math.max(minLevel, Math.min(maxLevel, initialLevel));
  const [level, setLevel] = useState(clampedInitial);
  const [resolved, setResolved] = useState<ResolvedContent | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const meta = CATEGORY_META[category] ?? CATEGORY_META[category.toLowerCase()] ?? {
    he: category,
    en: category,
    emoji: '📊',
    color: '#5BC2F2',
  };

  // ── Load content on mount / category change ──────────────────

  useEffect(() => {
    mountedRef.current = true;
    const clamped = Math.max(minLevel, Math.min(maxLevel, initialLevel));
    setLevel(clamped);
    fetchContent(category, clamped);

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, initialLevel, minLevel, maxLevel]);

  const fetchContent = useCallback(
    async (cat: string, lvl: number) => {
      try {
        const content = await resolveContent(cat, lvl, demographics, lang);
        if (!mountedRef.current) return;
        setResolved(content);

        // Prefetch neighbours + browser-level video preload
        prefetchAdjacent(cat, lvl, demographics, lang, minLevel, maxLevel);
        if (content.videoUrlWebm) prefetchVideoUrl(content.videoUrlWebm);
        if (content.videoUrlMov) prefetchVideoUrl(content.videoUrlMov);
        if (content.videoUrl) prefetchVideoUrl(content.videoUrl);
      } catch (err) {
        console.error('[VisualSlider] resolve error:', err);
      }
    },
    [demographics, lang, minLevel, maxLevel],
  );

  // ── Slider interaction (300 ms debounce) ─────────────────────

  const handleSliderChange = useCallback(
    (newLevel: number) => {
      const clamped = Math.max(minLevel, Math.min(maxLevel, newLevel));
      setLevel(clamped);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchContent(category, clamped);
      }, 300);
    },
    [category, fetchContent, minLevel, maxLevel],
  );

  const handleConfirm = () => onLevelConfirm(level);

  // ── Derived values ───────────────────────────────────────────

  const progressPct = ((stepIndex + 1) / totalSteps) * 100;
  const rangeSize = maxLevel - minLevel;
  const fillPct = rangeSize > 0 ? ((level - minLevel) / rangeSize) * 100 : 0;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Step progress bar */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400">
            שלב {stepIndex + 1} מתוך {totalSteps}
          </span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {meta.en}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, backgroundColor: meta.color }}
          />
        </div>
      </div>

      {/* Category header */}
      <div className="text-center px-6 pt-3 pb-1">
        <span className="text-3xl mb-1 block">{meta.emoji}</span>
        <h2 className="text-2xl font-black text-slate-900">{meta.he}</h2>
        <p className="text-sm text-slate-500 mt-1">
          הזיזו את הסליידר לרמה שמתאימה לכם
        </p>
      </div>

      {/* Video player area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-3 min-h-0">
        <VideoPlayer
          videoUrl={resolved?.videoUrl ?? null}
          videoUrlMov={resolved?.videoUrlMov ?? null}
          videoUrlWebm={resolved?.videoUrlWebm ?? null}
          thumbnailUrl={resolved?.thumbnailUrl ?? null}
          className="w-full max-w-xs"
        />

        {/* Bold title + description */}
        <div className="mt-4 text-center min-h-[68px]">
          <h3 className="text-lg font-black text-slate-900 transition-all duration-300 leading-snug">
            {resolved?.boldTitle || `${meta.he} — רמה ${level}`}
          </h3>
          {resolved?.detailedDescription ? (
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-xs mx-auto transition-all duration-300">
              {resolved.detailedDescription}
            </p>
          ) : null}
        </div>
      </div>

      {/* Slider controls */}
      <div className="px-6 pb-3">
        {/* Level badge */}
        <div className="text-center mb-3">
          <span
            className="inline-flex items-center justify-center w-14 h-14 rounded-full text-white text-2xl font-black shadow-lg transition-all duration-200"
            style={{
              background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
            }}
          >
            {level}
          </span>
        </div>

        {/* Custom range slider */}
        <div className="relative px-1">
          <input
            type="range"
            min={minLevel}
            max={maxLevel}
            step={1}
            value={level}
            onChange={e => handleSliderChange(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer slider-thumb"
            style={{
              background: `linear-gradient(to left, ${meta.color} 0%, ${meta.color} ${fillPct}%, #e2e8f0 ${fillPct}%, #e2e8f0 100%)`,
            }}
          />
          <div className="flex justify-between mt-1.5 px-0.5">
            <span className="text-[10px] font-bold text-slate-400">{minLevel}</span>
            <span className="text-[10px] font-bold text-slate-300">|</span>
            <span className="text-[10px] font-bold text-slate-300">|</span>
            <span className="text-[10px] font-bold text-slate-300">|</span>
            <span className="text-[10px] font-bold text-slate-400">{maxLevel}</span>
          </div>
        </div>
      </div>

      {/* Confirm button */}
      <div className="px-6 pb-6 pt-2">
        <button
          onClick={handleConfirm}
          className="w-full py-4 rounded-2xl font-bold text-lg text-white active:scale-[0.97] shadow-lg transition-all flex items-center justify-center gap-2"
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

      {/* Inline slider thumb styling */}
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
