'use client';

import { useState, useEffect } from 'react';
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CommunityGroup, CommunityEvent } from '@/types/community.types';
import type { Authority } from '@/types/admin-types';

export interface ArenaData {
  authority: Authority | null;
  groups: CommunityGroup[];
  events: CommunityEvent[];
  isActiveClient: boolean;
  /** true only when authority.isActiveClient — drives official league vs pressure mode */
  isLeagueActive: boolean;
  isLoading: boolean;
  error: string | null;
}

// ── date helper ───────────────────────────────────────────────────────────────

function toDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? new Date() : d; }
  if (ts && typeof (ts as any).seconds === 'number') return new Date((ts as any).seconds * 1000);
  return new Date();
}

function normalizeGroup(id: string, data: any): CommunityGroup {
  return {
    id,
    authorityId: data?.authorityId ?? '',
    name: data?.name ?? '',
    description: data?.description ?? '',
    category: data?.category ?? 'other',
    meetingLocation: data?.meetingLocation ?? undefined,
    schedule: data?.schedule ?? undefined,
    scheduleSlots: data?.scheduleSlots ?? undefined,
    maxParticipants: data?.maxParticipants ?? undefined,
    currentParticipants: data?.currentParticipants ?? 0,
    isActive: data?.isActive ?? true,
    createdBy: data?.createdBy ?? '',
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
    groupType: data?.groupType ?? undefined,
    scopeId: data?.scopeId ?? undefined,
    ageRestriction: data?.ageRestriction ?? undefined,
    memberCount: data?.memberCount ?? undefined,
    isPublic: data?.isPublic ?? undefined,
    inviteCode: data?.inviteCode ?? undefined,
    targetMuscles: data?.targetMuscles ?? undefined,
    equipment: data?.equipment ?? undefined,
    price: data?.price ?? undefined,
    isOfficial: data?.isOfficial ?? false,
    // source MUST be read from Firestore — it drives all tier-filtering in the feed.
    // Leaving it undefined here made every group invisible to the tier logic.
    source: data?.source ?? undefined,
    targetGender: data?.targetGender ?? undefined,
    targetAgeRange: data?.targetAgeRange ?? undefined,
    images: data?.images ?? undefined,
    rules: data?.rules ?? undefined,
    isCityOnly: data?.isCityOnly ?? false,
    restrictedNeighborhoodId: data?.restrictedNeighborhoodId ?? undefined,
  };
}

function normalizeEvent(id: string, data: any): CommunityEvent {
  return {
    id,
    authorityId: data?.authorityId ?? '',
    name: data?.name ?? '',
    description: data?.description ?? '',
    category: data?.category ?? 'other',
    date: toDate(data?.date),
    startTime: data?.startTime ?? '09:00',
    endTime: data?.endTime ?? undefined,
    location: data?.location ?? { address: '', location: { lat: 0, lng: 0 } },
    registrationRequired: data?.registrationRequired ?? false,
    maxParticipants: data?.maxParticipants ?? undefined,
    currentRegistrations: data?.currentRegistrations ?? 0,
    isActive: data?.isActive ?? true,
    createdBy: data?.createdBy ?? '',
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
    groupType: data?.groupType ?? undefined,
    groupId: data?.groupId ?? undefined,
    ageRestriction: data?.ageRestriction ?? undefined,
    isOfficial: data?.isOfficial ?? false,
    authorityLogoUrl: data?.authorityLogoUrl ?? undefined,
    targetMuscles: data?.targetMuscles ?? undefined,
    equipment: data?.equipment ?? undefined,
    price: data?.price ?? undefined,
    specialNotice: data?.specialNotice ?? undefined,
    targetGender: data?.targetGender ?? undefined,
    targetAgeRange: data?.targetAgeRange ?? undefined,
    images: data?.images ?? undefined,
    externalLink: data?.externalLink ?? undefined,
    isCityOnly: data?.isCityOnly ?? false,
    restrictedNeighborhoodId: data?.restrictedNeighborhoodId ?? undefined,
  };
}

export function useArenaData(authorityId: string | null): ArenaData {
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authorityId) {
      setAuthority(null);
      setGroups([]);
      setEvents([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    // One-time authority fetch (rarely changes)
    getDoc(doc(db, 'authorities', authorityId))
      .then((snap) => {
        if (snap.exists()) setAuthority({ id: snap.id, ...snap.data() } as Authority);
      })
      .catch((err) => console.warn('[useArenaData] authority fetch failed:', err));

    // Real-time groups listener
    const groupsQ = query(
      collection(db, 'community_groups'),
      where('authorityId', '==', authorityId),
      orderBy('createdAt', 'desc'),
    );
    const unsubGroups = onSnapshot(
      groupsQ,
      (snap) => {
        setGroups(snap.docs.map((d) => normalizeGroup(d.id, d.data())));
        setIsLoading(false);
      },
      (err) => {
        console.error('[useArenaData] groups listener error:', err);
        setError('שגיאה בטעינת קבוצות');
        setIsLoading(false);
      },
    );

    // Real-time events listener (active only)
    const eventsQ = query(
      collection(db, 'community_events'),
      where('authorityId', '==', authorityId),
      where('isActive', '==', true),
      orderBy('date', 'asc'),
    );
    const unsubEvents = onSnapshot(
      eventsQ,
      (snap) => {
        setEvents(snap.docs.map((d) => normalizeEvent(d.id, d.data())));
      },
      (err) => {
        console.error('[useArenaData] events listener error:', err);
      },
    );

    return () => {
      unsubGroups();
      unsubEvents();
    };
  }, [authorityId]);

  const isActiveClient = authority?.isActiveClient ?? false;

  return {
    authority,
    groups,
    events,
    isActiveClient,
    isLeagueActive: isActiveClient,
    isLoading,
    error,
  };
}
