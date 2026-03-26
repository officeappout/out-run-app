'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { Play } from 'lucide-react';
import type { WorkoutTrioOption } from '@/features/workout-engine/services/home-workout.types';
import {
  pickHeroExercise,
  resolveHeroMedia,
  EquipmentBadgeRow,
  HeroMediaBackground,
} from './HeroWorkoutCard';
import { resolveEquipmentLabel, resolveEquipmentSvgPath, normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

// ─── Layout — tuned for 260px card on a 390px viewport ──────────────────────
const CARD_MAX_W = 260;
const CARD_VW = 68;
const CARD_HEIGHT = 330;
const GAP = 12;
const CARD_RADIUS = 16;
const CARD_BORDER = '1px solid rgba(224,233,255,0.6)';

const ACTIVE_SCALE = 1.05;
const SIDE_SCALE = 0.92;

// ─── Bolt filters (match HeroWorkoutCard) ────────────────────────────────────
const BOLT_FILTER_CYAN =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const BOLT_FILTER_DARK =
  'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'קל',
  2: 'בינוני',
  3: 'מאתגר',
};

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

function MetadataRow({ difficulty, duration, isRecovery }: {
  difficulty: number;
  duration: number;
  isRecovery?: boolean;
}) {
  if (isRecovery) {
    return (
      <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#374151' }} dir="rtl">
        <span>🧘 התאוששות פעילה</span>
        <span style={{ color: '#343434' }}>|</span>
        <span>{duration} דקות</span>
      </div>
    );
  }

  const clamped = Math.min(3, Math.max(1, difficulty)) as 1 | 2 | 3;
  const label = DIFFICULTY_LABELS[clamped];

  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#374151' }} dir="rtl">
      <span>{label}</span>
      <span className="flex items-center gap-0.5">
        {[0, 1, 2].map(i => (
          <BoltIcon key={i} filled={i < clamped} />
        ))}
      </span>
      <span style={{ color: '#343434' }}>|</span>
      <span>{duration} דקות</span>
    </div>
  );
}

// ─── Carousel ────────────────────────────────────────────────────────────────

interface WorkoutSelectionCarouselProps {
  options: WorkoutTrioOption[];
  isRestDay: boolean;
  onSelect: (index: number) => void;
  onStart: (index: number) => void;
  workoutLocation?: string | null;
  programIconKey?: string | null;
  selectedIndex?: number;
}

export default function WorkoutSelectionCarousel({
  options,
  isRestDay,
  onSelect,
  onStart,
  workoutLocation,
  programIconKey,
  selectedIndex: controlledIndex,
}: WorkoutSelectionCarouselProps) {
  const [internalIndex, setInternalIndex] = useState(1);
  const activeIndex = controlledIndex ?? internalIndex;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(CARD_MAX_W);
  const [viewportW, setViewportW] = useState(390);

  useEffect(() => {
    const sync = () => {
      setCardW(Math.min(CARD_MAX_W, window.innerWidth * CARD_VW / 100));
      if (viewportRef.current) setViewportW(viewportRef.current.offsetWidth);
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  const stride = cardW + GAP;
  const centerX = (viewportW / 2) - (cardW / 2);
  const trackX = centerX - activeIndex * stride;

  const lastIndex = Math.max(0, options.length - 1);
  const dragLeft = centerX - lastIndex * stride;
  const dragRight = centerX;

  const handleSelect = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    setInternalIndex(clamped);
    onSelect(clamped);
  }, [options.length, onSelect]);

  const handleDragEnd = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -40) handleSelect(activeIndex + 1);
    else if (info.offset.x > 40) handleSelect(activeIndex - 1);
  }, [activeIndex, handleSelect]);

  return (
    <div
      ref={viewportRef}
      dir="rtl"
      className="overflow-hidden w-full"
      style={{ height: CARD_HEIGHT + 24 }}
    >
      <motion.div
        className="flex flex-row items-center"
        style={{ gap: GAP, paddingTop: 8, paddingBottom: 16, direction: 'ltr' }}
        initial={{ x: trackX }}
        animate={{ x: trackX }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag="x"
        dragConstraints={{ left: dragLeft, right: dragRight }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        {options.map((opt, i) => {
          const isActive = i === activeIndex;
          return (
            <motion.div
              key={i}
              className="flex-shrink-0"
              style={{ width: cardW, height: CARD_HEIGHT }}
              initial={false}
              animate={{
                scale: isActive ? ACTIVE_SCALE : SIDE_SCALE,
                zIndex: isActive ? 20 : 0,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={() => !isActive && handleSelect(i)}
            >
              <TrioCard
                option={opt}
                isRecovery={isRestDay || opt.result.workout.isRecovery}
                workoutLocation={workoutLocation}
                programIconKey={programIconKey}
                onStart={() => onStart(i)}
                isActive={isActive}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── TrioCard — matches the Figma / screenshot styling exactly ───────────────

function TrioCard({
  option,
  isRecovery,
  workoutLocation,
  programIconKey,
  onStart,
  isActive,
}: {
  option: WorkoutTrioOption;
  isRecovery: boolean;
  workoutLocation?: string | null;
  programIconKey?: string | null;
  onStart: () => void;
  isActive: boolean;
}) {
  const { workout } = option.result;
  const exercises = workout.exercises;
  const isNakedOption = /ללא ציוד|naked/i.test(option.label);

  const heroExercise = useMemo(() => pickHeroExercise(exercises), [exercises]);
  const heroMedia = useMemo(
    () => resolveHeroMedia(heroExercise, workoutLocation),
    [heroExercise, workoutLocation],
  );

  const equipmentIcons = useMemo(() => {
    if (isNakedOption) return [];
    if (!exercises?.length) return [];
    const seen = new Set<string>();
    const icons: { src?: string; label?: string }[] = [];
    for (const ex of exercises) {
      if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
      const method = ex.method;
      const rawIds: string[] = [
        ...((method as any)?.gearIds ?? []),
        ...((method as any)?.equipmentIds ?? []),
        ...((method as any)?.gearId ? [(method as any).gearId] : []),
        ...((method as any)?.equipmentId ? [(method as any).equipmentId] : []),
        ...(ex.exercise?.equipment ?? []),
      ].filter(Boolean);
      for (const raw of rawIds) {
        const norm = normalizeGearId(raw);
        if (norm === 'bodyweight' || norm === 'none' || seen.has(norm)) continue;
        seen.add(norm);
        const svgPath = resolveEquipmentSvgPath(norm);
        const label = resolveEquipmentLabel(norm);
        icons.push({ src: svgPath ?? undefined, label });
      }
    }
    return icons.slice(0, 4);
  }, [exercises, isNakedOption]);

  const programIconSrc = programIconKey
    ? PROGRAM_ICON_MAP[programIconKey.toLowerCase()] ?? null
    : null;

  return (
    <div
      className="relative overflow-hidden group cursor-pointer w-full h-full"
      style={{
        borderRadius: CARD_RADIUS,
        border: CARD_BORDER,
        boxShadow: isActive
          ? '0 4px 12px rgba(0,0,0,0.05)'
          : '0 2px 6px rgba(0,0,0,0.03)',
        transition: 'box-shadow 0.3s ease',
      }}
    >
      {/* 1. Background — video for active card, static thumbnail for side cards */}
      <div className="absolute inset-0">
        {isActive ? (
          <HeroMediaBackground
            thumbnailUrl={heroMedia.thumbnailUrl}
            videoUrl={heroMedia.videoUrl}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroMedia.thumbnailUrl}
            alt="Workout"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </div>

      {/* 2. Equipment badges — floated inside the image area */}
      <EquipmentBadgeRow icons={equipmentIcons} />

      {/* 3. Gradient: transparent top → solid white bottom */}
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

      {/* 4. Content layer — pinned to the bottom */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 pb-4" dir="rtl">
        {/* Metadata row: difficulty + bolts | duration */}
        <div className="w-full mb-1">
          <MetadataRow
            difficulty={workout.difficulty}
            duration={workout.estimatedDuration}
            isRecovery={isRecovery}
          />
        </div>

        {/* Title row with program icon */}
        <div className="flex items-center gap-2 w-full mb-2.5">
          {programIconSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={programIconSrc}
              alt=""
              width={22}
              height={22}
              className="flex-shrink-0 opacity-80"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <h4 className="font-semibold text-gray-800 dark:text-white leading-snug text-[16px]">
            {workout.title}
          </h4>
        </div>

        {/* CTA button — cyan gradient, full width */}
        <button
          onClick={onStart}
          className="w-full text-white font-bold rounded-full shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
          style={{
            height: 40,
            fontSize: 14,
            background: 'linear-gradient(to left, #00C9F2, #00AEEF)',
          }}
        >
          <Play size={16} fill="currentColor" />
          <span>יאללה, אפשר להתחיל!</span>
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function CarouselSkeleton() {
  return (
    <div className="w-full flex justify-center" style={{ height: CARD_HEIGHT + 24, paddingTop: 8 }}>
      <div
        className="bg-gray-100 dark:bg-slate-800 animate-pulse"
        style={{
          width: `min(${CARD_MAX_W}px, ${CARD_VW}vw)`,
          height: CARD_HEIGHT,
          borderRadius: CARD_RADIUS,
          border: CARD_BORDER,
        }}
      >
        <div className="flex flex-col justify-end items-center h-full px-4 pb-4">
          <div className="w-full mb-2">
            <div className="h-4 w-32 rounded-lg bg-gray-200 dark:bg-slate-700" />
          </div>
          <div className="w-full mb-3">
            <div className="h-5 w-48 rounded-lg bg-gray-200 dark:bg-slate-700" />
          </div>
          <div
            className="w-full rounded-full bg-gray-200 dark:bg-slate-700"
            style={{ height: 40 }}
          />
        </div>
      </div>
    </div>
  );
}
