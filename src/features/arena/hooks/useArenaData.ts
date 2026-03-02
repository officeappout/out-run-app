'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getGroupsByAuthority, getEventsByAuthority } from '@/features/admin/services/community.service';
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

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const [authSnap, fetchedGroups, fetchedEvents] = await Promise.all([
          getDoc(doc(db, 'authorities', authorityId!)),
          getGroupsByAuthority(authorityId!),
          getEventsByAuthority(authorityId!),
        ]);

        if (cancelled) return;

        if (authSnap.exists()) {
          setAuthority({ id: authSnap.id, ...authSnap.data() } as Authority);
        }
        setGroups(fetchedGroups);
        setEvents(fetchedEvents.filter((e) => e.isActive));
      } catch (err) {
        if (!cancelled) {
          console.error('[useArenaData] Load failed:', err);
          setError('שגיאה בטעינת נתונים');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
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
