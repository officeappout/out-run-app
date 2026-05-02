'use client';

/**
 * usePartnerData — reactive hook for the Partner Hub.
 *
 * Unified data source — listens to:
 *   1. planned_sessions   (today + 48h, non-cancelled, non-ghost)
 *   2. community_events   (active, with registrations)
 *   3. community_groups   (active, recurring → materialized into next-7-day slots)
 *   4. presence/{uid}     (users with an active workout, non-ghost)
 *
 * Filters all streams by a configurable radius from userPos using Haversine.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { haversineKm } from '../services/geoUtils';
import type { ActivityType } from '../types/route.types';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ScheduledPartner {
  id: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  routeId: string;
  activityType: ActivityType;
  level: string;
  startTime: Date;
  distanceKm: number;
  lat: number;
  lng: number;
  /** Source of this entry for dedup & display */
  source?: 'planned' | 'event' | 'group';
  /** Group/event name for display */
  sessionLabel?: string;
  /** Group doc ID for virtual sessions */
  groupId?: string;
}

export interface LivePartner {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  activityStatus: string;
  workoutTitle?: string;
  startedAt: number;
  lemurStage?: number;
  currentStreak?: number;
  /** Hebrew display name of the partner's primary active strength program. */
  programName?: string;
  /** Numeric level inside `programName` (1..maxLevel). */
  programLevel?: number;
  /** Mock pace string (e.g. "5:30") for running/walking partners. */
  mockPace?: string;
  /**
   * Partner's planned run distance in km (3 / 5 / 10). Comes from the
   * presence doc's `targetDistanceKm` field — populated by mock seeders
   * today; will be sourced from real plan/training data later. Powers the
   * run-distance pill in `PartnerOverlay`.
   */
  targetDistanceKm?: number;
  /** Persona id (e.g. 'athlete') for `resolvePersonaImage` avatar fallback. */
  personaId?: string;
  /** Real photo URL when the user uploaded one (preferred over persona avatar). */
  photoURL?: string;
  /**
   * Partner's stored gender (`profile.core.gender`). Powers the gender
   * filter pill in `PartnerOverlay`. Absent for minors — the heartbeat
   * writer (`useWorkoutPresence`) strips gender for `ageGroup === 'minor'`
   * before persisting, so consumers must treat `undefined` as "unknown",
   * not as a filterable value.
   */
  gender?: 'male' | 'female' | 'other';
}

export interface PartnerDataResult {
  scheduled: ScheduledPartner[];
  live: LivePartner[];
  isLoading: boolean;
}

// ─── Slot expansion helpers (mirrors useCommunityEnrichment logic) ──────────

interface RawSlot {
  dayOfWeek: number;
  time: string;
  label?: string;
}

function extractSlots(data: Record<string, any>): RawSlot[] {
  if (Array.isArray(data.scheduleSlots) && data.scheduleSlots.length > 0)
    return data.scheduleSlots;
  if (data.schedule) {
    if (Array.isArray(data.schedule)) return data.schedule;
    if (typeof data.schedule === 'object' && data.schedule.dayOfWeek != null)
      return [data.schedule];
  }
  return [];
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Expand a recurring slot into concrete Date occurrences for the next 7 days.
 */
function expandSlotForWeek(slot: RawSlot): Date[] {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const results: Date[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(today);
    candidate.setDate(candidate.getDate() + offset);
    if (candidate.getDay() !== slot.dayOfWeek) continue;

    const [h, m] = slot.time.split(':').map(Number);
    candidate.setHours(h, m, 0, 0);
    if (candidate < now) continue;
    results.push(candidate);
  }
  return results;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePartnerData(
  userPos: { lat: number; lng: number } | null,
  radiusKm: number,
): PartnerDataResult {
  const [rawScheduled, setRawScheduled] = useState<any[]>([]);
  const [rawEventPartners, setRawEventPartners] = useState<any[]>([]);
  const [rawGroupPartners, setRawGroupPartners] = useState<any[]>([]);
  const [rawLive, setRawLive] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const myMode = usePrivacyStore((s) => s.mode);
  // Read once per render. Firebase Auth state rarely changes within the
  // lifetime of a partner overlay, and downstream filters re-run via the
  // useMemo dependency array whenever this captured value flips between
  // null and a uid (e.g. delayed auth resolution on cold start).
  const currentUid = auth.currentUser?.uid;
  const unsubScheduled = useRef<Unsubscribe | null>(null);
  const unsubEvents = useRef<Unsubscribe | null>(null);
  const unsubGroups = useRef<Unsubscribe | null>(null);
  const unsubLive = useRef<Unsubscribe | null>(null);

  // ── 1. Planned sessions listener ──
  useEffect(() => {
    unsubScheduled.current?.();
    if (myMode === 'ghost') {
      setRawScheduled([]);
      return;
    }

    const now = Timestamp.now();
    const q = query(
      collection(db, 'planned_sessions'),
      where('expiresAt', '>=', now),
      where('status', 'in', ['planned', 'active']),
    );

    unsubScheduled.current = onSnapshot(
      q,
      (snap) => {
        setRawScheduled(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setIsLoading(false);
      },
      () => setIsLoading(false),
    );

    return () => unsubScheduled.current?.();
  }, [myMode]);

  // ── 2. Community events listener ──
  useEffect(() => {
    unsubEvents.current?.();
    if (myMode === 'ghost') {
      setRawEventPartners([]);
      return;
    }

    const q = query(
      collection(db, 'community_events'),
      where('isActive', '==', true),
    );

    unsubEvents.current = onSnapshot(
      q,
      async (snap) => {
        const partners: any[] = [];
        for (const docSnap of snap.docs) {
          const ev = docSnap.data();
          const lat = ev.location?.lat ?? 0;
          const lng = ev.location?.lng ?? 0;
          const eventName = ev.name ?? 'אימון קהילתי';
          const startTime = ev.startTime ?? '09:00';

          let eventDate: Date | null = null;
          const rawDate = ev.date ?? ev.eventDate ?? ev.scheduledDate;
          if (rawDate) {
            if (typeof rawDate === 'object' && 'toDate' in rawDate) {
              try { eventDate = rawDate.toDate(); } catch { /* noop */ }
            } else if (rawDate instanceof Date) {
              eventDate = rawDate;
            } else if (typeof rawDate === 'number') {
              eventDate = new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate);
            } else if (typeof rawDate === 'string') {
              eventDate = new Date(rawDate);
            }
          }
          if (eventDate && isNaN(eventDate.getTime())) eventDate = null;

          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          if (eventDate && eventDate < yesterday) continue;

          const fullStartTime = eventDate
            ? new Date(`${eventDate.toISOString().split('T')[0]}T${startTime}`)
            : new Date();

          try {
            const regSnap = await getDocs(collection(db, 'community_events', docSnap.id, 'registrations'));
            for (const regDoc of regSnap.docs) {
              const r = regDoc.data();
              partners.push({
                id: `event_${docSnap.id}_${regDoc.id}`,
                userId: r.uid ?? regDoc.id,
                displayName: r.name ?? 'משתתף',
                photoURL: r.photoURL ?? null,
                routeId: ev.location?.routeId ?? '',
                activityType: ev.activityType ?? 'running',
                level: 'all',
                startTime: fullStartTime,
                lat,
                lng,
                _source: 'event',
                _sessionLabel: eventName,
              });
            }
          } catch {
            // Registration read failed
          }
        }
        setRawEventPartners(partners);
      },
      () => {},
    );

    return () => unsubEvents.current?.();
  }, [myMode]);

  // ── 3. Community groups listener — materialize recurring slots ──
  useEffect(() => {
    unsubGroups.current?.();
    if (myMode === 'ghost') {
      setRawGroupPartners([]);
      return;
    }

    const q = query(
      collection(db, 'community_groups'),
      where('isActive', '==', true),
    );

    unsubGroups.current = onSnapshot(
      q,
      (snap) => {
        const partners: any[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const slots = extractSlots(data);
          if (!slots.length) continue;

          const lat = data.meetingLocation?.location?.lat ?? data.meetingLocation?.lat ?? 0;
          const lng = data.meetingLocation?.location?.lng ?? data.meetingLocation?.lng ?? 0;
          const groupName = data.name ?? 'מפגש קבוצתי';
          const participantCount = data.currentParticipants ?? 1;

          for (let si = 0; si < slots.length; si++) {
            const slot = slots[si];
            const occurrences = expandSlotForWeek(slot);
            for (let oi = 0; oi < occurrences.length; oi++) {
              const occ = occurrences[oi];
              partners.push({
                id: `group_${docSnap.id}_${toISODate(occ)}_${slot.time.replace(':', '')}_s${si}_o${oi}`,
                userId: `group_${docSnap.id}`,
                displayName: groupName,
                photoURL: data.photoURL ?? null,
                routeId: data.meetingLocation?.routeId ?? '',
                activityType: (data.activityType ?? 'running') as ActivityType,
                level: 'all',
                startTime: occ,
                lat,
                lng,
                _source: 'group',
                _sessionLabel: slot.label ?? groupName,
                _groupId: docSnap.id,
                _participantCount: participantCount,
              });
            }
          }
        }
        setRawGroupPartners(partners);
      },
      () => {},
    );

    return () => unsubGroups.current?.();
  }, [myMode]);

  // ── 4. Live presence listener ──
  useEffect(() => {
    unsubLive.current?.();
    if (myMode === 'ghost') {
      setRawLive([]);
      return;
    }

    // CRITICAL: Firestore rule on /presence/{uid} requires the query to
    // be statically satisfiable. The rule allows cross-user reads only
    // when `resource.data.mode == 'verified_global'` (public) or when the
    // requester is in `connections/{userId}.followers` (squad). A bare
    // `collection(db, 'presence')` query with no filters cannot be proven
    // safe and is rejected with PERMISSION_DENIED — that was the symptom
    // users hit when opening the partner finder.
    //
    // We constrain to the public tier here so the rules engine can match
    // the `mode == 'verified_global'` clause. Followers-only ('squad')
    // partners are intentionally excluded from stranger discovery; they
    // surface via the friends-batch listener in `usePresenceLayer.ts`,
    // which queries `where('uid', 'in', followers)` and falls under the
    // rule's squad branch.
    const q = query(
      collection(db, 'presence'),
      where('mode', '==', 'verified_global'),
    );

    unsubLive.current = onSnapshot(
      q,
      (snap) => {
        setRawLive(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      },
      (err: any) => {
        // Surface PERMISSION_DENIED specifically — silently swallowing
        // (the previous `() => {}` handler) made this exact bug invisible
        // and forced developers to dig through hooks to find why the
        // partner finder was empty. Other errors stay quiet to avoid
        // spamming the console on flaky-network hiccups.
        if (err?.code === 'permission-denied') {
          console.error(
            '[usePartnerData] live presence listener PERMISSION-DENIED. ' +
              'Verify Firestore rules on /presence still permit ' +
              "`mode == 'verified_global'` reads for authenticated users, " +
              'and that App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) is set ' +
              'on this client. Partner finder will be empty until fixed.',
            err,
          );
        }
      },
    );

    return () => unsubLive.current?.();
  }, [myMode]);

  // ── Filter + transform scheduled (planned + events + groups) ──
  const scheduled = useMemo<ScheduledPartner[]>(() => {
    const fromPlanned: ScheduledPartner[] = rawScheduled
      .filter((s) => s.privacyMode !== 'ghost' && s.userId !== currentUid)
      .map((s) => {
        const lat = s.lat ?? 0;
        const lng = s.lng ?? 0;
        const dist = userPos ? haversineKm(userPos.lat, userPos.lng, lat, lng) : 0;
        const startTime = s.startTime?.toDate?.() ?? new Date(s.startTime);
        return {
          id: s.id,
          userId: s.userId ?? '',
          displayName: s.displayName ?? '',
          photoURL: s.photoURL ?? null,
          routeId: s.routeId ?? '',
          activityType: (s.activityType ?? 'running') as ActivityType,
          level: s.level ?? 'beginner',
          startTime,
          distanceKm: dist,
          lat,
          lng,
          source: 'planned' as const,
        };
      });

    const fromEvents: ScheduledPartner[] = rawEventPartners
      .filter((s) => s.userId !== currentUid)
      .map((s) => {
      const lat = s.lat ?? 0;
      const lng = s.lng ?? 0;
      const dist = userPos ? haversineKm(userPos.lat, userPos.lng, lat, lng) : 0;
      const startTime = s.startTime instanceof Date ? s.startTime : new Date(s.startTime);
      return {
        id: s.id,
        userId: s.userId ?? '',
        displayName: s.displayName ?? '',
        photoURL: s.photoURL ?? null,
        routeId: s.routeId ?? '',
        activityType: (s.activityType ?? 'running') as ActivityType,
        level: s.level ?? 'all',
        startTime: isNaN(startTime.getTime()) ? new Date() : startTime,
        distanceKm: dist,
        lat,
        lng,
        source: 'event' as const,
        sessionLabel: s._sessionLabel,
      };
    });

    const fromGroups: ScheduledPartner[] = rawGroupPartners
      // Group entries are virtual slots — `userId` may be a synthetic
      // `'group_<docId>'` string when the slot represents the group itself
      // rather than a specific member. We only exclude when `userId`
      // matches the current uid (i.e. real member slots authored by us).
      .filter((s) => s.userId !== currentUid)
      .map((s) => {
      const lat = s.lat ?? 0;
      const lng = s.lng ?? 0;
      const dist = userPos ? haversineKm(userPos.lat, userPos.lng, lat, lng) : 0;
      return {
        id: s.id,
        userId: s.userId ?? '',
        displayName: s.displayName ?? s._sessionLabel ?? '',
        photoURL: s.photoURL ?? null,
        routeId: s.routeId ?? '',
        activityType: (s.activityType ?? 'running') as ActivityType,
        level: 'all',
        startTime: s.startTime,
        distanceKm: dist,
        lat,
        lng,
        source: 'group' as const,
        sessionLabel: s._sessionLabel,
        groupId: s._groupId,
      };
    });

    // Dedup: if a real event exists at the same date+hour as a group slot, drop the group
    const eventSlotKeys = new Set<string>();
    for (const p of fromEvents) {
      const d = p.startTime;
      if (!isNaN(d.getTime())) {
        eventSlotKeys.add(`${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`);
      }
    }

    const dedupedGroups = eventSlotKeys.size > 0
      ? fromGroups.filter((g) => {
          const d = g.startTime;
          if (isNaN(d.getTime())) return true;
          return !eventSlotKeys.has(`${toISODate(d)}_${String(d.getHours()).padStart(2, '0')}`);
        })
      : fromGroups;

    return [...fromPlanned, ...fromEvents, ...dedupedGroups]
      .filter((s) => !userPos || s.distanceKm <= radiusKm)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [rawScheduled, rawEventPartners, rawGroupPartners, userPos, radiusKm, currentUid]);

  // ── Filter + transform live ──
  const live = useMemo<LivePartner[]>(() => {
    return rawLive
      .filter((p) => p.mode !== 'ghost' && p.activity?.status && p.uid !== currentUid)
      .map((p) => {
        // When userPos is unavailable (mock location not yet set, GPS pending),
        // default distanceKm to 0 so the distance filter does not hide everyone.
        const dist = userPos
          ? haversineKm(userPos.lat, userPos.lng, p.lat ?? 0, p.lng ?? 0)
          : 0;
        return {
          uid: p.uid,
          name: p.name ?? '',
          lat: p.lat ?? 0,
          lng: p.lng ?? 0,
          distanceKm: dist,
          activityStatus: p.activity?.status ?? '',
          workoutTitle: p.activity?.workoutTitle,
          startedAt: p.activity?.startedAt ?? 0,
          lemurStage: p.lemurStage,
          currentStreak: typeof p.currentStreak === 'number' ? p.currentStreak : undefined,
          programName: typeof p.programName === 'string' ? p.programName : undefined,
          programLevel: typeof p.programLevel === 'number' ? p.programLevel : undefined,
          mockPace: typeof p.mockPace === 'string' ? p.mockPace : undefined,
          targetDistanceKm:
            typeof p.targetDistanceKm === 'number' ? p.targetDistanceKm : undefined,
          personaId: typeof p.personaId === 'string' ? p.personaId : undefined,
          photoURL: typeof p.photoURL === 'string' ? p.photoURL : undefined,
          // Type-guard the raw Firestore value: only accept the three known
          // literals. Anything else (legacy data, hand-crafted seeds) collapses
          // to undefined so the gender filter treats the partner as "unknown".
          gender:
            p.gender === 'male' || p.gender === 'female' || p.gender === 'other'
              ? p.gender
              : undefined,
        } satisfies LivePartner;
      })
      .filter((p) => !userPos || p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [rawLive, userPos, radiusKm, currentUid]);

  return { scheduled, live, isLoading };
}
