'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users, SlidersHorizontal } from 'lucide-react';
import { haversineKm } from '@/features/parks/core/services/geoUtils';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useUserStore } from '@/features/user';
import { getPublicGroups, joinGroup, leaveGroup } from '@/features/arena/services/group.service';
import GroupCard from '@/features/arena/components/GroupCard';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import { useCommunitySessionBanner } from '@/features/arena/hooks/useCommunitySessionBanner';
import { usePublicGroupPhases } from '@/features/arena/hooks/usePublicGroupPhases';
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

const IS_DEV = process.env.NODE_ENV === 'development';

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
  return withDist.filter((g) => g.km <= 20).slice(0, MAX_GROUPS);
}

export default function NearbyGroupsRow() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? null;
  const userName = profile?.core?.name ?? 'משתמש';

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [allGroups, setAllGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  // Drawer state
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [devOverrides, setDevOverrides] = useState<Record<string, 'approaching' | 'lobby' | 'active' | null>>({});

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

  // Sync joined groups from profile
  useEffect(() => {
    const savedIds = profile?.social?.groupIds;
    if (savedIds?.length) {
      setJoinedGroupIds((prev) => {
        const merged = new Set(prev);
        for (const id of savedIds) merged.add(id);
        return merged.size !== prev.size ? merged : prev;
      });
    }
  }, [profile?.social?.groupIds]);

  const userAuthorityId: string | null =
    (profile as any)?.core?.authorityId ?? null;

  // bannerSessions still used for GroupDetailsDrawer's liveSession prop (member attendance data)
  const { sessions: bannerSessions } = useCommunitySessionBanner();
  // Public phase map — covers all visible groups regardless of membership
  const publicPhases = usePublicGroupPhases(allGroups);
  const livePhaseMap = useMemo(() => {
    const map: Record<string, 'approaching' | 'lobby' | 'active'> = { ...publicPhases };
    if (IS_DEV) {
      Object.entries(devOverrides).forEach(([gid, phase]) => {
        if (phase === 'approaching' || phase === 'lobby' || phase === 'active') {
          map[gid] = phase;
        } else {
          delete map[gid];
        }
      });
    }
    return map;
  }, [publicPhases, devOverrides]);

  const nearby = useMemo(
    () => userPos ? computeNearby(allGroups, userPos, userAuthorityId) : [],
    [allGroups, userPos, userAuthorityId],
  );

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return nearby;
    if (categoryFilter === 'community') return nearby.filter((g) => g.group.source === 'user');
    return nearby.filter((g) => g.group.category === categoryFilter);
  }, [nearby, categoryFilter]);

  const sorted = useMemo(() => {
    const phaseOrder: Record<string, number> = { active: 0, lobby: 1, approaching: 2 };
    return [...filtered].sort((a, b) => {
      const pa = phaseOrder[livePhaseMap[a.group.id] ?? ''] ?? 3;
      const pb = phaseOrder[livePhaseMap[b.group.id] ?? ''] ?? 3;
      return pa !== pb ? pa - pb : a.km - b.km;
    });
  }, [filtered, livePhaseMap]);

  async function handleJoin(groupId: string) {
    if (!userId) return;
    setJoiningId(groupId);
    try {
      await joinGroup(groupId, userId, userName);
      setJoinedGroupIds((prev) => { const next = new Set(Array.from(prev)); next.add(groupId); return next; });
    } catch (err) {
      console.error('[NearbyGroupsRow] joinGroup failed:', err);
    } finally {
      setJoiningId(null);
    }
  }

  async function handleLeave(groupId: string) {
    if (!userId) return;
    try {
      await leaveGroup(groupId, userId);
      setJoinedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    } catch (err) {
      console.error('[NearbyGroupsRow] leaveGroup failed:', err);
    }
  }

  if (!loading && nearby.length === 0) return null;

  return (
    <>
      <section dir="rtl" className="space-y-2">
        {/* Header row: title + count + filter icon + "all" link */}
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
            <Users size={15} className="text-cyan-500" />
            קבוצות קרובות אליך
            {!loading && (
              <span className="text-[13px] font-semibold text-gray-400 dark:text-gray-500">
                ({sorted.length})
              </span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            {!loading && (
              <button
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                aria-label="סנן קבוצות"
                aria-expanded={filterOpen}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  filterOpen || categoryFilter !== 'all'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                <SlidersHorizontal size={15} />
              </button>
            )}
            <button
              onClick={() => router.push('/search')}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 min-h-[44px] px-1"
            >
              הכל ›
            </button>
          </div>
        </div>

        {/* Collapsible category chips */}
        {filterOpen && !loading && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-4 px-4">
            {CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => { setCategoryFilter(chip.key); if (chip.key !== 'all') setFilterOpen(false); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[36px] ${
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
        ) : sorted.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
            אין קבוצות בקטגוריה זו באזורך
          </p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            {sorted.map(({ group, km }) => (
              <GroupCard
                key={group.id}
                group={group}
                distanceKm={km}
                compact
                livePhase={livePhaseMap[group.id]}
                onCardClick={() => setSelectedGroup(group)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Group details drawer — opens inline, closes back to home */}
      <GroupDetailsDrawer
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        group={selectedGroup}
        isJoined={selectedGroup ? joinedGroupIds.has(selectedGroup.id) : false}
        joining={selectedGroup ? joiningId === selectedGroup.id : false}
        onJoin={handleJoin}
        onLeave={handleLeave}
        liveSession={bannerSessions.find((s) => s.groupId === selectedGroup?.id)}
        onLivePhaseChange={(gid, phase) => {
          if (IS_DEV) setDevOverrides((prev) => ({ ...prev, [gid]: phase as 'approaching' | 'lobby' | 'active' | null }));
        }}
      />
    </>
  );
}
