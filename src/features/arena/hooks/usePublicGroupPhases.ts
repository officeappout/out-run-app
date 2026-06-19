'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CommunityGroup, SessionAttendance, ScheduleSlot } from '@/types/community.types';
import { computePhase } from '@/features/arena/hooks/useCommunitySessionBanner';

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTodaySlot(group: CommunityGroup, dow: number): ScheduleSlot | null {
  const slots = group.scheduleSlots?.length
    ? group.scheduleSlots
    : group.schedule ? [group.schedule] : [];
  return slots.find((s) => s.dayOfWeek === dow) ?? null;
}

type BadgePhase = 'approaching' | 'lobby' | 'active';

/**
 * Computes live session phases for any list of groups — no membership required.
 *
 * Strategy:
 *  - approaching / lobby: pure client-side from scheduleSlots, zero Firestore reads.
 *  - active: subscribes to the attendance doc only for groups within the active
 *    window (0–durationMinutes past start), typically 0–3 groups at any moment.
 *
 * A 60 s tick keeps phases current without Firestore polling.
 */
export function usePublicGroupPhases(
  groups: CommunityGroup[],
): Record<string, BadgePhase> {
  const [tick, setTick] = useState(0);
  const [activeAttendance, setActiveAttendance] =
    useState<Record<string, SessionAttendance | null>>({});
  const unsubsRef = useRef<Record<string, () => void>>({});

  // Stable key — only changes when the set of group IDs changes.
  const groupIdsKey = useMemo(() => groups.map((g) => g.id).join(','), [groups]);

  // 60 s tick → forces phase recomputation + subscription re-evaluation.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Manage subscriptions: subscribe to active-window groups, unsub the rest.
  useEffect(() => {
    const now      = new Date();
    const todayISO = toISODate(now);
    const dow      = now.getDay();
    const nowMs    = now.getTime();

    const activeIds = new Set<string>();
    for (const g of groups) {
      const slot = getTodaySlot(g, dow);
      if (!slot) continue;
      const startMs = new Date(`${todayISO}T${slot.time}:00`).getTime();
      const dur     = slot.durationMinutes ?? 60;
      const mins    = (startMs - nowMs) / 60_000;
      if (mins <= 0 && mins > -dur) activeIds.add(g.id);
    }

    // Unsub groups that left the active window or are no longer in the list.
    for (const [gid, unsub] of Object.entries(unsubsRef.current)) {
      if (!activeIds.has(gid)) {
        unsub();
        delete unsubsRef.current[gid];
        setActiveAttendance((prev) => {
          if (!(gid in prev)) return prev;
          const next = { ...prev };
          delete next[gid];
          return next;
        });
      }
    }

    // Subscribe to newly active groups.
    for (const g of groups) {
      if (!activeIds.has(g.id) || unsubsRef.current[g.id]) continue;
      const slot  = getTodaySlot(g, dow)!;
      const docId = `${todayISO}_${slot.time.replace(':', '-')}`;
      const ref   = doc(db, `community_groups/${g.id}/attendance/${docId}`);
      const unsub = onSnapshot(ref, (snap) => {
        setActiveAttendance((prev) => ({
          ...prev,
          [g.id]: snap.exists() ? (snap.data() as SessionAttendance) : null,
        }));
      });
      unsubsRef.current[g.id] = unsub;
    }
    // groupIdsKey detects new groups; tick re-runs every 60 s to catch window changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, groupIdsKey]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => { Object.values(unsubsRef.current).forEach((u) => u()); };
  }, []);

  // Compute phases synchronously — tick forces periodic re-render.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void tick;

  const result: Record<string, BadgePhase> = {};
  const now      = new Date();
  const todayISO = toISODate(now);
  const dow      = now.getDay();
  const nowMs    = now.getTime();

  for (const g of groups) {
    const slot = getTodaySlot(g, dow);
    if (!slot) continue;
    const startMs = new Date(`${todayISO}T${slot.time}:00`).getTime();
    const dur     = slot.durationMinutes ?? 60;
    const mins    = (startMs - nowMs) / 60_000;

    if (mins > 60 || mins < -dur) continue;

    const phase = computePhase(mins, activeAttendance[g.id] ?? undefined, dur);
    if (phase === 'approaching' || phase === 'lobby' || phase === 'active') {
      result[g.id] = phase;
    }
  }

  return result;
}
