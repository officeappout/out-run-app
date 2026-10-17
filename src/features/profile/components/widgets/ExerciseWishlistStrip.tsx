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

function WishlistPillV2({ item }: { item: ResolvedWishlistItem }) {
  return (
    <div className="flex h-10 max-w-full items-center gap-2 rounded-full bg-white pe-4 ps-1 shadow-v2-ring">
      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-v2-tint text-v2-deep">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Star size={14} aria-hidden />
        )}
      </span>
      <span className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-ink">{item.name}</span>
    </div>
  );
}

export default function ExerciseWishlistStrip({ v2 = false }: { v2?: boolean } = {}) {
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

  if (v2) {
    return (
      <div dir="rtl">
        <h3 className="mb-3 text-[15px] font-black text-v2-ink">תרגילים שאני רוצה ללמוד</h3>
        {entries.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-v2-ring">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep">
              <Star className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <p className="text-[14px] font-bold text-v2-ink-2">עדיין לא סימנת תרגילים</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {resolved.map((item) => (
              <WishlistPillV2 key={item.exerciseId} item={item} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div dir="rtl">
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
