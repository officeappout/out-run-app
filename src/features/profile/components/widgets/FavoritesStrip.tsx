'use client';

import React, { useEffect } from 'react';
import { Heart, Dumbbell, Clock } from 'lucide-react';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import type { FavoriteWorkout } from '@/features/favorites/types';

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'קל',
  2: 'בינוני',
  3: 'קשה',
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-red-100 text-red-700',
};

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m} דק׳`;
}

function FavoriteCard({ fav }: { fav: FavoriteWorkout }) {
  return (
    <div
      className="flex-shrink-0 w-44 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between"
    >
      <div>
        <h4 className="text-sm font-black text-gray-900 leading-tight line-clamp-2 mb-2">
          {fav.title}
        </h4>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Dumbbell className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-bold text-gray-500">
            {fav.exerciseCount} תרגילים
          </span>
        </div>
        {fav.estimatedDuration > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] font-bold text-gray-500">
              {formatDuration(fav.estimatedDuration)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3">
        <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[fav.difficulty] || 'bg-gray-100 text-gray-600'}`}>
          {DIFFICULTY_LABELS[fav.difficulty] || `רמה ${fav.difficulty}`}
        </span>
      </div>
    </div>
  );
}

export default function FavoritesStrip() {
  const { favorites, _hydrated, loadFavorites } = useFavoritesStore();

  useEffect(() => {
    if (!_hydrated) loadFavorites();
  }, [_hydrated, loadFavorites]);

  const allFavs = Array.from(favorites.values())
    .sort((a, b) => {
      const da = a.savedAt instanceof Date ? a.savedAt.getTime() : 0;
      const db = b.savedAt instanceof Date ? b.savedAt.getTime() : 0;
      return db - da;
    })
    .slice(0, 6);

  if (allFavs.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-[#00ADEF]" />
          <h3 className="text-sm font-black text-gray-900">אימונים שמורים</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Heart className="w-10 h-10 text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">אין אימונים שמורים</p>
          <p className="text-xs text-gray-300 mt-0.5">לחץ על הלב באימון כדי לשמור אותו</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-[#00ADEF]" />
          <h3 className="text-sm font-black text-gray-900">אימונים שמורים</h3>
        </div>
        <span className="text-[10px] font-bold text-gray-400">
          {favorites.size} שמורים
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {allFavs.map((fav) => (
          <FavoriteCard key={fav.id} fav={fav} />
        ))}
      </div>
    </div>
  );
}
