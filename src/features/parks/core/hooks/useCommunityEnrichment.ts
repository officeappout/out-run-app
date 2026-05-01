'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  orderBy,
  limit as firestoreLimit,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { haversineKm } from '../services/geoUtils';
import type { Route } from '../types/route.types';

export interface SessionEnrichment {
  eventId: string;
  eventLabel: string;
  nextStartTime: string;
  maxParticipants?: number;
  currentRegistrations: number;
  spotsLeft?: number;
  plannedCount: number;
  avatars: { uid: string; name: string; photoURL?: string }[];
  /** True when generated from a recurring group schedule (no real event doc) */
  isRecurring?: boolean;
  /** Source group ID (only set for recurring group sessions) */
  groupId?: string;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function safeDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'object' && 'toDate' in raw && typeof (raw as any).toDate === 'function') {
    try { const d = (raw as any).toDate(); return isNaN(d.getTime()) ? null : d; } catch { return null; }
  }
  if (typeof raw === 'object' && 'seconds' in raw && typeof (raw as any).seconds === 'number') {
    const d = new Date((raw as any).seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function safeDateStr(d: Date | null): string {
  if (!d) return 'upcoming';
  // Use local date components (not UTC) so that dates near midnight don't
  // shift to the wrong calendar day when concatenated with a local startTime.
  return toISODate(d);
}

function resolveEventDate(data: Record<string, unknown>): Date | null {
  return safeDate(data.date) ?? safeDate(data.eventDate) ?? safeDate(data.scheduledDate) ?? safeDate(data.startDate) ?? null;
}

function isEventRelevant(eventDate: Date | null): boolean {
  if (!eventDate) return true;
  // Only load events from today onward; this aligns with the UI "today" filter
  // and prevents yesterday's past events from appearing in the sessions list.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate >= today;
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Compute the NEXT occurrence of a recurring schedule slot.
 * If today's slot time hasn't passed yet, returns today.
 */
function getNextSlotOccurrence(slot: { dayOfWeek: number; time: string }): { date: string; time: string } {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let daysAhead = slot.dayOfWeek - today.getDay();
  if (daysAhead < 0) daysAhead += 7;

  if (daysAhead === 0) {
    const [h, m] = slot.time.split(':').map(Number);
    const slotTime = new Date(today);
    slotTime.setHours(h, m, 0, 0);
    if (now > slotTime) daysAhead = 7;
  }

  const candidate = new Date(today);
  candidate.setDate(candidate.getDate() + daysAhead);
  return { date: toISODate(candidate), time: slot.time };
}

// ── Normalize schedule slots from various Firestore shapes ───────────────

interface RawSlot {
  dayOfWeek: number;
  time: string;
  frequency?: string;
  label?: string;
  location?: { routeId?: string };
}

/**
 * Safely extract schedule slots from a group doc.
 * Handles all known shapes:
 *  - `scheduleSlots: [{...}]`       (canonical)
 *  - `schedule: [{...}, {...}]`      (legacy array)
 *  - `schedule: {...}`               (legacy single object)
 */
function extractSlots(data: Record<string, any>): RawSlot[] {
  if (Array.isArray(data.scheduleSlots) && data.scheduleSlots.length > 0) {
    return data.scheduleSlots;
  }
  if (data.schedule) {
    if (Array.isArray(data.schedule)) return data.schedule;
    if (typeof data.schedule === 'object' && data.schedule.dayOfWeek != null) return [data.schedule];
  }
  return [];
}

// ── Build SessionEnrichment from an event snapshot doc ────────────────────

async function eventDocToEnrichment(
  docSnap: import('firebase/firestore').QueryDocumentSnapshot,
): Promise<{ routeId: string | null; parkId: string | null; enrichment: SessionEnrichment } | null> {
  const data = docSnap.data();
  const routeId: string | null = data.location?.routeId ?? null;
  const parkId: string | null = data.location?.parkId ?? null;

  const eventDate = resolveEventDate(data);
  if (!isEventRelevant(eventDate)) return null;

  const startTime = data.startTime ?? '09:00';
  const dateStr = safeDateStr(eventDate);
  const nextStartTime = dateStr === 'upcoming' ? 'upcoming' : `${dateStr}T${startTime}`;

  let avatars: { uid: string; name: string; photoURL?: string }[] = [];
  try {
    const regSnap = await getDocs(
      query(
        collection(db, 'community_events', docSnap.id, 'registrations'),
        orderBy('joinedAt', 'desc'),
        firestoreLimit(3),
      ),
    );
    avatars = regSnap.docs.map((d) => {
      const r = d.data();
      return { uid: r.uid ?? d.id, name: r.name ?? '', photoURL: r.photoURL ?? undefined };
    });
  } catch { /* non-fatal */ }

  const currentRegistrations = data.currentRegistrations ?? 0;
  const maxParticipants = data.maxParticipants ?? undefined;
  const spotsLeft = maxParticipants != null ? Math.max(0, maxParticipants - currentRegistrations) : undefined;

  return {
    routeId,
    parkId,
    enrichment: {
      eventId: docSnap.id,
      eventLabel: data.name ?? 'אימון קהילתי',
      nextStartTime,
      maxParticipants,
      currentRegistrations,
      spotsLeft,
      plannedCount: currentRegistrations,
      avatars,
    },
  };
}

// ── Build SessionEnrichment list from a community_groups snapshot doc ─────

const GROUP_PROXIMITY_KM = 0.5; // 500m radius for proximity matching

/**
 * Build SessionEnrichment list from a community_groups snapshot doc.
 * Returns an array of {routeId, parkId, enrichments} tuples.
 *
 * Uses two strategies to link groups to routes:
 * 1. Explicit routeId (from meetingLocation or slot-level override)
 * 2. Proximity matching (group meeting point within 500m of a route start)
 */
function groupDocToEnrichments(
  docSnap: import('firebase/firestore').QueryDocumentSnapshot,
  routeStartMap?: Map<string, { lat: number; lng: number }>,
): { routeId: string | null; parkId: string | null; enrichments: SessionEnrichment[] }[] | null {
  const data = docSnap.data();
  if (!data.isActive) return null;

  const groupRouteId: string | null = data.meetingLocation?.routeId ?? null;
  const groupParkId: string | null = data.meetingLocation?.parkId ?? null;
  const groupLoc: { lat: number; lng: number } | null = data.meetingLocation?.location ?? null;

  const slots = extractSlots(data);
  if (!slots.length) {
    console.log('[groupDocToEnrichments] Group has no slots:', docSnap.id, data.name);
    return null;
  }

  const currentParticipants = data.currentParticipants ?? 0;
  const maxParticipants = data.maxParticipants ?? undefined;
  const spotsLeft = maxParticipants != null ? Math.max(0, maxParticipants - currentParticipants) : undefined;

  const results: { routeId: string | null; parkId: string | null; enrichments: SessionEnrichment[] }[] = [];
  const buckets = new Map<string, SessionEnrichment[]>();

  // Proximity match: find the closest route to this group's meeting point
  let proximityRouteId: string | null = null;
  if (!groupRouteId && groupLoc && routeStartMap) {
    let closestDist = Infinity;
    for (const [rId, rStart] of routeStartMap) {
      const dist = haversineKm(groupLoc.lat, groupLoc.lng, rStart.lat, rStart.lng);
      if (dist < GROUP_PROXIMITY_KM && dist < closestDist) {
        closestDist = dist;
        proximityRouteId = rId;
      }
    }
    if (proximityRouteId) {
      console.log(`[groupDocToEnrichments] Proximity match: group "${data.name}" → route ${proximityRouteId} (${(closestDist * 1000).toFixed(0)}m)`);
    }
  }

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const slot = slots[slotIdx];
    const slotRouteId = slot.location?.routeId ?? groupRouteId ?? proximityRouteId;
    const slotParkId = groupParkId;
    if (!slotRouteId && !slotParkId) continue;

    const next = getNextSlotOccurrence(slot);
    const nextDate = new Date(next.date + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const daysFromNow = Math.floor((nextDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysFromNow > 7) continue;

    const enrichment: SessionEnrichment = {
      eventId: `group_${docSnap.id}_${next.date}_${next.time.replace(':', '')}_s${slotIdx}`,
      eventLabel: slot.label ?? data.name ?? 'מפגש קבוצתי',
      nextStartTime: `${next.date}T${next.time}`,
      currentRegistrations: currentParticipants,
      maxParticipants,
      spotsLeft,
      plannedCount: currentParticipants,
      avatars: [],
      isRecurring: true,
      groupId: docSnap.id,
    };

    const key = `${slotRouteId ?? ''}_${slotParkId ?? ''}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(enrichment);
    buckets.set(key, bucket);

    if (bucket.length === 1) {
      results.push({ routeId: slotRouteId, parkId: slotParkId, enrichments: bucket });
    }
  }

  return results.length > 0 ? results : null;
}

// ── Day filter helper (exported for use in UI components) ────────────────

export type DayFilter = 'today' | 'tomorrow' | 'week';

export function matchesDayFilter(nextStartTime: string, filter: DayFilter): boolean {
  if (filter === 'week') return true;
  const d = new Date(nextStartTime);
  if (isNaN(d.getTime())) return true;
  const now = new Date();
  if (filter === 'today') return d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.toDateString() === tomorrow.toDateString();
}

// ═══════════════════════════════════════════════════════════════════════════
//  useCommunityEnrichment — routes
// ═══════════════════════════════════════════════════════════════════════════

export function useCommunityEnrichment(routeIds: string[], routes?: Route[]) {
  const [eventMap, setEventMap] = useState<Map<string, SessionEnrichment>>(new Map());
  const [eventAllMap, setEventAllMap] = useState<Map<string, SessionEnrichment[]>>(new Map());
  const [groupAllMap, setGroupAllMap] = useState<Map<string, SessionEnrichment[]>>(new Map());

  const unsubEventsRef = useRef<Unsubscribe | null>(null);
  const unsubGroupsRef = useRef<Unsubscribe | null>(null);
  const prevIdsRef = useRef<string>('');

  // Build route start-point map for proximity matching
  const routeStartMap = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    if (!routes) return map;
    for (const route of routes) {
      if (route.path?.length) {
        const [lng, lat] = route.path[0];
        if (lat != null && lng != null) map.set(route.id, { lat, lng });
      }
    }
    return map;
  }, [routes]);

  useEffect(() => {
    const idsKey = [...routeIds].sort().join(',');
    if (idsKey === prevIdsRef.current) return;
    prevIdsRef.current = idsKey;

    if (unsubEventsRef.current) { unsubEventsRef.current(); unsubEventsRef.current = null; }
    if (unsubGroupsRef.current) { unsubGroupsRef.current(); unsubGroupsRef.current = null; }

    if (routeIds.length === 0) {
      setEventMap(new Map());
      setEventAllMap(new Map());
      setGroupAllMap(new Map());
      return;
    }

    const capped = routeIds.slice(0, 30);

    console.log('[useCommunityEnrichment] Subscribing for route IDs:', capped);

    // ── Real events subscription ──
    const evQ = query(
      collection(db, 'community_events'),
      where('location.routeId', 'in', capped),
      where('isActive', '==', true),
    );

    const unsubEv = onSnapshot(
      evQ,
      async (snapshot) => {
        const closest = new Map<string, SessionEnrichment>();
        const all = new Map<string, SessionEnrichment[]>();

        for (const docSnap of snapshot.docs) {
          const parsed = await eventDocToEnrichment(docSnap);
          if (!parsed?.routeId) continue;

          const list = all.get(parsed.routeId) ?? [];
          list.push(parsed.enrichment);
          all.set(parsed.routeId, list);

          const prev = closest.get(parsed.routeId);
          if (!prev || parsed.enrichment.nextStartTime < prev.nextStartTime) {
            closest.set(parsed.routeId, parsed.enrichment);
          }
        }

        console.log('[useCommunityEnrichment] Events resolved:', all.size, 'routes with real events');
        setEventMap(closest);
        setEventAllMap(all);
      },
      (err) => console.warn('[useCommunityEnrichment] events error:', err),
    );

    // ── Recurring groups subscription ──
    // Strategy: Query by explicit routeId AND by isActive (catch-all for
    // groups linked by proximity or slot-level routeId).
    // We use TWO queries merged client-side.

    const grpSpecificQ = capped.length > 0
      ? query(
          collection(db, 'community_groups'),
          where('meetingLocation.routeId', 'in', capped),
        )
      : null;

    // Broad catch-all: active groups (capped at 100 to prevent runaway reads)
    const grpBroadQ = query(
      collection(db, 'community_groups'),
      where('isActive', '==', true),
    );

    const seenGroupIds = new Set<string>();
    const processGroupSnapshot = (
      snapshot: import('firebase/firestore').QuerySnapshot,
      startMap: Map<string, { lat: number; lng: number }>,
      routeIdSet: Set<string>,
    ) => {
      const all = new Map<string, SessionEnrichment[]>();

      for (const docSnap of snapshot.docs) {
        if (seenGroupIds.has(docSnap.id)) continue;
        seenGroupIds.add(docSnap.id);

        const results = groupDocToEnrichments(docSnap, startMap);
        if (!results) continue;

        for (const res of results) {
          const rId = res.routeId;
          if (!rId || !routeIdSet.has(rId)) continue;
          const list = all.get(rId) ?? [];
          list.push(...res.enrichments);
          all.set(rId, list);
        }
      }

      return all;
    };

    const routeIdSet = new Set(capped);
    let mergedGroupMap = new Map<string, SessionEnrichment[]>();

    // Subscribe to the broad catch-all query
    const unsubGrpBroad = onSnapshot(
      grpBroadQ,
      (snapshot) => {
        seenGroupIds.clear();
        console.log('[useCommunityEnrichment] Broad groups query returned:', snapshot.size, 'groups');

        const broadResults = processGroupSnapshot(snapshot, routeStartMap, routeIdSet);

        // Merge with specific results
        mergedGroupMap = new Map(broadResults);

        console.log('[useCommunityEnrichment] Groups resolved:', mergedGroupMap.size, 'routes with recurring sessions');
        setGroupAllMap(new Map(mergedGroupMap));
      },
      (err) => console.warn('[useCommunityEnrichment] groups broad error:', err),
    );

    // Also subscribe to the specific query for groups that explicitly have routeId
    let unsubGrpSpecific: Unsubscribe | null = null;
    if (grpSpecificQ) {
      unsubGrpSpecific = onSnapshot(
        grpSpecificQ,
        (snapshot) => {
          if (snapshot.empty) return;
          console.log('[useCommunityEnrichment] Specific groups query returned:', snapshot.size, 'groups');

          const specificResults = processGroupSnapshot(snapshot, routeStartMap, routeIdSet);

          // Merge into existing
          for (const [key, val] of specificResults) {
            const existing = mergedGroupMap.get(key) ?? [];
            const existingIds = new Set(existing.map(e => e.eventId));
            for (const v of val) {
              if (!existingIds.has(v.eventId)) existing.push(v);
            }
            mergedGroupMap.set(key, existing);
          }

          setGroupAllMap(new Map(mergedGroupMap));
        },
        (err) => console.warn('[useCommunityEnrichment] groups specific error:', err),
      );
    }

    unsubEventsRef.current = unsubEv;
    unsubGroupsRef.current = () => {
      unsubGrpBroad();
      unsubGrpSpecific?.();
    };

    return () => {
      unsubEv();
      unsubGrpBroad();
      unsubGrpSpecific?.();
      unsubEventsRef.current = null;
      unsubGroupsRef.current = null;
    };
  }, [routeIds, routeStartMap]);

  // Merged closest-session map: real events take priority over group-virtual
  const enrichmentMap = useMemo(() => {
    const merged = new Map<string, SessionEnrichment>();

    for (const [routeId, list] of groupAllMap) {
      const closest = list.reduce<SessionEnrichment | null>(
        (best, s) => (!best || s.nextStartTime < best.nextStartTime ? s : best),
        null,
      );
      if (closest) merged.set(routeId, closest);
    }

    for (const [key, val] of eventMap) {
      merged.set(key, val);
    }

    return merged;
  }, [eventMap, groupAllMap]);

  // All sessions per route (events + group-virtual), sorted & deduplicated.
  // If a real event exists for the same date+hour as a virtual/recurring slot,
  // the virtual slot is filtered out to prevent duplication.
  const allSessionsMap = useMemo(() => {
    const merged = new Map<string, SessionEnrichment[]>();

    for (const [key, val] of groupAllMap) {
      merged.set(key, [...val]);
    }
    for (const [key, val] of eventAllMap) {
      const existing = merged.get(key) ?? [];
      existing.push(...val);
      merged.set(key, existing);
    }

    // Deduplicate: real events shadow virtual sessions on the same date+hour
    for (const [key, list] of merged) {
      const realSlotKeys = new Set<string>();
      for (const s of list) {
        if (s.isRecurring) continue;
        const d = new Date(s.nextStartTime);
        if (!isNaN(d.getTime())) {
          realSlotKeys.add(`${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`);
        }
      }

      if (realSlotKeys.size > 0) {
        const deduped = list.filter((s) => {
          if (!s.isRecurring) return true;
          const d = new Date(s.nextStartTime);
          if (isNaN(d.getTime())) return true;
          const slotKey = `${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`;
          return !realSlotKeys.has(slotKey);
        });
        merged.set(key, deduped);
      }
    }

    for (const [, list] of merged) {
      list.sort((a, b) => a.nextStartTime.localeCompare(b.nextStartTime));
    }

    return merged;
  }, [eventAllMap, groupAllMap]);

  const enrichRoutes = useCallback(
    (routeList: Route[]): Route[] => {
      if (enrichmentMap.size === 0) return routeList;
      return routeList.map((route) => {
        const enrichment = enrichmentMap.get(route.id);
        if (!enrichment) return route;
        return { ...route, linkedSessions: enrichment };
      });
    },
    [enrichmentMap],
  );

  return { enrichmentMap, allSessionsMap, enrichRoutes };
}

// ═══════════════════════════════════════════════════════════════════════════
//  useParkEvents — parks
// ═══════════════════════════════════════════════════════════════════════════

export function useParkEvents(parkId: string | null | undefined) {
  const [eventSessions, setEventSessions] = useState<SessionEnrichment[]>([]);
  const [groupSessions, setGroupSessions] = useState<SessionEnrichment[]>([]);
  const [loading, setLoading] = useState(false);
  const unsubEvRef = useRef<Unsubscribe | null>(null);
  const unsubGrpRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    if (unsubEvRef.current) { unsubEvRef.current(); unsubEvRef.current = null; }
    if (unsubGrpRef.current) { unsubGrpRef.current(); unsubGrpRef.current = null; }

    if (!parkId) {
      setEventSessions([]);
      setGroupSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // ── Real events ──
    const evQ = query(
      collection(db, 'community_events'),
      where('location.parkId', '==', parkId),
      where('isActive', '==', true),
    );

    const unsubEv = onSnapshot(
      evQ,
      async (snapshot) => {
        const results: SessionEnrichment[] = [];

        for (const docSnap of snapshot.docs) {
          const parsed = await eventDocToEnrichment(docSnap);
          if (parsed) results.push(parsed.enrichment);
        }

        results.sort((a, b) => a.nextStartTime.localeCompare(b.nextStartTime));
        setEventSessions(results);
        setLoading(false);
      },
      (err) => {
        console.warn('[useParkEvents] events error:', err);
        setLoading(false);
      },
    );

    // ── Recurring groups ──
    const grpQ = query(
      collection(db, 'community_groups'),
      where('meetingLocation.parkId', '==', parkId),
    );

    const unsubGrp = onSnapshot(
      grpQ,
      (snapshot) => {
        const results: SessionEnrichment[] = [];

        for (const docSnap of snapshot.docs) {
          const parsedArr = groupDocToEnrichments(docSnap);
          if (!parsedArr) continue;
          for (const parsed of parsedArr) {
            results.push(...parsed.enrichments);
          }
        }

        results.sort((a, b) => a.nextStartTime.localeCompare(b.nextStartTime));
        console.log('[useParkEvents] Groups resolved:', results.length, 'recurring sessions for park', parkId);
        setGroupSessions(results);
      },
      (err) => console.warn('[useParkEvents] groups error:', err),
    );

    unsubEvRef.current = unsubEv;
    unsubGrpRef.current = unsubGrp;

    return () => {
      unsubEv();
      unsubGrp();
      unsubEvRef.current = null;
      unsubGrpRef.current = null;
    };
  }, [parkId]);

  const events = useMemo(() => {
    const merged = [...eventSessions, ...groupSessions];

    const realSlotKeys = new Set<string>();
    const realGroupIds = new Set<string>();
    for (const s of merged) {
      if (s.isRecurring) continue;
      const d = new Date(s.nextStartTime);
      if (!isNaN(d.getTime())) {
        realSlotKeys.add(`${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`);
      }
      if (s.groupId) realGroupIds.add(s.groupId);
    }

    const deduped = (realSlotKeys.size > 0 || realGroupIds.size > 0)
      ? merged.filter((s) => {
          if (!s.isRecurring) return true;
          if (s.groupId && realGroupIds.has(s.groupId)) {
            const d = new Date(s.nextStartTime);
            if (!isNaN(d.getTime())) {
              const key = `${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`;
              if (realSlotKeys.has(key)) return false;
            }
          }
          const d = new Date(s.nextStartTime);
          if (isNaN(d.getTime())) return true;
          return !realSlotKeys.has(`${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`);
        })
      : merged;

    deduped.sort((a, b) => a.nextStartTime.localeCompare(b.nextStartTime));
    return deduped;
  }, [eventSessions, groupSessions]);

  return { events, loading };
}
