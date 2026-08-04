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
  limit,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { haversineKm } from '../services/geoUtils';
import type { ActivityType } from '../types/route.types';
import { useIsForeground } from '@/lib/appForeground';
import { IS_PERF_BATCH2_PRESENCE_ENABLED } from '@/config/feature-flags';
import { usePresenceStore, acquirePresenceStream, PRESENCE_STREAM_MAX } from '../store/usePresenceStore';

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
  /**
   * End of the announced arrival window — sourced from the
   * `endTime` field on `planned_sessions`. Optional because event /
   * group entries don't have an end time (they fire at a single
   * scheduled hour). The card uses this to render
   * "17:00 - 19:00" instead of just "17:00".
   */
  endTime?: Date;
  distanceKm: number;
  lat: number;
  lng: number;
  /**
   * Park id when the planned session was published from
   * ParkDetailSheet (`parkId` is set on the doc, `routeId` is empty).
   * Lets the card branch on "park arrival" vs "route arrival" without
   * having to inspect which of `routeId`/`parkId` is non-empty.
   */
  parkId?: string;
  /** Denormalised park name (for park arrivals). */
  parkName?: string;
  /** Denormalised route name (for route arrivals). */
  routeName?: string;
  /** Active program name captured at publish time (parity with `LivePartner`). */
  programName?: string;
  /** Active program level captured at publish time. */
  programLevel?: number;
  /**
   * Source of this entry for dedup & display.
   *   - 'planned'    → other users' planned_sessions (the bulk of the
   *                    "מי מתכנן" tab)
   *   - 'event'      → per-person registrations on `community_events`
   *   - 'group'      → recurring `community_groups` materialized into
   *                    next-7-day occurrences
   *   - 'ownArrival' → the CURRENT user's own planned_sessions. Bypasses
   *                    the `userId !== currentUid` filter so the user
   *                    can see their own announcement in the partner
   *                    finder ("did my publish actually save?"). The
   *                    UI tags these with a "הגעה שלי" badge.
   */
  source?: 'planned' | 'event' | 'group' | 'ownArrival';
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
  /**
   * Program template slug (e.g. `'upper_body'`) — the canonical ID for
   * the partner-finder program filter. Written by `useWorkoutPresence`
   * as `activeProgram.templateId`; compared directly against
   * `selectedProgram` in `PartnerOverlay.filteredLive` so the comparison
   * is slug-to-slug, not slug-to-Hebrew-label.
   */
  programId?: string;
  /**
   * Age bracket derived from `profile.core.birthDate` at heartbeat time.
   * Only two possible values — 'minor' (< 18) or 'adult' (≥ 18) — so
   * the age-range filter can only exclude minors when the lower bound
   * is ≥ 18. Within the adult bracket ages are not broadcast (privacy).
   */
  ageGroup?: 'minor' | 'adult';
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
  /**
   * Group session id when the partner is currently training in a shared
   * group session — same field `useGroupPresence` consumes for shared
   * map-marker rendering. Powers the יחיד / קבוצה pill on the live tab:
   *   • absent / empty string → solo partner
   *   • non-empty string      → group partner (we don't need the actual
   *     session id here, just the boolean signal "is this user in a
   *     group session right now").
   * Stays `undefined` for partners without an active group session, NOT
   * `null` or empty-string, so the type matches the rest of `LivePartner`.
   */
  groupSessionId?: string;
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
  myGroupIds: string[] = [],
  /**
   * Forces every listener below into the same ghost-mode short-circuit as a
   * real user's privacy setting — no Firestore reads, empty results. Used by
   * /embed/map so anonymous iframe traffic never queries (and never
   * receives) other real users' live presence/session data.
   */
  disabled = false,
): PartnerDataResult {
  const [rawScheduled, setRawScheduled] = useState<any[]>([]);
  const [rawEventPartners, setRawEventPartners] = useState<any[]>([]);
  const [rawGroupPartners, setRawGroupPartners] = useState<any[]>([]);
  const [rawLive, setRawLive] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const privacyMode = usePrivacyStore((s) => s.mode);
  const myMode = disabled ? 'ghost' : privacyMode;
  // Battery guard (perf/batch1): when the app is backgrounded, all four
  // partner-finder listeners below tear down and stop re-subscribing until the
  // app returns to the foreground. When IS_PERF_BATCH1_ENABLED is off,
  // useIsForeground() stays permanently true and every listener behaves as
  // before. Added to each listener effect's dependency array so the flip
  // between foreground/background re-runs the effect (unsub → resubscribe).
  const isForeground = useIsForeground();
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
    if (!isForeground) return; // backgrounded — torn down above, no resubscribe
    if (myMode === 'ghost') {
      setRawScheduled([]);
      // Ghost mode short-circuits every listener, so the snapshot callbacks
      // that normally flip isLoading off never fire. Resolve loading here or
      // the partner finder hangs on its spinner forever in ghost mode.
      setIsLoading(false);
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
  }, [myMode, isForeground]);

  // ── 2. Community events listener ──
  useEffect(() => {
    unsubEvents.current?.();
    if (!isForeground) return; // backgrounded — torn down above, no resubscribe
    if (myMode === 'ghost') {
      setRawEventPartners([]);
      setIsLoading(false);
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
  }, [myMode, isForeground]);

  // ── 3. Community groups listener — materialize recurring slots ──
  // Hybrid visibility: public groups are visible to everyone; private groups
  // (isPublic === false) are only materialized for members of that group.
  // This is equivalent to two parallel Firestore queries merged client-side:
  //   Query A: where('isActive','==',true) + where('isPublic','==',true)
  //   Query B: where('isActive','==',true) + where('isPublic','==',false)
  //            + client filter: group.id ∈ myGroupIds
  // Using a single isActive listener + client visibility gate avoids the
  // composite-index cost and handles legacy docs where isPublic is unset
  // (treated as public, same as isPublic === true).
  useEffect(() => {
    unsubGroups.current?.();
    if (!isForeground) return; // backgrounded — torn down above, no resubscribe
    if (myMode === 'ghost') {
      setRawGroupPartners([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'community_groups'),
      where('isActive', '==', true),
    );

    // Capture a stable snapshot of myGroupIds for use inside the closure.
    // Storing as a Set avoids O(n) includes() on every doc.
    const memberSet = new Set(myGroupIds);

    unsubGroups.current = onSnapshot(
      q,
      (snap) => {
        const partners: any[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data();

          // ── Hybrid visibility gate ────────────────────────────────────────
          // Groups without isPublic field (legacy) default to visible.
          const isPrivate = data.isPublic === false;
          if (isPrivate && !memberSet.has(docSnap.id)) continue;
          // ─────────────────────────────────────────────────────────────────

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myMode, myGroupIds.join(','), isForeground]);
  // Note: myGroupIds.join(',') is a stable string dep — avoids a new listener
  // on every render while still re-subscribing when the set of groups changes.

  // ── 4. Live presence listener ──
  useEffect(() => {
    unsubLive.current?.();
    if (!isForeground) return; // backgrounded — torn down above, no resubscribe
    if (myMode === 'ghost') {
      setRawLive([]);
      setIsLoading(false);
      return;
    }

    // ── P4 shared presence stream (perf/batch2, flag-gated) ──────────────────
    // Read the single shared verified_global stream instead of opening a second
    // unbounded listener (useGroupPresence opens the identical query). Same
    // shape → rules-safe; the `live` useMemo below is unchanged. When the flag
    // is off, the original onSnapshot below runs unchanged (byte-identical).
    if (IS_PERF_BATCH2_PRESENCE_ENABLED) {
      const release = acquirePresenceStream();
      setRawLive(usePresenceStore.getState().docs);
      const unsubStore = usePresenceStore.subscribe((s) => setRawLive(s.docs));
      unsubLive.current = () => { unsubStore(); release(); };
      return () => unsubLive.current?.();
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
      limit(PRESENCE_STREAM_MAX),
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
  }, [myMode, isForeground]);

  // ── Filter + transform scheduled (planned + events + groups) ──
  const scheduled = useMemo<ScheduledPartner[]>(() => {
    // Resolve the end-of-window timestamp from a raw Firestore doc.
    // Older docs don't have an `endTime` field — we fall back to
    // `startTime + 1h` so the partner card always renders a valid range
    // ("17:00 - 18:00") instead of jumping back to a single value when
    // the legacy data is mixed with new docs.
    const resolveEndTime = (s: any, startTime: Date): Date => {
      const raw = s.endTime?.toDate?.() ?? (s.endTime ? new Date(s.endTime) : null);
      if (raw && !isNaN(raw.getTime()) && raw.getTime() > startTime.getTime()) {
        return raw;
      }
      return new Date(startTime.getTime() + 60 * 60 * 1000);
    };

    const fromPlanned: ScheduledPartner[] = rawScheduled
      .filter((s) => {
        if (s.privacyMode === 'ghost') return false;
        if (s.userId === currentUid) return false; // own arrivals handled by fromOwnArrival
        // Squad sessions are private-group bookings — only visible to group members.
        if (s.privacyMode === 'squad' && typeof s.groupId === 'string') {
          return myGroupIds.includes(s.groupId);
        }
        return true;
      })
      .map((s) => {
        const lat = s.lat ?? 0;
        const lng = s.lng ?? 0;
        const dist = userPos ? haversineKm(userPos.lat, userPos.lng, lat, lng) : 0;
        const startTime = s.startTime?.toDate?.() ?? new Date(s.startTime);
        const endTime = resolveEndTime(s, startTime);
        return {
          id: s.id,
          userId: s.userId ?? '',
          displayName: s.displayName ?? '',
          photoURL: s.photoURL ?? null,
          routeId: s.routeId ?? '',
          activityType: (s.activityType ?? 'running') as ActivityType,
          level: s.level ?? 'beginner',
          startTime,
          endTime,
          distanceKm: dist,
          lat,
          lng,
          ...(typeof s.parkId === 'string' && s.parkId.length > 0
            ? { parkId: s.parkId }
            : {}),
          ...(typeof s.parkName === 'string' && s.parkName.length > 0
            ? { parkName: s.parkName }
            : {}),
          ...(typeof s.routeName === 'string' && s.routeName.length > 0
            ? { routeName: s.routeName }
            : {}),
          ...(typeof s.programName === 'string' && s.programName.length > 0
            ? { programName: s.programName }
            : {}),
          ...(typeof s.programLevel === 'number'
            ? { programLevel: s.programLevel }
            : {}),
          source: 'planned' as const,
        };
      });

    // The current user's own planned arrivals — surfaced as a separate
    // `ownArrival` source so the partner finder can render them with a
    // distinct "הגעה שלי" badge. We bypass the `userId !== currentUid`
    // filter here intentionally; the user MUST be able to see their
    // own announcement to confirm "did my publish save?" without
    // having to log in as a different account. We do NOT enforce the
    // distance-radius filter on this branch either (see the final
    // concat below) — your own arrival should always show up,
    // regardless of where you happen to be standing.
    const fromOwnArrival: ScheduledPartner[] = currentUid
      ? rawScheduled
          .filter((s) => s.userId === currentUid)
          .map((s) => {
            const lat = s.lat ?? 0;
            const lng = s.lng ?? 0;
            const dist = userPos ? haversineKm(userPos.lat, userPos.lng, lat, lng) : 0;
            const startTime = s.startTime?.toDate?.() ?? new Date(s.startTime);
            const endTime = resolveEndTime(s, startTime);
            return {
              id: s.id,
              userId: s.userId ?? '',
              displayName: s.displayName ?? 'אני',
              photoURL: s.photoURL ?? null,
              routeId: s.routeId ?? '',
              activityType: (s.activityType ?? 'running') as ActivityType,
              level: s.level ?? 'beginner',
              startTime,
              endTime,
              distanceKm: dist,
              lat,
              lng,
              ...(typeof s.parkId === 'string' && s.parkId.length > 0
                ? { parkId: s.parkId }
                : {}),
              ...(typeof s.parkName === 'string' && s.parkName.length > 0
                ? { parkName: s.parkName }
                : {}),
              ...(typeof s.routeName === 'string' && s.routeName.length > 0
                ? { routeName: s.routeName }
                : {}),
              ...(typeof s.programName === 'string' && s.programName.length > 0
                ? { programName: s.programName }
                : {}),
              ...(typeof s.programLevel === 'number'
                ? { programLevel: s.programLevel }
                : {}),
              source: 'ownArrival' as const,
            };
          })
      : [];

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

    // Apply the radius gate to OTHER people's entries only — own
    // arrivals are always visible to the publisher regardless of the
    // selected radius (see `fromOwnArrival` rationale above).
    const distGated = [...fromPlanned, ...fromEvents, ...dedupedGroups].filter(
      (s) => !userPos || s.distanceKm <= radiusKm,
    );

    return [...fromOwnArrival, ...distGated].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
  }, [rawScheduled, rawEventPartners, rawGroupPartners, userPos, radiusKm, currentUid, myGroupIds]);

  // ── Filter + transform live ──
  const live = useMemo<LivePartner[]>(() => {
    return rawLive
      // INTENTIONALLY no `p.activity?.status` requirement here. The map
      // heartbeat in `usePresenceLayer.ts` writes presence WITHOUT an
      // `activity` block for users who just have the map open without a
      // workout running — `activity` is only added later by
      // `useWorkoutPresence`. Requiring it would filter out every idle
      // user, exactly the bug we already fixed in `useGroupPresence`:
      // "map shows N partners, partner finder shows 0". Idle users
      // surface here with `activityStatus: ''`; downstream filters in
      // `PartnerOverlay.filteredLive` (`liveActivityMatches`,
      // `levelRange`, `paceRange`, `genderFilter`) already pass through
      // missing status / pace / level / gender, so empty fields don't
      // accidentally hide them. The activity-pill UI ('הכל' / 'כוח' /
      // 'ריצה' / 'הליכה') still narrows correctly when the user explicitly
      // picks one — `liveActivityMatches('', 'running')` returns true
      // (pass-through), but the bucket-specific narrowers below still
      // run and only act when the value is present.
      .filter((p) => p.mode !== 'ghost' && p.uid !== currentUid)
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
          programId: typeof p.programId === 'string' ? p.programId : undefined,
          ageGroup: p.ageGroup === 'minor' || p.ageGroup === 'adult' ? p.ageGroup : undefined,
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
          // Treat empty strings as "not in a group" — some legacy presence
          // writers persisted `''` instead of omitting the field, and the
          // יחיד filter needs to see those as solo. Anything other than a
          // non-empty string collapses to undefined.
          groupSessionId:
            typeof p.groupSessionId === 'string' && p.groupSessionId.length > 0
              ? p.groupSessionId
              : undefined,
        } satisfies LivePartner;
      })
      .filter((p) => !userPos || p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [rawLive, userPos, radiusKm, currentUid]);

  return { scheduled, live, isLoading };
}
