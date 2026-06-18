'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { haversineKm } from '@/features/parks/core/services/geoUtils';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useUserStore } from '@/features/user';
import { getPublicGroups } from '@/features/arena/services/group.service';
import GroupCard from '@/features/arena/components/GroupCard';
import type { CommunityGroup } from '@/types/community.types';

const CITY_FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  'שדרות': { lat: 31.5250, lng: 34.5995 },
  'תל אביב': { lat: 32.0853, lng: 34.7818 },
  'ירושלים': { lat: 31.7683, lng: 35.2137 },
  'חיפה': { lat: 32.7940, lng: 34.9896 },
  'באר שבע': { lat: 31.2530, lng: 34.7915 },
  'אשדוד': { lat: 31.8040, lng: 34.6553 },
  'הרצליה': { lat: 32.1629, lng: 34.8446 },
  'רמת גן': { lat: 32.0680, lng: 34.8240 },
  'נתניה': { lat: 32.3215, lng: 34.8532 },
  'ראשון לציון': { lat: 31.9730, lng: 34.7925 },
};
const DEFAULT_FALLBACK = { lat: 31.5250, lng: 34.5995 };

const RADII_KM = [5, 10, 20] as const;
const MIN_GROUPS = 4;
const MAX_GROUPS = 12;

type CategoryFilter = 'all' | 'walking' | 'running' | 'calisthenics' | 'community';

const CHIPS: { key: CategoryFilter; label: string }[] = [
  { key: 'all',          label: 'הכל' },
  { key: 'walking',      label: 'הליכה' },
  { key: 'running',      label: 'ריצה' },
  { key: 'calisthenics', label: 'כוח' },
  { key: 'community',    label: 'קהילתי' },
];

interface Nearby { group: CommunityGroup; km: number }

function computeNearby(
  groups: CommunityGroup[],
  userPos: { lat: number; lng: number },
  userAuthorityId: string | null,
): Nearby[] {
  const withDist: Nearby[] = groups
    .filter((g) => {
      const loc = g.meetingLocation?.location;
      if (!loc?.lat || !loc?.lng) return false;
      if (g.isCityOnly && g.authorityId !== userAuthorityId) return false;
      return true;
    })
    .map((g) => ({
      group: g,
      km: haversineKm(
        userPos.lat, userPos.lng,
        g.meetingLocation!.location!.lat,
        g.meetingLocation!.location!.lng,
      ),
    }))
    .sort((a, b) => a.km - b.km);

  for (const radius of RADII_KM) {
    const inRadius = withDist.filter((g) => g.km <= radius).slice(0, MAX_GROUPS);
    if (inRadius.length >= MIN_GROUPS) return inRadius;
  }
  // Still return whatever is within 20 km (may be < MIN_GROUPS — caller hides row if 0)
  return withDist.filter((g) => g.km <= 20).slice(0, MAX_GROUPS);
}

export default function NearbyGroupsRow() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [allGroups, setAllGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const applyFallback = () => {
      const city = (profile as any)?.core?.city ?? (profile as any)?.city ?? '';
      const fallback = (city && CITY_FALLBACK_COORDS[city]) ? CITY_FALLBACK_COORDS[city] : DEFAULT_FALLBACK;
      setUserPos(fallback);
    };

    useGPSStore.getState().requestPermissionIfAllowed().then((coords) => {
      if (cancelled) return;
      if (coords) setUserPos(coords);
      else applyFallback();
    });

    getPublicGroups()
      .then((groups) => { if (!cancelled) setAllGroups(groups); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [profile]);

  const userAuthorityId: string | null =
    (profile as any)?.core?.authorityId ?? null;

  const nearby = useMemo(
    () => userPos ? computeNearby(allGroups, userPos, userAuthorityId) : [],
    [allGroups, userPos, userAuthorityId],
  );

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return nearby;
    if (categoryFilter === 'community') return nearby.filter((g) => g.group.source === 'user');
    return nearby.filter((g) => g.group.category === categoryFilter);
  }, [nearby, categoryFilter]);

  // Hide row entirely when no nearby groups found across all radii
  if (!loading && nearby.length === 0) return null;

  return (
    <section dir="rtl" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          <Users size={15} className="text-cyan-500" />
          קבוצות קרובות אליך
        </h3>
        <button
          onClick={() => router.push('/community')}
          className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 min-h-[44px] px-1"
        >
          הכל ›
        </button>
      </div>

      {/* Category chips */}
      {!loading && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-4 px-4">
          {CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => setCategoryFilter(chip.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[44px] ${
                categoryFilter === chip.key
                  ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="flex gap-2.5 overflow-x-hidden -mx-4 px-4 pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[148px] rounded-2xl overflow-hidden shadow-sm">
              <div className="w-full h-24 bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="px-2.5 py-2 space-y-1.5 bg-white dark:bg-slate-900">
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
          אין קבוצות בקטגוריה זו באזורך
        </p>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          {filtered.map(({ group, km }) => (
            <GroupCard
              key={group.id}
              group={group}
              distanceKm={km}
              compact
              onCardClick={() => router.push(`/community?groupId=${group.id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
