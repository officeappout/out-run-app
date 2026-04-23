'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { PersonStanding, Heart } from 'lucide-react';
import type { WorkoutTrioOption } from '@/features/workout-engine/services/home-workout.types';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import {
  pickHeroExercise,
  resolveHeroMedia,
  EquipmentBadge,
  HeroMediaBackground,
  getGenderedCtaText,
} from './HeroWorkoutCard';
import {
  resolveEquipmentLabel,
  resolveEquipmentSvgPathList,
  resolveEquipmentCategory,
  CATEGORY_PRIORITY,
  normalizeGearId,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';

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
      <div className="flex items-center gap-2 text-[13px] font-normal" style={{ color: '#374151' }} dir="rtl">
        <span>🧘 התאוששות פעילה</span>
        <span style={{ color: '#343434' }}>|</span>
        <span>{duration} דקות</span>
      </div>
    );
  }

  const clamped = Math.min(3, Math.max(1, difficulty)) as 1 | 2 | 3;
  const label = DIFFICULTY_LABELS[clamped];

  return (
    <div className="flex items-center gap-2 text-[13px] font-normal" style={{ color: '#374151' }} dir="rtl">
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
  userGender?: 'male' | 'female' | 'other' | null;
}

export default function WorkoutSelectionCarousel({
  options,
  isRestDay,
  onSelect,
  onStart,
  workoutLocation,
  programIconKey,
  selectedIndex: controlledIndex,
  userGender,
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

  const isOnline = useOnlineStatus();
  const { showToast } = useToast();

  const handleSelect = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    setInternalIndex(clamped);
    onSelect(clamped);
  }, [options.length, onSelect]);

  const handleGuardedStart = useCallback((idx: number) => {
    if (!isOnline) {
      showToast('error', 'יצירת אימון חדש דורשת חיבור לאינטרנט');
      return;
    }
    onStart(idx);
  }, [isOnline, onStart, showToast]);

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
                onStart={() => handleGuardedStart(i)}
                isActive={isActive}
                userGender={userGender}
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
  userGender,
}: {
  option: WorkoutTrioOption;
  isRecovery: boolean;
  workoutLocation?: string | null;
  programIconKey?: string | null;
  onStart: () => void;
  isActive: boolean;
  userGender?: 'male' | 'female' | 'other' | null;
}) {
  const { workout } = option.result;
  const exercises = workout.exercises;
  const ctaText = useMemo(() => getGenderedCtaText(userGender, option.label), [userGender, option.label]);
  const isNakedOption = /ללא ציוד|naked/i.test(option.label);
  const isFavorited = useFavoritesStore((s) => s.isFavorited(workout));

  const heroExercise = useMemo(() => pickHeroExercise(exercises), [exercises]);
  const heroMedia = useMemo(
    () => resolveHeroMedia(heroExercise, workoutLocation),
    [heroExercise, workoutLocation],
  );

  const equipmentIcons = useMemo(() => {
    if (isNakedOption) return { display: [], total: 0 };
    if (!exercises?.length) return { display: [], total: 0 };
    const seen = new Set<string>();
    const icons: { srcList: string[]; label: string; norm: string }[] = [];
    for (const ex of exercises) {
      if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
      const method = ex.method;
      const rawIds: string[] = [
        ...((method as any)?.gearIds ?? []),
        ...((method as any)?.equipmentIds ?? []),
        ...((method as any)?.gearId ? [(method as any).gearId] : []),
        ...((method as any)?.equipmentId ? [(method as any).equipmentId] : []),
        // NOTE: ex.exercise.equipment is a LEGACY field (EquipmentType[])
        // that was populated before the executionMethods system. It often
        // contains stale data from duplicated exercises. Do NOT include it.
      ].filter(Boolean);
      for (const raw of rawIds) {
        const norm = normalizeGearId(raw);
        // Skip bodyweight, none, and unclassified placeholder IDs.
        if (norm === 'bodyweight' || norm === 'none' || norm === 'unknown_gear' || seen.has(norm)) continue;
        seen.add(norm);
        // Build a location-aware priority list: [park/home variant, generic]
        const srcList = resolveEquipmentSvgPathList(norm, workoutLocation);
        // Skip equipment that has no icon — it won't be displayed and
        // must not inflate the total count or generate empty badge slots.
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
  }, [exercises, isNakedOption, workoutLocation]);

  const programIconSrc = programIconKey
    ? PROGRAM_ICON_MAP[programIconKey.toLowerCase()] ?? null
    : null;

  return (
    <div
      onClick={onStart}
      className="relative overflow-hidden group cursor-pointer w-full h-full transition-transform active:scale-[0.98]"
      style={{
        borderRadius: CARD_RADIUS,
        border: CARD_BORDER,
        boxShadow: isActive
          ? '0 4px 12px rgba(0,0,0,0.05)'
          : '0 2px 6px rgba(0,0,0,0.03)',
        transition: 'box-shadow 0.3s ease, transform 0.15s ease',
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
        {/* Equipment badges — subtle secondary row above metadata */}
        {equipmentIcons.display.length > 0 ? (
          <div className="flex gap-1.5 mb-1.5">
            {equipmentIcons.display.map((icon, i) => (
              // key = canonical norm + index: always unique; remounts badge
              // (resetting its internal fallback index) when location changes.
              <EquipmentBadge
                key={`${icon.norm}_${i}`}
                iconSrcList={icon.srcList}
                label={icon.label}
                size={30}
              />
            ))}
            {equipmentIcons.total > 4 && (
              <div
                className="bg-white/90 shadow-sm flex items-center justify-center text-[10px] font-bold text-slate-500"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: '1.5px solid #E0E9FF',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                }}
              >
                +{equipmentIcons.total - 4}
              </div>
            )}
          </div>
        ) : (!isNakedOption && (exercises?.length ?? 0) > 0) ? (
          /* Bodyweight workout — no equipment needed */
          <div className="flex gap-1.5 mb-1.5">
            <div
              className="bg-white/90 shadow-sm flex items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 6 }}
              title="ללא ציוד – משקל גוף"
            >
              <PersonStanding className="text-slate-400" style={{ width: 17, height: 17 }} />
            </div>
          </div>
        ) : null}

        {/* Metadata row: difficulty + bolts | duration ←→ heart */}
        <div className="w-full flex items-center justify-between mb-1" dir="rtl">
          <MetadataRow
            difficulty={workout.difficulty}
            duration={workout.estimatedDuration}
            isRecovery={isRecovery}
          />
          {isFavorited && (
            <Heart size={14} className="text-red-500 fill-red-500 flex-shrink-0" />
          )}
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
          <h4 className="font-bold text-gray-800 dark:text-white leading-snug text-[17px] truncate min-w-0">
            {workout.title}
          </h4>
        </div>

        {/* CTA button — cyan gradient, full width */}
        <div
          className="w-full text-black font-semibold rounded-full shadow-lg shadow-cyan-400/20 flex items-center justify-center pointer-events-none"
          style={{
            height: 40,
            fontSize: 14,
            background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)',
          }}
        >
          {ctaText}
        </div>
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
