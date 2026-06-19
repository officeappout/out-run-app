'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CommunityGroup, SessionAttendance } from '@/types/community.types';
import { computePhase } from './useCommunitySessionBanner';
import type { UpcomingSession } from './useCommunitySessionBanner';

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Max minutes before session start to begin subscribing. */
const WINDOW_MINUTES = 60;

/**
 * Fetches live session state for a single group without requiring membership.
 * Used in GroupDetailsDrawer so non-members also see phase-aware banners.
 *
 * @param group  - The group whose today-slot we watch (pass null when drawer is closed)
 * @param active - Only subscribe when true (drawer open + no parent liveSession prop)
 */
export function useGroupLiveSession(
  group: CommunityGroup | null,
  active: boolean,
): UpcomingSession | null {
  const [attendance, setAttendance] = useState<SessionAttendance | null>(null);
  const [tick,       setTick]       = useState(0);
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to the attendance doc when within the session window.
  useEffect(() => {
    // Unsubscribe and clear whenever the group changes or active goes false.
    unsubRef.current?.();
    unsubRef.current = null;
    setAttendance(null);

    if (!active || !group) return;

    const now        = new Date();
    const todayISO   = toISODate(now);
    const todayDow   = now.getDay();
    const allSlots   = group.scheduleSlots?.length
      ? group.scheduleSlots
      : group.schedule ? [group.schedule] : [];
    const todaySlot  = allSlots.find((s) => s.dayOfWeek === todayDow) ?? null;

    if (!todaySlot) return;

    const startMs    = new Date(`${todayISO}T${todaySlot.time}:00`).getTime();
    const durMins    = todaySlot.durationMinutes ?? 60;
    const minsUntil  = (startMs - now.getTime()) / 60_000;

    if (minsUntil < -durMins || minsUntil > WINDOW_MINUTES) return;

    const docId  = `${todayISO}_${todaySlot.time.replace(':', '-')}`;
    const docRef = doc(db, `community_groups/${group.id}/attendance/${docId}`);

    const unsub = onSnapshot(docRef, (snap) => {
      setAttendance(snap.exists() ? (snap.data() as SessionAttendance) : null);
    });
    unsubRef.current = unsub;

    return () => { unsub(); unsubRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, group?.id]);

  // Recompute phase every 60 s.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [active]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => { unsubRef.current?.(); };
  }, []);

  // Derived — runs on every render (tick forces periodic refresh).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void tick;

  if (!active || !group) return null;

  const now       = new Date();
  const todayISO  = toISODate(now);
  const todayDow  = now.getDay();
  const allSlots  = group.scheduleSlots?.length
    ? group.scheduleSlots
    : group.schedule ? [group.schedule] : [];
  const todaySlot = allSlots.find((s) => s.dayOfWeek === todayDow) ?? null;

  if (!todaySlot) return null;

  const startMs   = new Date(`${todayISO}T${todaySlot.time}:00`).getTime();
  const durMins   = todaySlot.durationMinutes ?? 60;
  const minsUntil = (startMs - now.getTime()) / 60_000;
  const phase     = computePhase(minsUntil, attendance ?? undefined, durMins);

  if (phase === 'far' || phase === 'ended') return null;

  return {
    groupId:      group.id,
    groupName:    group.name,
    category:     group.category,
    date:         todayISO,
    time:         todaySlot.time,
    slot:         todaySlot,
    isToday:      true,
    isTomorrow:   false,
    minutesUntil: minsUntil,
    phase,
    attendance:   attendance ?? undefined,
    routeId:      todaySlot.location?.routeId ?? group.meetingLocation?.routeId,
    targetGender: group.targetGender,
  };
}
