"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { MockWorkout } from '../data/mock-schedule-data';
import { Dumbbell, Check, TrendingUp, Clock, Flag, PersonStanding } from 'lucide-react';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveVideoForLocation, resolveImageForLocation } from '@/features/content/exercises/core/exercise.types';
import {
  resolveEquipmentLabel,
  resolveEquipmentSvgPathList,
  resolveEquipmentCategory,
  CATEGORY_PRIORITY,
  normalizeGearId,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
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
  return mandatory[0];
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
      <div className="flex items-center gap-2 text-[13px] font-normal" style={{ color: '#374151' }} dir="rtl">
        <span>🧘 התאוששות פעילה</span>
        <span style={{ color: '#343434' }}>|</span>
        <span>{duration} דקות</span>
      </div>
    );
  }

  const clamped = Math.min(3, Math.max(1, difficulty));
  const label = DIFFICULTY_LABELS[clamped] ?? DIFFICULTY_LABELS[2];

  return (
    <div className="flex items-center gap-2 text-[13px] font-normal" style={{ color: '#374151' }} dir="rtl">
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
  borderRadius: 6,
  border: '1.5px solid #E0E9FF',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

interface EquipmentBadgeProps {
  /** Single SVG path (legacy / simple usage). Ignored when iconSrcList is provided. */
  iconSrc?: string;
  /**
   * Ordered list of SVG paths to attempt in sequence.
   * The component tries the first path; on load-error it advances to the next.
   * Falls back to the Dumbbell icon when the list is exhausted.
   * Provide a stable `key` prop on the badge when this list changes so React
   * resets the internal index automatically.
   */
  iconSrcList?: string[];
  /** Alt / accessible label */
  label?: string;
  /** Badge size in px (default 36) */
  size?: number;
}

export function EquipmentBadge({ iconSrc, iconSrcList, label, size = 36 }: EquipmentBadgeProps) {
  // Resolve the priority-ordered source list once
  const sources: string[] = iconSrcList ?? (iconSrc ? [iconSrc] : []);

  // Index into `sources`. Advances on each 404/load-error.
  const [srcIdx, setSrcIdx] = useState(0);
  // Set to true when every source has failed → show Dumbbell fallback.
  const [allFailed, setAllFailed] = useState(false);

  const iconSize = Math.round(size * 0.55);
  const currentSrc = sources[srcIdx];
  const validSrc = !allFailed && currentSrc?.startsWith('/') ? currentSrc : null;

  return (
    <div
      className="bg-white/90 dark:bg-slate-800/90 shadow-sm flex items-center justify-center"
      style={{ ...EQUIPMENT_BADGE_STYLE, width: size, height: size }}
      title={label}
    >
      {validSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={validSrc}
          alt={label || 'equipment'}
          width={iconSize}
          height={iconSize}
          className="object-contain"
          onError={() => {
            if (srcIdx < sources.length - 1) {
              setSrcIdx((i) => i + 1);
            } else {
              setAllFailed(true);
            }
          }}
        />
      ) : (
        <PersonStanding className="text-gray-500 dark:text-gray-400" style={{ width: iconSize, height: iconSize }} />
      )}
    </div>
  );
}

/**
 * Floating row of equipment badges — positioned absolute at bottom-right
 * of a `position: relative` parent (the hero card image area).
 *
 * Each icon entry may supply an ordered `srcList` (location-aware paths tried
 * in sequence) or a legacy single `src`. A "+N" pill is shown when the full
 * equipment list exceeds the displayed count.
 */
export function EquipmentBadgeRow({
  icons,
  total,
  className = '',
  badgeSize = 36,
  showBodyweightFallback = false,
}: {
  /** Sliced display list (max 4). */
  icons: { srcList?: string[]; src?: string; label?: string }[];
  /** Total count before slicing — used to compute the "+N" overflow pill. */
  total?: number;
  className?: string;
  /** Override badge size in px. Defaults to 36. */
  badgeSize?: number;
  /**
   * When true and icons is empty, render a single "bodyweight" PersonStanding
   * badge instead of returning null. Signals no equipment is required.
   */
  showBodyweightFallback?: boolean;
}) {
  const iconSize = Math.round(badgeSize * 0.55);
  const badgeBase = {
    width: badgeSize,
    height: badgeSize,
    borderRadius: 6,
  };

  if (!icons.length) {
    if (!showBodyweightFallback) return null;
    return (
      <div className={`absolute right-4 flex gap-1.5 z-20 ${className}`} style={{ bottom: '42%' }}>
        <div
          className="bg-white/90 shadow-sm flex items-center justify-center"
          style={badgeBase}
          title="ללא ציוד – משקל גוף"
        >
          <PersonStanding className="text-slate-400" style={{ width: iconSize, height: iconSize }} />
        </div>
      </div>
    );
  }

  const overflow = (total ?? icons.length) - icons.length;
  return (
    <div className={`absolute right-4 flex gap-1.5 z-20 ${className}`} style={{ bottom: '42%' }}>
      {icons.map((icon, i) => (
        <EquipmentBadge
          key={icon.srcList?.[0] ?? icon.src ?? i}
          iconSrcList={icon.srcList}
          iconSrc={icon.src}
          label={icon.label}
          size={badgeSize}
        />
      ))}
      {overflow > 0 && (
        <div
          className="bg-white/90 shadow-sm flex items-center justify-center text-[10px] font-bold text-slate-500"
          style={{
            ...badgeBase,
            border: '1.5px solid #E0E9FF',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          +{overflow}
        </div>
      )}
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
  pull: '/icons/programs/muscle.svg',
  calisthenics: '/icons/programs/muscle.svg',
  legs: '/icons/programs/leg.svg',
  lower_body: '/icons/programs/leg.svg',
  running: '/icons/programs/Run.svg',
  cardio: '/icons/programs/Run.svg',
};

// ============================================================================
// Gender-aware CTA copy banks
// ============================================================================

type UserGender = 'male' | 'female' | 'other' | null | undefined;

const CTA_COPY_BANKS: Record<'male' | 'female' | 'neutral', readonly string[]> = {
  male: [
    'גלה מה מצפה לך היום...',
    'סקרן לדעת מה באימון?',
    'בוא נראה מה מחכה לנו!',
    'מוכן לגלות את האתגר?',
  ],
  female: [
    'גלי מה מצפה לך היום...',
    'סקרנית לדעת מה באימון?',
    'בואי נראה מה מחכה לנו!',
    'מוכנה לגלות את האתגר?',
  ],
  neutral: [
    'גלו מה מצפה לכם היום...',
    'סקרנים לדעת מה באימון?',
    'בואו נראה מה מחכה לנו!',
    'מוכנים לגלות את האתגר?',
  ],
} as const;

function resolveGenderKey(gender: UserGender): 'male' | 'female' | 'neutral' {
  if (gender === 'male') return 'male';
  if (gender === 'female') return 'female';
  return 'neutral';
}

/**
 * Pick a deterministic CTA string based on gender and an optional seed.
 * The day number provides base rotation; the seed shifts the index so
 * adjacent cards in the carousel each show a different string.
 */
export function getGenderedCtaText(gender: UserGender, seed?: string): string {
  const bank = CTA_COPY_BANKS[resolveGenderKey(gender)];
  const dayBase = Math.floor(Date.now() / 86_400_000);
  let seedOffset = 0;
  if (seed) {
    for (let i = 0; i < seed.length; i++) seedOffset += seed.charCodeAt(i);
  }
  return bank[(dayBase + seedOffset) % bank.length];
}

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
  /** Navigate to workout overview when card body is tapped */
  onCardTap?: () => void;
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
  /** User gender for gendered CTA copy */
  userGender?: 'male' | 'female' | 'other' | null;
}

// ============================================================================
// Component
// ============================================================================
export default function HeroWorkoutCard({
  workout,
  isRestDay = false,
  onStart,
  onCardTap,
  exercises,
  workoutLocation,
  programIconKey,
  variant = 'active',
  isCompleted = false,
  completionData,
  onRequestMore,
  onDismissCelebration,
  userGender,
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
    if (!exercises?.length) return { display: [], total: 0 };
    const seen = new Set<string>();
    const icons: { srcList: string[]; label: string; norm: string }[] = [];
    for (const ex of exercises) {
      const method = ex.method;
      const rawIds: string[] = [
        ...((method as any)?.gearIds ?? []),
        ...((method as any)?.equipmentIds ?? []),
        ...((method as any)?.gearId ? [(method as any).gearId] : []),
        ...((method as any)?.equipmentId ? [(method as any).equipmentId] : []),
      ].filter(Boolean);
      for (const raw of rawIds) {
        const norm = normalizeGearId(raw);
        if (norm === 'bodyweight' || norm === 'none' || norm === 'unknown_gear' || seen.has(norm)) continue;
        seen.add(norm);
        const srcList = resolveEquipmentSvgPathList(norm, workoutLocation);
        // Skip equipment with no known SVG — prevents phantom +N inflation.
        if (srcList.length === 0) continue;
        const label = resolveEquipmentLabel(norm);
        icons.push({ srcList, label, norm });
      }
    }
    // Sort by category priority (stationary → accessories → improvised)
    icons.sort((a, b) => {
      const pa = CATEGORY_PRIORITY[resolveEquipmentCategory(a.norm) ?? ''] ?? 99;
      const pb = CATEGORY_PRIORITY[resolveEquipmentCategory(b.norm) ?? ''] ?? 99;
      return pa - pb;
    });
    return { display: icons.slice(0, 4), total: icons.length };
  }, [exercises, workoutLocation]);

  const programIconSrc = programIconKey
    ? PROGRAM_ICON_MAP[programIconKey.toLowerCase()] ?? null
    : null;

  const ctaText = useMemo(() => getGenderedCtaText(userGender, workout.title), [userGender, workout.title]);

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
  const handleCardClick = useCallback(() => {
    (onCardTap ?? onStart)();
  }, [onCardTap, onStart]);

  return (
    <div
      onClick={handleCardClick}
      className="relative overflow-hidden group cursor-pointer mx-auto transition-transform active:scale-[0.98]"
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
      <EquipmentBadgeRow
        icons={equipmentIcons.display}
        total={equipmentIcons.total}
        showBodyweightFallback={!!exercises?.length}
      />

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
            <img src={programIconSrc} alt="" width={isSide ? 18 : 22} height={isSide ? 18 : 22} className="flex-shrink-0 opacity-80" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <h4
            className="font-semibold text-gray-800 dark:text-white leading-snug"
            style={{ fontSize: isSide ? 14 : 16 }}
          >
            {workout.title}
          </h4>
        </div>

        {/* 3c. CTA button — gender-aware curiosity text */}
        <div
          className="text-black font-semibold rounded-full shadow-md shadow-cyan-400/25 flex items-center justify-center pointer-events-none"
          style={{
            width: isSide ? Math.min(CTA_WIDTH, dims.width - 32) : CTA_WIDTH,
            height: CTA_HEIGHT,
            fontSize: isSide ? 13 : 14,
            background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)',
          }}
        >
          {ctaText}
        </div>
      </div>
    </div>
  );
}
