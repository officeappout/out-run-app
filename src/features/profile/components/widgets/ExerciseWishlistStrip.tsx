'use client';

/**
 * ExerciseWishlistStrip — displays progression.exerciseWishlist (Slice 2b).
 *
 * Save + display only: this list is never read by scoring/volume/workout
 * generation. Deliberately NOT built as a 4th PrioritiesSection group — that
 * component is order/badge-based and gated at >=2 items ("a single
 * selection has no meaningful order"), both wrong for a starred, unordered
 * wishlist that must render even with exactly 1 item. Modeled on
 * FavoritesStrip.tsx (header + empty-state + horizontal card strip).
 */

import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { resolveImageForLocation } from '@/features/content/exercises/core/exercise.types';

interface ResolvedWishlistItem {
  exerciseId: string;
  name: string;
  thumbnailUrl: string;
}

function WishlistCard({ item }: { item: ResolvedWishlistItem }) {
  return (
    <div className="flex-shrink-0 w-32 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center gap-2">
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Star size={20} className="text-gray-300" />
        )}
      </div>
      <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">{item.name}</p>
    </div>
  );
}

export default function ExerciseWishlistStrip() {
  const { profile } = useUserStore();
  const entries = profile?.progression?.exerciseWishlist ?? [];
  const [resolved, setResolved] = useState<ResolvedWishlistItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (entries.length === 0) {
      setResolved([]);
      return;
    }
    (async () => {
      const items = await Promise.all(
        entries.map(async (entry) => {
          const ex = await getExercise(entry.exerciseId);
          const name = ex
            ? getLocalizedText(ex.name, 'he') || getLocalizedText(ex.name, 'en') || entry.exerciseId
            : entry.exerciseId;
          const thumbnailUrl = ex ? resolveImageForLocation(ex) : '';
          return { exerciseId: entry.exerciseId, name, thumbnailUrl };
        })
      );
      if (!cancelled) setResolved(items);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(entries.map((e) => e.exerciseId))]);

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-black text-gray-900">תרגילים שאני רוצה ללמוד</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Star className="w-10 h-10 text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">עדיין לא סימנת תרגילים</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <Star className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-black text-gray-900">תרגילים שאני רוצה ללמוד</h3>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {resolved.map((item) => (
          <WishlistCard key={item.exerciseId} item={item} />
        ))}
      </div>
    </div>
  );
}
