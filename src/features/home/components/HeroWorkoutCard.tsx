"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { MockWorkout } from '../data/mock-schedule-data';
import { Play, Dumbbell, Check, TrendingUp, Clock, Flag } from 'lucide-react';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveVideoForLocation, resolveImageForLocation } from '@/features/content/exercises/core/exercise.types';
import { resolveEquipmentLabel, resolveEquipmentIconKey } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { SmartMessage } from '@/features/messages/services/MessageService';

// ============================================================================
// Movement-group fallback images (high-quality Unsplash)
// ============================================================================
const MOVEMENT_GROUP_FALLBACKS: Record<string, string> = {
  horizontal_push: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=800&q=80',
  vertical_push:   'https://images.unsplash.com/photo-1598971639058-a0c1e5321546?auto=format&fit=crop&w=800&q=80',
  horizontal_pull:  'https://images.unsplash.com/photo-1597452485669-2c7bb5fef90d?auto=format&fit=crop&w=800&q=80',
  vertical_pull:   'https://images.unsplash.com/photo-1598971457999-ca4ef48a9a71?auto=format&fit=crop&w=800&q=80',
  squat:           'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80',
  hinge:           'https://images.unsplash.com/photo-1434682881908-b43d0467b798?auto=format&fit=crop&w=800&q=80',
  core:            'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
  isolation:       'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80',
};
const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80';


/**
 * Pick one "mandatory" exercise from the workout for the hero media.
 * Mandatory = has reps > 0 AND is not a warmup/cooldown.
 * Falls back to the first exercise or undefined.
 */
export function pickHeroExercise(exercises?: WorkoutExercise[]): WorkoutExercise | undefined {
  if (!exercises?.length) return undefined;

  const mandatory = exercises.filter(
    (ex) =>
      ex.reps > 0 &&
      ex.exercise.exerciseRole !== 'warmup' &&
      ex.exercise.exerciseRole !== 'cooldown'
  );

  if (mandatory.length === 0) return exercises[0];
  return mandatory[Math.floor(Math.random() * mandatory.length)];
}

/**
 * Resolve thumbnail & video URLs for a given WorkoutExercise.
 * Priority: execution-method media -> legacy exercise.media -> movement-group fallback.
 */
export function resolveHeroMedia(
  ex: WorkoutExercise | undefined,
  location?: string | null,
): { thumbnailUrl: string; videoUrl: string } {
  if (!ex) {
    return { thumbnailUrl: DEFAULT_HERO_IMAGE, videoUrl: '' };
  }

  const image = resolveImageForLocation(ex.exercise, location);
  const video = resolveVideoForLocation(ex.exercise, location);

  const thumbnailUrl =
    image ||
    MOVEMENT_GROUP_FALLBACKS[ex.exercise.movementGroup || ''] ||
    DEFAULT_HERO_IMAGE;

  return { thumbnailUrl, videoUrl: video || '' };
}

// ============================================================================
// Lazy Video Background -- thumbnail -> video crossfade
// ============================================================================
export function HeroMediaBackground({
  thumbnailUrl,
  videoUrl,
}: {
  thumbnailUrl: string;
  videoUrl: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  const handleCanPlay = useCallback(() => setVideoReady(true), []);

  useEffect(() => {
    setVideoReady(false);
  }, [videoUrl]);

  return (
    <>
      {/* Thumbnail (always rendered as base layer) */}
      <img
        src={thumbnailUrl}
        alt="Workout"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      />

      {/* Lazy video loop (fades in when ready) */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlayThrough={handleCanPlay}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            videoReady ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Subtle dark vignette at the very top for badge readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/20 to-transparent" />
    </>
  );
}

// ============================================================================
// Difficulty labels (Hebrew) — keyed by 1–3
// ============================================================================
const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'קל',
  2: 'בינוני',
  3: 'מאתגר',
};

// CSS filter to recolor a black SVG to Cyan #00C9F2
const BOLT_FILTER_CYAN =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
// CSS filter to recolor a black SVG to #374151 (dark gray)
const BOLT_FILTER_DARK =
  'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';

function BoltIcon({ filled }: { filled: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/ui/Bolt.svg"
      alt=""
      width={14}
      height={14}
      style={{ filter: filled ? BOLT_FILTER_CYAN : BOLT_FILTER_DARK }}
    />
  );
}

/**
 * Metadata row (RTL):
 *   Strength: [Difficulty Label] [3 Bolts] | [Duration] דקות
 *   Recovery: [Recovery Label] | [Duration] דקות   (no bolts)
 */
function MetadataRow({ difficulty, duration, isRecovery }: { difficulty: number; duration: number; isRecovery?: boolean }) {
  if (isRecovery) {
    return (
      <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#374151' }} dir="rtl">
        <span>🧘 התאוששות פעילה</span>
        <span style={{ color: '#343434' }}>|</span>
        <span>{duration} דקות</span>
      </div>
    );
  }

  const clamped = Math.min(3, Math.max(1, difficulty));
  const label = DIFFICULTY_LABELS[clamped] ?? DIFFICULTY_LABELS[2];

  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#374151' }} dir="rtl">
      <span>{label}</span>
      <span className="flex items-center gap-0.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <BoltIcon key={i} filled={i < clamped} />
        ))}
      </span>
      <span style={{ color: '#343434' }}>|</span>
      <span>{duration} דקות</span>
    </div>
  );
}

// ============================================================================
// Skeleton — shown until dynamicWorkout is fully resolved
// ============================================================================
export function HeroCardSkeleton() {
  return (
    <div
      className="overflow-hidden bg-gray-100 dark:bg-slate-800 animate-pulse mx-auto"
      style={{
        width: CARD_VARIANTS.active.width,
        height: CARD_VARIANTS.active.height,
        borderRadius: CARD_RADIUS,
        border: CARD_BORDER,
      }}
    >
      <div className="flex flex-col justify-end items-center h-full px-4 pb-4">
        <div className="mb-3 flex items-center gap-2.5 w-full">
          <div className="h-5 w-20 rounded-lg bg-gray-200 dark:bg-slate-700" />
          <div className="h-5 w-24 rounded-lg bg-gray-200 dark:bg-slate-700" />
        </div>
        <div className="h-4 w-48 rounded-md bg-gray-200 dark:bg-slate-700 mb-3" />
        <div className="rounded-full bg-gray-200 dark:bg-slate-700" style={{ width: CTA_WIDTH, height: CTA_HEIGHT }} />
      </div>
    </div>
  );
}

// ============================================================================
// Equipment Icon Badge — frosted glass square for a single equipment icon
// ============================================================================

const EQUIPMENT_BADGE_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: '0.5px solid #E0E9FF',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

interface EquipmentBadgeProps {
  /** Path to SVG in /public/assets/icons/equipment/ */
  iconSrc?: string;
  /** Alt / accessible label */
  label?: string;
  /** Badge size in px (default 36) */
  size?: number;
}

export function EquipmentBadge({ iconSrc, label, size = 36 }: EquipmentBadgeProps) {
  const iconSize = Math.round(size * 0.55);
  const [imgError, setImgError] = useState(false);
  const showFallback = !iconSrc || imgError;

  return (
    <div
      className="bg-white/90 dark:bg-slate-800/90 shadow-sm flex items-center justify-center"
      style={{ ...EQUIPMENT_BADGE_STYLE, width: size, height: size }}
      title={label}
    >
      {showFallback ? (
        <Dumbbell className="text-gray-500 dark:text-gray-400" style={{ width: iconSize, height: iconSize }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt={label || 'equipment'}
          width={iconSize}
          height={iconSize}
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}

/**
 * Floating row of equipment badges — positioned absolute at bottom-right
 * of a `position: relative` parent (the hero card image area).
 */
export function EquipmentBadgeRow({
  icons,
  className = '',
}: {
  icons: { src?: string; label?: string }[];
  className?: string;
}) {
  if (!icons.length) return null;
  return (
    <div className={`absolute right-4 flex gap-1.5 z-20 ${className}`} style={{ bottom: '42%' }}>
      {icons.map((icon, i) => (
        <EquipmentBadge key={i} iconSrc={icon.src} label={icon.label} />
      ))}
    </div>
  );
}

// ============================================================================
// Program icon — maps known template keys to SVG paths
// ============================================================================
const PROGRAM_ICON_MAP: Record<string, string> = {
  full_body: '/icons/programs/full_body.svg',
  fullbody: '/icons/programs/full_body.svg',
  push: '/icons/programs/muscle.svg',
  upper_body: '/icons/programs/muscle.svg',
  pull: '/icons/programs/pull_up.svg',
  calisthenics: '/icons/programs/pull_up.svg',
  legs: '/icons/programs/leg.svg',
  lower_body: '/icons/programs/leg.svg',
  running: '/icons/programs/Run.svg',
  cardio: '/icons/programs/Run.svg',
};

// ============================================================================
// Card dimensions — pixel-locked to Figma specs
// ============================================================================
const CARD_VARIANTS = {
  active: { width: 300, height: 330 },
  side:   { width: 256, height: 242 },
} as const;

export type CardVariant = keyof typeof CARD_VARIANTS;

const CARD_BORDER = '1.17px solid #E0E9FF';
const CARD_RADIUS = 14.06;
const CTA_WIDTH = 268;
const CTA_HEIGHT = 32;

export interface CompletionData {
  workoutType: string;
  durationMinutes: number;
  motivationMessage?: SmartMessage;
  improvementPercent?: number;
  workoutTitle?: string;
  streak?: number;
  thumbnailUrl?: string;
}

interface HeroWorkoutCardProps {
  workout: MockWorkout;
  isRestDay?: boolean;
  onStart: () => void;
  /** Exercises from the generated workout -- used for dynamic hero media */
  exercises?: WorkoutExercise[];
  /** Current workout location (for resolving correct execution method media) */
  workoutLocation?: string | null;
  /** Program template key (e.g. 'full_body') — used to show program icon next to title */
  programIconKey?: string | null;
  /** Carousel variant — 'active' (300x330) or 'side' (256x242). Defaults to 'active'. */
  variant?: CardVariant;
  /** Post-workout celebration mode */
  isCompleted?: boolean;
  completionData?: CompletionData;
  /** "I'm on a roll" — generate another workout */
  onRequestMore?: () => void;
  /** Dismiss celebration mode */
  onDismissCelebration?: () => void;
}

// ============================================================================
// Component
// ============================================================================
export default function HeroWorkoutCard({
  workout,
  isRestDay = false,
  onStart,
  exercises,
  workoutLocation,
  programIconKey,
  variant = 'active',
  isCompleted = false,
  completionData,
  onRequestMore,
  onDismissCelebration,
}: HeroWorkoutCardProps) {
  const dims = CARD_VARIANTS[variant];
  const isSide = variant === 'side';

  const getDifficultyNumber = (difficulty: string | number): number => {
    if (typeof difficulty === 'number') return Math.min(3, Math.max(1, difficulty));
    const mapping: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
    return mapping[String(difficulty).toLowerCase()] ?? 2;
  };

  const difficultyNum = getDifficultyNumber(workout.difficulty);

  const heroExercise = useMemo(() => pickHeroExercise(exercises), [exercises]);
  const heroMedia = useMemo(
    () => resolveHeroMedia(heroExercise, workoutLocation),
    [heroExercise, workoutLocation],
  );

  const equipmentIcons = useMemo(() => {
    if (!exercises?.length) return [];
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();
    const icons: { src?: string; label?: string }[] = [];
    for (const ex of exercises) {
      const method = ex.method;
      const gearIds: string[] = (method as any)?.gearIds ?? [];
      const equipIds: string[] = (method as any)?.equipmentIds ?? [];
      const legacyEquip: string[] = ex.exercise.equipment ?? [];
      for (const id of [...gearIds, ...equipIds, ...legacyEquip]) {
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        const label = resolveEquipmentLabel(id);
        if (seenLabels.has(label)) continue;
        seenLabels.add(label);
        const iconKey = resolveEquipmentIconKey(id);
        if (!iconKey) continue;
        icons.push({
          src: `/assets/icons/equipment/${iconKey}.svg`,
          label,
        });
      }
    }
    return icons.slice(0, 4);
  }, [exercises]);

  const programIconSrc = programIconKey
    ? PROGRAM_ICON_MAP[programIconKey.toLowerCase()] ?? null
    : null;

  // ── Celebration Mode — matches reference design ──
  if (isCompleted && completionData) {
    const improvement = completionData.improvementPercent;
    const thumbSrc = completionData.thumbnailUrl || heroMedia.thumbnailUrl;
    const durationStr = (() => {
      const mins = completionData.durationMinutes;
      const m = mins % 60;
      const h = Math.floor(mins / 60);
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:00`;
    })();
    const workoutLabel = completionData.workoutTitle || workout.title || 'אימון כוח';

    return (
      <div className="w-full" dir="rtl">
        {/* Section title */}
        <h3 className="text-right text-[16px] font-bold text-gray-900 mb-3">האימון היומי שלך</h3>

        {/* Card */}
        <div
          className="w-full overflow-hidden bg-white"
          style={{ borderRadius: 16, border: '1px solid #E0E9FF', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          {/* Header row: checkmark + success text */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <div className="w-7 h-7 rounded-full bg-[#00BAF7] flex items-center justify-center flex-shrink-0">
              <Check size={16} className="text-white stroke-[3]" />
            </div>
            <span className="text-[15px] font-bold text-[#00BAF7]">האימון בוצע בהצלחה!</span>
          </div>

          {/* Two-column body: thumbnail (right in RTL = first child) + stats (left in RTL = second child) */}
          <div className="flex items-stretch px-4 pb-4 gap-3">
            {/* Thumbnail — first child → right side in RTL */}
            <div className="w-[120px] flex-shrink-0 overflow-hidden" style={{ borderRadius: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc}
                alt={workoutLabel}
                className="w-full h-full object-cover"
                style={{ minHeight: 120 }}
              />
            </div>

            {/* Stats box — second child → left side in RTL */}
            <div
              className="flex-1 flex flex-col justify-center items-center gap-2 py-3 px-3 text-center"
              style={{ borderRadius: 12, border: '1px solid #B8E8F5', background: '#F0FBFF' }}
            >
              <span className="text-[14px] font-bold text-gray-900">{workoutLabel}</span>

              <div className="flex items-center gap-1 text-[13px] text-gray-700">
                <TrendingUp size={14} className="text-gray-600" />
                <span>
                  {improvement != null && improvement !== 0
                    ? `שיפור בביצועים של ${Math.abs(improvement)}%`
                    : 'שיפור בביצועים'}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[13px] text-gray-700">
                <Clock size={14} className="text-gray-500" />
                <span>{durationStr}</span>
              </div>

              <div className="flex items-center gap-1 text-[13px] text-gray-700">
                <Flag size={14} className="text-gray-500" />
                <span>{(completionData.streak ?? 1)} אימונים ברצף</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width CTA below the card */}
        {onRequestMore && (
          <button
            onClick={onRequestMore}
            className="w-full mt-3 text-white font-extrabold rounded-full shadow-lg shadow-cyan-400/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(to left, #0CF2E3, #00BAF7)',
              height: 48,
              fontSize: 16,
            }}
          >
            <span>אני על הגל, תציעו לי עוד אימון!</span>
          </button>
        )}
      </div>
    );
  }

  // ── Normal (pre-workout) Mode ──
  return (
    <div
      className="relative overflow-hidden group cursor-pointer mx-auto"
      style={{
        width: dims.width,
        height: dims.height,
        borderRadius: CARD_RADIUS,
        border: CARD_BORDER,
        boxShadow: '0 8px 30px rgba(15,23,42,0.18)',
      }}
    >
      {/* 1. Dynamic Background */}
      <div className="absolute inset-0">
        <HeroMediaBackground
          thumbnailUrl={heroMedia.thumbnailUrl}
          videoUrl={heroMedia.videoUrl}
        />
      </div>

      {/* 1b. Equipment badges — above the gradient start, in the image area */}
      <EquipmentBadgeRow icons={equipmentIcons} />

      {/* 2. Figma gradient: transparent@60% → solid@94%, top-to-bottom */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none dark:hidden"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0) 30%, rgba(255,255,255,1) 70%)',
        }}
      />
      <div
        className="absolute inset-0 z-[5] pointer-events-none hidden dark:block"
        style={{
          background: 'linear-gradient(to bottom, rgba(3,7,18,0) 30%, rgba(3,7,18,1) 70%)',
        }}
      />

      {/* 3. Content layer */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end items-center px-4 pb-4" dir="rtl">

        {/* 3a. Metadata row */}
        <div className={`w-full ${isSide ? 'mb-2' : 'mb-1'}`}>
          <MetadataRow difficulty={difficultyNum} duration={workout.duration} isRecovery={workout.isRecovery} />
        </div>

        {/* 3b. Title row */}
        <div className={`flex items-center gap-2 w-full ${isSide ? 'mb-2' : 'mb-2'}`}>
          {programIconSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={programIconSrc} alt="" width={isSide ? 18 : 22} height={isSide ? 18 : 22} className="flex-shrink-0 opacity-80" />
          )}
          <h4
            className="font-semibold text-gray-800 dark:text-white leading-snug"
            style={{ fontSize: isSide ? 14 : 16 }}
          >
            {workout.title}
          </h4>
        </div>

        {/* 3c. CTA button — pixel-locked 268x32 */}
        <button
          onClick={onStart}
          className="bg-[#00C9F2] hover:bg-[#00B4D8] text-white font-bold rounded-full shadow-md shadow-cyan-500/25 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
          style={{
            width: isSide ? Math.min(CTA_WIDTH, dims.width - 32) : CTA_WIDTH,
            height: CTA_HEIGHT,
            fontSize: isSide ? 13 : 14,
          }}
        >
          <Play size={isSide ? 14 : 16} fill="currentColor" />
          <span>יאללה, אפשר להתחיל!</span>
        </button>
      </div>
    </div>
  );
}
