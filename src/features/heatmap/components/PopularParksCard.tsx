'use client';

/**
 * PopularParksCard — Top 5 parks by `visitCount` this calendar month for an
 * authority. Sits beneath PopularRoutesCard on the admin heatmap page.
 *
 * Reads from `parks` + `sessions` (and optionally `users`/`workouts` for
 * the richer overlay), aggregated server-side in
 * `fetchPopularParks() → fetchParksForOverlay()`. NO PII surfaced.
 *
 * Per the spec, this card intentionally hides the status badge — a park
 * shows up here purely on usage merit, regardless of open/closed state.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Trophy, Trees, Clock } from 'lucide-react';
import {
  fetchPopularParks,
  type ParkOverlayItem,
} from '@/features/heatmap/services/route-overlay.service';

interface PopularParksCardProps {
  authorityId: string;
}

function formatHour(hour: number | null): string | null {
  if (hour == null) return null;
  return `${String(hour).padStart(2, '0')}:00`;
}

export default function PopularParksCard({ authorityId }: PopularParksCardProps) {
  const [items, setItems] = useState<ParkOverlayItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPopularParks(authorityId, 5)
      .then((rs) => { if (!cancelled) setItems(rs); })
      .catch((err) => {
        console.error('[PopularParksCard] fetch error:', err);
        if (!cancelled) setItems([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorityId]);

  return (
    <div
      dir="rtl"
      className="w-full bg-white rounded-2xl border border-gray-200 shadow-card p-4 md:p-5 mt-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-emerald-500" />
        <h2 className="text-sm md:text-base font-bold text-gray-900">
          פארקים פופולריים החודש
        </h2>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      )}

      {!loading && items !== null && items.length === 0 && (
        <div className="py-6 text-center text-xs text-gray-500">
          אין נתוני ביקורים עדיין
        </div>
      )}

      {!loading && items !== null && items.length > 0 && (
        <ol className="space-y-2">
          {items.map((park, index) => {
            const rank = index + 1;
            const peakHour = formatHour(park.peakHour);
            return (
              <li
                key={park.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors"
              >
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                    rank === 1
                      ? 'bg-amber-100 text-amber-700'
                      : rank === 2
                        ? 'bg-gray-200 text-gray-700'
                        : rank === 3
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  {rank}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                    <Trees size={13} className="text-emerald-500 shrink-0" />
                    <span className="truncate">{park.name}</span>
                  </div>
                  {peakHour && (
                    <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
                      <Clock size={11} className="text-gray-400" />
                      שעת שיא: {peakHour}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-end" dir="rtl">
                  <div className="text-sm font-black text-gray-900">
                    {park.visitCount.toLocaleString('he-IL')}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-none">ביקורים החודש</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
