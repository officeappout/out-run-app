'use client';

import { useEffect, useMemo, useCallback } from 'react';
import { useParkEvents, type DayFilter, type SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { useMyRegistrations } from '@/features/parks/core/hooks/useMyRegistrations';
import { auth } from '@/lib/firebase';
import type { Park } from '@/features/parks/core/types/park.types';
import { mergeLocalArrivals, filterVisibleParkEvents, selectRegistrableEventIds } from '../utils/park-detail-logic';

interface UseParkSessionsArgs {
  isOpen: boolean;
  park: Park | null;
  /** write-layer-4 audit — scopes useParkEvents' squad-mode arrivals to groups this viewer is in. */
  myGroupIds: string[];
  dayFilter: DayFilter;
  /** Optimistic arrivals published from this sheet (see useParkArrivalPublish). */
  localArrivals: SessionEnrichment[];
}

/**
 * "מתאמנים" — the park's live sessions (events, recurring groups, personal
 * arrivals) merged with this viewer's optimistic arrivals, filtered to the
 * selected day, plus the viewer's registrations on the real events.
 */
export function useParkSessions({ isOpen, park, myGroupIds, dayFilter, localArrivals }: UseParkSessionsArgs) {
  const { events: parkEvents, loading: eventsLoading } = useParkEvents(
    isOpen ? park?.id : null,
    myGroupIds,
  );

  const mergedParkEvents = useMemo(
    () => mergeLocalArrivals(parkEvents, localArrivals),
    [parkEvents, localArrivals],
  );

  const filteredParkEvents = useMemo(
    () => filterVisibleParkEvents(mergedParkEvents, dayFilter, auth.currentUser?.uid),
    [mergedParkEvents, dayFilter],
  );

  const realEventIds = useMemo(
    () => selectRegistrableEventIds(mergedParkEvents),
    [mergedParkEvents],
  );
  const registeredEventIds = useMyRegistrations(realEventIds);

  useEffect(() => {
    if (isOpen && park?.id) {
      console.log('[ParkDetail] Park:', park.id, park.name, '| Events found:', mergedParkEvents.length, mergedParkEvents.map(e => e.eventLabel));
    }
  }, [isOpen, park?.id, park?.name, mergedParkEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUid = auth.currentUser?.uid;

  const isUserRegistered = useCallback((ev: SessionEnrichment) => {
    if (registeredEventIds.has(ev.eventId)) return true;
    return currentUid ? ev.avatars?.some((a) => a.uid === currentUid) : false;
  }, [registeredEventIds, currentUid]);

  return { parkEvents, eventsLoading, filteredParkEvents, currentUid, isUserRegistered };
}
