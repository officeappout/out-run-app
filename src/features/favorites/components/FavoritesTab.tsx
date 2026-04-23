'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Heart, ArrowDownCircle, Clock, Zap, Dumbbell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useCachedMediaUrl } from '../hooks/useCachedMedia';
import type { FavoriteWorkout } from '../types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

interface FavoritesTabProps {
  onSelectWorkout: (generated: GeneratedWorkout, fav: FavoriteWorkout) => void;
}

const DIFFICULTY_MAP: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };

function favoriteToGeneratedWorkout(fav: FavoriteWorkout): GeneratedWorkout {
  return {
    title: fav.title,
    description: fav.description || '',
    exercises: fav.exercises.map((ex) => ({
      exercise: {
        id: ex.exerciseId,
        name: ex.name,
        primaryMuscle: ex.primaryMuscle ?? null,
        secondaryMuscles: ex.secondaryMuscles ?? [],
        exerciseRole: ex.exerciseRole ?? 'main',
        symmetry: ex.symmetry ?? undefined,
        movementGroup: ex.movementGroup ?? undefined,
        content: {
          instructions: ex.instructions ? { he: ex.instructions, en: '' } : undefined,
          description: ex.description ? { he: ex.description, en: '' } : undefined,
          specificCues: ex.specificCues ?? [],
          goal: ex.goal ?? undefined,
          notes: ex.notes ?? [],
          highlights: ex.highlights ?? [],
        },
        media: {
          imageUrl: ex.imageUrl ?? undefined,
          videoUrl: ex.videoUrl ?? undefined,
        },
      } as any,
      method: {
        media: {
          imageUrl: ex.imageUrl ?? undefined,
          mainVideoUrl: ex.videoUrl ?? undefined,
        },
        specificCues: ex.methodCues ?? [],
        highlights: ex.methodHighlights ?? [],
        notificationText: ex.notificationText ?? undefined,
      },
      mechanicalType: 'hybrid' as any,
      sets: ex.sets,
      reps: ex.reps,
      repsRange: ex.repsRange,
      isTimeBased: ex.isTimeBased ?? false,
      restSeconds: ex.restSeconds ?? 30,
      priority: 'primary' as any,
      score: 0,
      reasoning: [],
      exerciseRole: ex.exerciseRole ?? 'main',
      pairedWith: ex.pairedWith ?? undefined,
    })) as any,
    estimatedDuration: fav.estimatedDuration,
    structure: (fav.structure || 'straight') as any,
    difficulty: fav.difficulty,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0:0' },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: fav.isRecovery ?? false,
    totalPlannedSets: fav.totalPlannedSets ?? 0,
  };
}

function DifficultyBolts({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Zap
          key={i}
          size={12}
          className={i <= level ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
        />
      ))}
    </div>
  );
}

const FavoriteWorkoutCard = React.forwardRef<
  HTMLButtonElement,
  { fav: FavoriteWorkout; isDownloaded: boolean; onSelect: () => void }
>(function FavoriteWorkoutCard({ fav, isDownloaded, onSelect }, ref) {
  const rawThumbUrl = fav.exercises[0]?.imageUrl ?? null;
  const cachedThumbUrl = useCachedMediaUrl(rawThumbUrl);
  const [thumbError, setThumbError] = useState(false);

  return (
    <motion.button
      ref={ref}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97, backgroundColor: '#F1F5F9' }}
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-100 transition-transform text-start"
      dir="rtl"
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
        {cachedThumbUrl && !thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cachedThumbUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Dumbbell size={22} className="text-slate-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{fav.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <DifficultyBolts level={fav.difficulty} />
          <span className="text-[11px] text-gray-500 font-medium">
            {DIFFICULTY_MAP[fav.difficulty] ?? ''}
          </span>
          <span className="text-gray-300">·</span>
          <div className="flex items-center gap-0.5 text-gray-500">
            <Clock size={11} />
            <span className="text-[11px] font-medium">{fav.estimatedDuration} דק׳</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {fav.exerciseCount} תרגילים · {fav.totalPlannedSets} סבבים
        </p>
      </div>

      {/* Downloaded indicator */}
      {isDownloaded && (
        <div className="flex-shrink-0">
          <ArrowDownCircle size={20} className="text-emerald-500 fill-emerald-500/20" />
        </div>
      )}
    </motion.button>
  );
});

export default function FavoritesTab({ onSelectWorkout }: FavoritesTabProps) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const downloadedIds = useFavoritesStore((s) => s.downloadedIds);
  const isLoading = useFavoritesStore((s) => s.isLoading);

  const sortedFavorites = useMemo(() => {
    const arr = Array.from(favorites.values());
    arr.sort((a, b) => {
      const ta = a.savedAt instanceof Date ? a.savedAt.getTime() : new Date(a.savedAt).getTime();
      const tb = b.savedAt instanceof Date ? b.savedAt.getTime() : new Date(b.savedAt).getTime();
      return tb - ta;
    });
    return arr;
  }, [favorites]);

  const handleSelect = useCallback(
    (fav: FavoriteWorkout) => {
      const generated = favoriteToGeneratedWorkout(fav);
      onSelectWorkout(generated, fav);
    },
    [onSelectWorkout],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-3 border-[#00C9F2] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 font-medium">טוען מועדפים...</p>
      </div>
    );
  }

  if (sortedFavorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 gap-4" dir="rtl">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <Heart size={28} className="text-gray-300" />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-base font-bold text-gray-700">אין אימונים שמורים</p>
          <p className="text-sm text-gray-400 leading-relaxed max-w-[280px]">
            סמנ/י לב באימון שאהבת כדי לגשת אליו מכל מקום, גם ללא אינטרנט.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400 font-medium text-end" dir="rtl">
        {sortedFavorites.length} אימונים שמורים
      </p>
      <AnimatePresence mode="popLayout">
        {sortedFavorites.map((fav) => (
          <FavoriteWorkoutCard
            key={fav.id}
            fav={fav}
            isDownloaded={downloadedIds.has(fav.id)}
            onSelect={() => handleSelect(fav)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
