'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import type { ScheduleSlot, CommunityGroup } from '@/types/community.types';

// ── helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Build the LocalStorage key for a dismissed session. */
function dismissKey(groupId: string, date: string, time: string): string {
  return `dismissed_session_${groupId}_${date}_${time}`;
}

/**
 * Load the set of session keys the user has already dismissed,
 * and drop any that belong to dates before today (auto-cleanup).
 */
function loadDismissed(todayISO: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const dismissed = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('dismissed_session_')) continue;
    // Key format: dismissed_session_{groupId}_{YYYY-MM-DD}_{HH:MM}
    // Extract date segment (second-to-last underscore-delimited chunk).
    const parts = key.split('_');
    // parts: ['dismissed','session',groupId,..., 'YYYY-MM-DD','HH:MM']
    const datePart = parts[parts.length - 2]; // 'YYYY-MM-DD'
    if (datePart < todayISO) {
      // Session date is in the past — safe to remove.
      localStorage.removeItem(key);
    } else {
      dismissed.add(key);
    }
  }
  return dismissed;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface UpcomingSession {
  groupId: string;
  groupName: string;
  category: string;
  date: string;
  time: string;
  slot: ScheduleSlot;
  isToday: boolean;
  isTomorrow: boolean;
  /** Minutes until the session starts (negative = already started). */
  minutesUntil: number;
}

// ── hook ──────────────────────────────────────────────────────────────────────

const WINDOW_MINUTES = 180; // show banner only within 3 hours of session start
const GRACE_MINUTES  = 30;  // keep showing up to 30 min after session starts

/**
 * Returns sessions that start within the next 3 hours, sorted by proximity.
 * Dismissed sessions are persisted to LocalStorage so they survive refreshes.
 * Old dismissals (past dates) are cleaned up automatically.
 */
export function useCommunitySessionBanner() {
  const profile = useUserStore((s) => s.profile);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // ── load dismissed list from LocalStorage once on mount ───────────────────
  useEffect(() => {
    const today = toISODate(new Date());
    setDismissed(loadDismissed(today));
  }, []);

  // ── fetch sessions ─────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    const groupIds = profile?.social?.groupIds;
    if (!groupIds?.length) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      const now      = new Date();
      const nowMs    = now.getTime();
      const today    = toISODate(now);
      const tomorrow = toISODate(new Date(nowMs + 86_400_000));
      const todayDow    = now.getDay();
      const tomorrowDow = (todayDow + 1) % 7;

      const results: UpcomingSession[] = [];

      await Promise.all(
        groupIds.map(async (gid: string) => {
          try {
            const snap = await getDoc(doc(db, 'community_groups', gid));
            if (!snap.exists()) return;
            const data = snap.data() as CommunityGroup;
            const allSlots = data.scheduleSlots?.length
              ? data.scheduleSlots
              : data.schedule ? [data.schedule] : [];

            for (const slot of allSlots) {
              // ── today's sessions ──────────────────────────────────────────
              if (slot.dayOfWeek === todayDow) {
                const sessionMs    = new Date(`${today}T${slot.time}:00`).getTime();
                const minutesUntil = (sessionMs - nowMs) / 60_000;
                // Show only within the [−30, +180] minute window.
                if (minutesUntil >= -GRACE_MINUTES && minutesUntil <= WINDOW_MINUTES) {
                  results.push({
                    groupId: gid,
                    groupName: data.name,
                    category: data.category,
                    date: today,
                    time: slot.time,
                    slot,
                    isToday: true,
                    isTomorrow: false,
                    minutesUntil,
                  });
                }
              }

              // ── tomorrow's sessions — only if within 3 hours from now ─────
              // e.g. a 07:00 session only appears after 04:00 tonight.
              if (slot.dayOfWeek === tomorrowDow) {
                const sessionMs    = new Date(`${tomorrow}T${slot.time}:00`).getTime();
                const minutesUntil = (sessionMs - nowMs) / 60_000;
                if (minutesUntil >= 0 && minutesUntil <= WINDOW_MINUTES) {
                  results.push({
                    groupId: gid,
                    groupName: data.name,
                    category: data.category,
                    date: tomorrow,
                    time: slot.time,
                    slot,
                    isToday: false,
                    isTomorrow: true,
                    minutesUntil,
                  });
                }
              }
            }
          } catch {
            // non-fatal per-group error
          }
        }),
      );

      // Closest session first.
      results.sort((a, b) => a.minutesUntil - b.minutesUntil);

      setSessions(results);
    } catch (err) {
      console.error('[useCommunitySessionBanner] error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.social?.groupIds]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── dismiss a session (persisted to LocalStorage) ─────────────────────────
  const dismiss = useCallback((session: Pick<UpcomingSession, 'groupId' | 'date' | 'time'>) => {
    const key = dismissKey(session.groupId, session.date, session.time);
    try {
      localStorage.setItem(key, 'true');
    } catch {
      // localStorage may be unavailable in some SSR/private-mode scenarios.
    }
    setDismissed((prev) => new Set([...Array.from(prev), key]));
  }, []);

  // ── visible sessions: exclude dismissed ───────────────────────────────────
  const visibleSessions = sessions.filter(
    (s) => !dismissed.has(dismissKey(s.groupId, s.date, s.time)),
  );

  return { sessions: visibleSessions, loading, dismiss, refresh: fetchSessions };
}
