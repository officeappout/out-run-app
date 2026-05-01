'use client';

/**
 * PopularRoutesCard — Top 5 official routes by `analytics.usageCount` for an
 * authority. Sits beneath the LiveHeatMap on the admin heatmap page.
 *
 * Reads `official_routes` only — no PII involved.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Footprints, Bike, Activity, Trophy } from 'lucide-react';
import {
  fetchPopularRoutes,
  type RouteOverlayItem,
} from '@/features/heatmap/services/route-overlay.service';

interface PopularRoutesCardProps {
  authorityId: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
  workout: 'אימון',
};

function ActivityIcon({ kind }: { kind: RouteOverlayItem['activityType'] }) {
  if (kind === 'cycling') return <Bike size={14} className="text-indigo-500" />;
  if (kind === 'walking') return <Footprints size={14} className="text-emerald-500" />;
  if (kind === 'running') return <Footprints size={14} className="text-orange-500" />;
  return <Activity size={14} className="text-gray-400" />;
}

function formatRelativeHebrew(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return '—';
  const diffDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'היום';
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'לפני שבוע' : `לפני ${weeks} שבועות`;
  }
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PopularRoutesCard({ authorityId }: PopularRoutesCardProps) {
  const [items, setItems] = useState<RouteOverlayItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPopularRoutes(authorityId, 5)
      .then((rs) => { if (!cancelled) setItems(rs); })
      .catch((err) => {
        console.error('[PopularRoutesCard] fetch error:', err);
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
        <Trophy size={16} className="text-amber-500" />
        <h2 className="text-sm md:text-base font-bold text-gray-900">
          מסלולים פופולריים החודש
        </h2>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      )}

      {!loading && items !== null && items.length === 0 && (
        <div className="py-6 text-center text-xs text-gray-500">
          אין נתוני שימוש עדיין
        </div>
      )}

      {!loading && items !== null && items.length > 0 && (
        <ol className="space-y-2">
          {items.map((route, index) => {
            const rank = index + 1;
            const activityLabel = route.activityType
              ? ACTIVITY_LABELS[route.activityType] ?? route.activityType
              : null;
            return (
              <li
                key={route.id}
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
                          : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  {rank}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 truncate">{route.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <ActivityIcon kind={route.activityType} />
                      {activityLabel ?? '—'}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>שימוש אחרון: {formatRelativeHebrew(route.lastUsed)}</span>
                  </div>
                </div>

                <div className="shrink-0 text-end" dir="rtl">
                  <div className="text-sm font-black text-gray-900">
                    {route.usageCount.toLocaleString('he-IL')}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-none">שימושים</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
