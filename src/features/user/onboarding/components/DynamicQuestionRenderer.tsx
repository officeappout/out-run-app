"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DynamicQuestionNode } from '../engine/DynamicOnboardingEngine';
import { Coins } from 'lucide-react';
import { MultilingualText } from '@/types/onboarding-questionnaire';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import PremiumExerciseCard from './PremiumExerciseCard';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';

interface DynamicQuestionRendererProps {
  question: DynamicQuestionNode;
  selectedAnswerId?: string;
  onAnswer: (answerId: string) => void;
}

type AppLanguage = 'he' | 'en' | 'ru';

/**
 * Helper: Extract text from string | MultilingualText with language and gender support
 */
function getTextValue(
  text: string | MultilingualText | undefined,
  language: AppLanguage = 'he',
  gender: 'male' | 'female' | 'neutral' = 'neutral'
): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  
  // Extract language-specific content
  const langContent = text[language];
  if (!langContent) {
    // Fallback to Hebrew if current language not available
    const fallbackContent = text['he'];
    if (fallbackContent) {
      return gender === 'female' && fallbackContent.female 
        ? fallbackContent.female 
        : fallbackContent.neutral || '';
    }
    // Last resort: get first available language
    const firstLang = Object.keys(text)[0];
    if (firstLang) {
      const firstContent = text[firstLang];
      return gender === 'female' && firstContent.female 
        ? firstContent.female 
        : firstContent.neutral || '';
    }
    return '';
  }
  
  // Return gender-specific version if available, otherwise neutral
  return gender === 'female' && langContent.female 
    ? langContent.female 
    : langContent.neutral || '';
}

/** Extract the best video URL from an Exercise object. */
function getExerciseVideoUrl(ex: Exercise): string | null {
  const methods = ex.executionMethods ?? (ex as any).execution_methods;
  if (Array.isArray(methods) && methods.length > 0) {
    const url = methods[0]?.media?.mainVideoUrl;
    if (url) return url;
  }
  if (ex.media?.videoUrl) return ex.media.videoUrl;
  return null;
}

/** Extract the best thumbnail URL from an Exercise object. */
function getExercisePoster(ex: Exercise): string | null {
  if (ex.media?.imageUrl) return ex.media.imageUrl;
  return null;
}

export default function DynamicQuestionRenderer({
  question,
  selectedAnswerId,
  onAnswer,
}: DynamicQuestionRendererProps) {
  // Pre-fetch exercises for answers that have exerciseId
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});

  useEffect(() => {
    const exerciseIds = question.answers
      .map((a: any) => a.exerciseId)
      .filter((id: any): id is string => !!id && typeof id === 'string');

    if (exerciseIds.length === 0) return;

    const unique = [...new Set(exerciseIds)];
    let cancelled = false;

    Promise.all(unique.map((id) => getExercise(id))).then((results) => {
      if (cancelled) return;
      const map: Record<string, Exercise> = {};
      results.forEach((ex) => {
        if (ex) map[ex.id] = ex;
      });
      setExerciseMap(map);
    });

    return () => { cancelled = true; };
  }, [question.id]); // re-fetch when question changes

  // Get language and gender from sessionStorage
  const language: AppLanguage = typeof window !== 'undefined' 
    ? (sessionStorage.getItem('onboarding_language') || 'he') as AppLanguage
    : 'he';
  const savedGender = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_gender')
    : null;
  const gender: 'male' | 'female' | 'neutral' = 
    savedGender === 'male' ? 'male' : 
    savedGender === 'female' ? 'female' : 
    'neutral';

  // Extract localized text
  const title = getTextValue(question.title as any, language, gender);
  const description = question.description 
    ? getTextValue(question.description as any, language, gender)
    : undefined;

  // ✅ Default to 'large-card' if layoutType not specified
  const layoutType = question.layoutType || 'large-card';

  // ── Input-type questions (pace/time entry) — must check BEFORE isChoiceLike
  // because Firestore may store the question with type:'choice' or attach
  // placeholder answers, causing the choice branch to swallow the render.
  if (question.type === 'input' || question.id === 'q_run_pace_input') {
    return (
      <PaceTimeInput
        title={title}
        description={description}
        language={language}
        onSubmit={(totalSeconds) => onAnswer(String(totalSeconds))}
      />
    );
  }

  // ✅ Flexible type check: treat anything with answers as a choice-like question
  const isChoiceLike =
    question.type === 'choice' ||
    (question as any).type === 'multiple_choice' ||
    (Array.isArray((question as any).answers) && (question as any).answers.length > 0);

  if (isChoiceLike) {
    return (
      <div className="w-full font-simpler" dir={language === 'he' ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="text-center mb-6 px-8">
          <h2 className="text-xl font-black leading-tight text-slate-900 mb-1">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-slate-500 font-medium">
              {description}
            </p>
          )}
        </div>

        {/* ✅ Style 1: Large Card Layout (layoutType === 'large-card') */}
        {layoutType === 'large-card' && (
          <div className="flex flex-col gap-4">
            {question.answers.map((answer) => {
              const isSelected = selectedAnswerId === answer.id;
              const answerText = getTextValue(answer.text as any, language, gender);
              const coinReward = (answer as any).coinReward ?? 10;
              const hasImage = !!answer.imageUrl;
              const linkedExercise = (answer as any).exerciseId ? exerciseMap[(answer as any).exerciseId] : null;
              const exerciseVideoUrl = linkedExercise ? getExerciseVideoUrl(linkedExercise) : null;
              const exercisePoster = linkedExercise ? getExercisePoster(linkedExercise) : null;
              const hasVideo = !!exerciseVideoUrl;
              const hasVisual = hasImage || hasVideo;
              
              return (
                <label
                  key={answer.id}
                  className={`
                    group relative w-full rounded-2xl overflow-hidden cursor-pointer
                    border-2 transition-all duration-200 active:scale-[0.98]
                    shadow-[0_10px_40px_rgba(91,194,242,0.12)]
                    ${hasVisual ? 'h-40' : 'h-auto py-6'}
                    ${
                      isSelected
                        ? 'border-[#5BC2F2] shadow-[0_0_20px_-5px_rgba(91,194,242,0.6)]'
                        : 'border-transparent hover:border-[#5BC2F2]/50 bg-white'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={answer.id}
                    checked={isSelected}
                    onChange={() => onAnswer(answer.id)}
                    className="sr-only peer"
                  />
                  
                  {IS_COIN_SYSTEM_ENABLED && coinReward > 0 && (
                    <div className="absolute top-3 left-3 z-20 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                      <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                      <span className="text-xs font-bold font-simpler">+{coinReward}</span>
                    </div>
                  )}
                  
                  {/* Premium Exercise Video — takes priority over static image */}
                  {hasVideo && (
                    <PremiumExerciseCard
                      videoUrl={exerciseVideoUrl!}
                      posterUrl={exercisePoster}
                      className="absolute inset-0 w-full h-full"
                    />
                  )}

                  {/* Static image fallback */}
                  {!hasVideo && hasImage && (
                    <img
                      alt={answerText}
                      src={answer.imageUrl}
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  )}

                  {/* Gradient Overlay */}
                  {hasVisual && !hasVideo && (
                    <div
                      className={`absolute inset-0 transition-opacity duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-t from-white via-white/90 to-transparent'
                          : 'bg-gradient-to-t from-white via-white/85 to-white/10'
                      }`}
                    />
                  )}

                  {/* Text Content */}
                  <div className={`
                    ${hasVisual 
                      ? `absolute inset-0 p-5 flex flex-col justify-end ${language === 'he' ? 'text-right' : 'text-left'}`
                      : 'flex items-center justify-center text-center px-5'
                    }
                  `}>
                    <h3 className="text-lg font-black text-slate-900">
                      {answerText}
                    </h3>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* ✅ Style 2: Horizontal Row Layout (layoutType === 'horizontal-list') */}
        {layoutType === 'horizontal-list' && (
          <div className="flex flex-col gap-3">
            {question.answers.map((answer) => {
              const isSelected = selectedAnswerId === answer.id;
              const answerText = getTextValue(answer.text as any, language, gender);
              const coinReward = (answer as any).coinReward ?? 10; // Default to 10 coins
              const hasImage = !!answer.imageUrl;
              
              return (
                <label
                  key={answer.id}
                  className="cursor-pointer group relative"
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={answer.id}
                    checked={isSelected}
                    onChange={() => onAnswer(answer.id)}
                    className="sr-only peer"
                  />
                  
                  {/* Coin Reward Badge - Top Left (absolute positioned) - COIN_SYSTEM_PAUSED: Re-enable in April */}
                  {IS_COIN_SYSTEM_ENABLED && coinReward > 0 && (
                    <div className="absolute top-2 left-2 z-20 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                      <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                      <span className="text-xs font-bold font-simpler">+{coinReward}</span>
                    </div>
                  )}
                  
                  {/* Card Container - Flex Row */}
                  <div
                    className={`
                      bg-white rounded-xl h-20 shadow-[0_10px_40px_rgba(91,194,242,0.12)]
                      flex items-center overflow-hidden
                      border transition-all duration-200
                      ${language === 'he' ? 'flex-row-reverse' : 'flex-row'}
                      ${hasImage ? 'justify-between' : 'justify-center'}
                      ${
                        isSelected
                          ? 'border-[#5BC2F2] ring-2 ring-[#5BC2F2]/30'
                          : 'border-transparent hover:border-gray-200'
                      }
                    `}
                  >
                    {/* Image - Only show if has valid URL */}
                    {hasImage && (
                      <div className="h-full w-24 relative flex-shrink-0">
                        <img
                          alt={answerText}
                          src={answer.imageUrl}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            // Hide the broken image container
                            const target = e.target as HTMLImageElement;
                            if (target.parentElement) {
                              target.parentElement.style.display = 'none';
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Title - Centered when no image, flexible when has image */}
                    <span className={`text-sm font-medium px-5 text-slate-800 ${
                      hasImage 
                        ? `flex-grow ${language === 'he' ? 'text-right' : 'text-left'}`
                        : 'text-center'
                    }`}>
                      {answerText}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Fallback for unknown question types
  return (
    <div className="w-full font-simpler text-center p-8" dir={language === 'he' ? 'rtl' : 'ltr'}>
      <h2 className="text-xl font-black text-slate-900 mb-2">{title}</h2>
      {description && <p className="text-sm text-slate-500">{description}</p>}
      <p className="text-sm text-red-400 mt-4">סוג שאלה לא מוכר: {question.type}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// PACE / TIME INPUT — Premium iOS-style wheel picker
// ════════════════════════════════════════════════════════════════════

const WHEEL_ITEM_H = 52;
const WHEEL_VISIBLE = 3;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = WHEEL_ITEM_H;

const HOUR_VALS = Array.from({ length: 4 }, (_, i) => i);
const MIN_VALS  = Array.from({ length: 60 }, (_, i) => i);
const SEC_VALS  = Array.from({ length: 60 }, (_, i) => i);

type DistKey = '3k' | '5k' | '10k';

const DIST_OPTIONS: { key: DistKey; label: string; km: number; defaultMin: number }[] = [
  { key: '3k',  label: '3 ק״מ',  km: 3,  defaultMin: 15 },
  { key: '5k',  label: '5 ק״מ',  km: 5,  defaultMin: 25 },
  { key: '10k', label: '10 ק״מ', km: 10, defaultMin: 50 },
];

function getInitialDist(): DistKey {
  if (typeof window === 'undefined') return '5k';
  try {
    const stored = sessionStorage.getItem('onboarding_running_answers');
    if (stored) {
      const d = JSON.parse(stored).targetDistance;
      if (d === '3k' || d === '5k' || d === '10k') return d;
    }
  } catch {}
  return '5k';
}

// ── Wheel Column ─────────────────────────────────────────────────

function WheelColumn({
  values,
  value,
  onChange,
  suffix,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const rafRef = useRef<number>();
  const skipCommit = useRef(false);
  const didMount = useRef(false);
  const [vizIdx, setVizIdx] = useState(() => Math.max(0, values.indexOf(value)));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    skipCommit.current = true;
    el.scrollTo({ top: idx * WHEEL_ITEM_H, behavior: didMount.current ? 'smooth' : 'instant' as ScrollBehavior });
    setVizIdx(idx);
    if (!didMount.current) requestAnimationFrame(() => { didMount.current = true; });
    const t = setTimeout(() => { skipCommit.current = false; }, 350);
    return () => clearTimeout(t);
  }, [value, values]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    cancelAnimationFrame(rafRef.current!);
    rafRef.current = requestAnimationFrame(() => {
      const idx = Math.round(el.scrollTop / WHEEL_ITEM_H);
      setVizIdx(Math.max(0, Math.min(idx, values.length - 1)));
    });

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (skipCommit.current) return;
      const idx = Math.round(el.scrollTop / WHEEL_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, values.length - 1));
      if (values[clamped] !== value) onChange(values[clamped]);
    }, 120);
  }, [values, value, onChange]);

  return (
    <div className="flex-1 min-w-0">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="wheel-hide-sb overflow-y-scroll"
        style={{
          height: WHEEL_H,
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        <div style={{ height: WHEEL_PAD }} />
        {values.map((v, i) => {
          const dist = Math.abs(i - vizIdx);
          return (
            <div
              key={v}
              className="flex items-center justify-center select-none"
              style={{ height: WHEEL_ITEM_H, scrollSnapAlign: 'center' }}
            >
              <span
                className="transition-all duration-100 tabular-nums"
                style={{
                  fontSize: dist === 0 ? 22 : dist === 1 ? 16 : 13,
                  fontWeight: dist === 0 ? 700 : 500,
                  color: dist === 0 ? '#0f172a' : dist === 1 ? '#94a3b8' : '#e2e8f0',
                  opacity: dist <= 2 ? 1 : 0,
                }}
              >
                {String(v).padStart(2, '0')}
                <span className="text-[10px] font-semibold ml-0.5 opacity-60">{suffix}</span>
              </span>
            </div>
          );
        })}
        <div style={{ height: WHEEL_PAD }} />
      </div>
    </div>
  );
}

// ── Main PaceTimeInput ───────────────────────────────────────────

function PaceTimeInput({
  title,
  description,
  language,
  onSubmit,
}: {
  title: string;
  description?: string;
  language: 'he' | 'en' | 'ru';
  onSubmit: (totalSeconds: number) => void;
}) {
  const distance = useRef(getInitialDist()).current;
  const meta = DIST_OPTIONS.find((d) => d.key === distance)!;

  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(meta.defaultMin);
  const [seconds, setSeconds] = useState(0);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const pacePerKm = totalSeconds > 0 ? totalSeconds / meta.km : Infinity;
  const isElite = pacePerKm < 180;
  const isValid = totalSeconds > 0;

  const fmtPace = () => {
    if (!isFinite(pacePerKm) || pacePerKm <= 0) return '--:--';
    const m = Math.floor(pacePerKm / 60);
    const s = Math.round(pacePerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full font-simpler" dir="rtl">
      <style>{`.wheel-hide-sb::-webkit-scrollbar{display:none}`}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-4 mb-2">
        <h2 className="text-2xl font-black leading-tight text-slate-900 mb-2">
          מעולה! ומה התוצאה הכי טובה שלך כרגע ל-{meta.label}?
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          הכוונה לתוצאה שאת/ה יכול/ה לבצע היום 😉, לא לשיא היסטורי!
        </p>
      </div>

      {/* ── Center Label ───────────────────────────────────────── */}
      <div className="text-center mt-6 mb-4 px-4">
        <p className="text-lg font-bold text-slate-700">
          השיא שלי ב-{meta.label} הוא:
        </p>
      </div>

      {/* ── iOS-style Wheel Picker ─────────────────────────────── */}
      <div
        className="relative mx-4 mb-6 overflow-hidden rounded-2xl"
        style={{ height: WHEEL_H }}
      >
        <div
          className="absolute inset-x-3 rounded-xl pointer-events-none z-0"
          style={{ top: WHEEL_PAD, height: WHEEL_ITEM_H, background: '#00BAF733' }}
        />
        <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent z-20 pointer-events-none" />

        <div
          className="relative z-10 flex items-center justify-center h-full max-w-xs mx-auto gap-0"
          dir="ltr"
        >
          <WheelColumn values={HOUR_VALS} value={hours}   onChange={setHours}   suffix="h" />
          <span className="text-2xl font-bold text-slate-300 shrink-0 pb-0.5">:</span>
          <WheelColumn values={MIN_VALS}  value={minutes} onChange={setMinutes} suffix="m" />
          <span className="text-2xl font-bold text-slate-300 shrink-0 pb-0.5">:</span>
          <WheelColumn values={SEC_VALS}  value={seconds} onChange={setSeconds} suffix="s" />
        </div>
      </div>

      {/* ── Live Pace Badge ────────────────────────────────────── */}
      <div className="flex justify-center mb-8">
        <span
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold tabular-nums"
          style={{ background: '#0AC2B6', color: '#212121' }}
        >
          קצב: {fmtPace()} דק׳/ק״מ
        </span>
      </div>

      {/* ── Elite Warning ──────────────────────────────────────── */}
      {isElite && (
        <div
          className="mx-4 mb-6 rounded-xl p-4"
          style={{ background: '#B00020' + '10', borderColor: '#B00020' + '30', borderWidth: 1 }}
        >
          <p className="text-sm font-semibold text-center leading-relaxed" style={{ color: '#B00020' }}>
            המערכת אינה מותאמת כרגע לאתלטים ברמה הזו... אנו עובדים על עדכון בקרוב.
          </p>
        </div>
      )}

      {/* ── Submit ──────────────────────────────────────────────── */}
      <div className="px-4">
        <button
          onClick={() => { if (isValid && !isElite) onSubmit(totalSeconds); }}
          disabled={!isValid || isElite}
          className={`
            w-full py-4 rounded-xl text-base font-bold transition-all
            ${isValid && !isElite
              ? 'text-white active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
          style={isValid && !isElite ? { background: '#00BAF7', boxShadow: '0 10px 25px -5px rgba(0,186,247,0.35)' } : undefined}
        >
          המשך
        </button>
      </div>
    </div>
  );
}
