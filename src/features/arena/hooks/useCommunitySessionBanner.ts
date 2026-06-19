'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import type {
  ScheduleSlot,
  CommunityGroup,
  SessionAttendance,
  LiveSessionPhase,
  TargetGender,
} from '@/types/community.types';

// ── helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sessionKey(groupId: string, date: string, time: string): string {
  return `${groupId}_${date}_${time.replace(':', '-')}`;
}

function attendanceDocId(date: string, time: string): string {
  return `${date}_${time.replace(':', '-')}`;
}

function dismissKey(groupId: string, date: string, time: string): string {
  return `dismissed_session_${groupId}_${date}_${time}`;
}

function loadDismissed(todayISO: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const dismissed = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('dismissed_session_')) continue;
    const parts = key.split('_');
    const datePart = parts[parts.length - 2]; // 'YYYY-MM-DD'
    if (datePart < todayISO) {
      localStorage.removeItem(key);
    } else {
      dismissed.add(key);
    }
  }
  return dismissed;
}

// ── phase computation ─────────────────────────────────────────────────────────

/**
 * Derives the current phase from timing + any Firestore override written by the leader.
 * Only 'active' and 'ended' are stored in Firestore; all earlier phases are computed.
 *
 * @param durationMinutes - slot.durationMinutes (required; caller supplies fallback 60)
 */
export function computePhase(
  minutesUntil: number,
  attendance: SessionAttendance | undefined,
  durationMinutes: number,
): LiveSessionPhase {
  if (attendance?.sessionPhase === 'ended') return 'ended';
  if (attendance?.sessionPhase === 'active') return 'active';

  // Auto-ended: leader hasn't ended it yet but the session duration has elapsed.
  if (minutesUntil <= -durationMinutes) return 'ended';

  // Auto-start threshold: +10 min after scheduled start, unless lobby was extended.
  const extendedMs = attendance?.lobbyExtendedUntil?.toMillis?.();
  const autoStartAt = extendedMs
    ? (extendedMs - Date.now()) / 60_000
    : -10;

  if (minutesUntil <= autoStartAt) return 'active';

  if (minutesUntil <= 15) return 'lobby';
  if (minutesUntil <= 60) return 'approaching';
  return 'far';
}

// ── types ─────────────────────────────────────────────────────────────────────

/** Internal record — keeps sessionStartMs for cheap phase recomputation */
interface RawSession {
  groupId: string;
  groupName: string;
  category: string;
  date: string;
  time: string;
  slot: ScheduleSlot;
  isToday: boolean;
  isTomorrow: boolean;
  sessionStartMs: number;
  durationMinutes: number;
  routeId?: string;
  targetGender?: TargetGender;
}

export interface UpcomingSession {
  groupId: string;
  groupName: string;
  category: string;
  date: string;
  time: string;
  slot: ScheduleSlot;
  isToday: boolean;
  isTomorrow: boolean;
  /** Minutes until session starts (negative = already started). Recomputed every 60 s. */
  minutesUntil: number;
  /** Current phase — derived from timing + Firestore override. */
  phase: LiveSessionPhase;
  /** Live attendance data; subscribed when phase reaches lobby or later. */
  attendance?: SessionAttendance;
  /** Route linked to this slot, if any. */
  routeId?: string;
  /** Group's intended audience — used for gender-aware copy in the banner. */
  targetGender?: TargetGender;
}

// ── constants ─────────────────────────────────────────────────────────────────

const WINDOW_MINUTES    = 180;  // show banner within 3 h of start
const LOBBY_SUB_MINUTES = 15;   // subscribe to Firestore when ≤ 15 min away
const UNSUB_MINUTES     = -120; // unsubscribe when session started > 2 h ago (cleanup bound)

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns sessions within the next 3 hours, sorted by proximity.
 * Each session includes a live `phase` (recomputed every 60 s) and
 * real-time `attendance` data once the session enters the lobby window.
 */
export function useCommunitySessionBanner() {
  const profile = useUserStore((s) => s.profile);

  const [rawSessions,   setRawSessions]   = useState<RawSession[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, SessionAttendance>>({});
  const [tick,          setTick]          = useState(0); // incremented by interval → triggers re-render
  const [loading,       setLoading]       = useState(true);
  const [dismissed,     setDismissed]     = useState<Set<string>>(new Set());

  // Refs for stable reads inside the 60 s interval (avoids stale closures)
  const rawSessionsRef   = useRef<RawSession[]>([]);
  const attendanceMapRef = useRef<Record<string, SessionAttendance>>({});
  const autoStartedRef   = useRef<Set<string>>(new Set());
  const unsubsRef        = useRef<Map<string, () => void>>(new Map());

  useEffect(() => { rawSessionsRef.current = rawSessions;   }, [rawSessions]);
  useEffect(() => { attendanceMapRef.current = attendanceMap; }, [attendanceMap]);

  // ── dismissed list ────────────────────────────────────────────────────────
  useEffect(() => {
    const today = toISODate(new Date());
    setDismissed(loadDismissed(today));
  }, []);

  // ── fetch sessions from Firestore ─────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    const groupIds = profile?.social?.groupIds;
    if (!groupIds?.length) {
      setRawSessions([]);
      setLoading(false);
      return;
    }
    try {
      const now         = new Date();
      const nowMs       = now.getTime();
      const today       = toISODate(now);
      const tomorrow    = toISODate(new Date(nowMs + 86_400_000));
      const todayDow    = now.getDay();
      const tomorrowDow = (todayDow + 1) % 7;
      const results: RawSession[] = [];

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
              const routeId = slot.location?.routeId ?? data.meetingLocation?.routeId;

              const slotDuration = slot.durationMinutes ?? 60;

              if (slot.dayOfWeek === todayDow) {
                const sessionStartMs = new Date(`${today}T${slot.time}:00`).getTime();
                const minutesUntil   = (sessionStartMs - nowMs) / 60_000;
                if (minutesUntil >= -slotDuration && minutesUntil <= WINDOW_MINUTES) {
                  results.push({
                    groupId: gid, groupName: data.name, category: data.category,
                    date: today, time: slot.time, slot, durationMinutes: slotDuration,
                    isToday: true, isTomorrow: false, sessionStartMs, routeId,
                    targetGender: data.targetGender,
                  });
                }
              }

              if (slot.dayOfWeek === tomorrowDow) {
                const sessionStartMs = new Date(`${tomorrow}T${slot.time}:00`).getTime();
                const minutesUntil   = (sessionStartMs - nowMs) / 60_000;
                if (minutesUntil >= 0 && minutesUntil <= WINDOW_MINUTES) {
                  results.push({
                    groupId: gid, groupName: data.name, category: data.category,
                    date: tomorrow, time: slot.time, slot, durationMinutes: slotDuration,
                    isToday: false, isTomorrow: true, sessionStartMs, routeId,
                    targetGender: data.targetGender,
                  });
                }
              }
            }
          } catch {
            // non-fatal per-group error
          }
        }),
      );

      results.sort((a, b) => a.sessionStartMs - b.sessionStartMs);
      setRawSessions(results);
    } catch (err) {
      console.error('[useCommunitySessionBanner] error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.social?.groupIds]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Firestore onSnapshot — subscribe when entering lobby ──────────────────
  useEffect(() => {
    const nowMs = Date.now();

    rawSessions.forEach(raw => {
      const minutesUntil = (raw.sessionStartMs - nowMs) / 60_000;
      const key = sessionKey(raw.groupId, raw.date, raw.time);

      if (minutesUntil <= LOBBY_SUB_MINUTES && minutesUntil > UNSUB_MINUTES) {
        if (unsubsRef.current.has(key)) return;
        const docRef = doc(
          db,
          `community_groups/${raw.groupId}/attendance/${attendanceDocId(raw.date, raw.time)}`,
        );
        const unsub = onSnapshot(docRef, (snap) => {
          if (!snap.exists()) return;
          setAttendanceMap(prev => ({ ...prev, [key]: snap.data() as SessionAttendance }));
        });
        unsubsRef.current.set(key, unsub);
      }
    });

    // Drop subscriptions for sessions no longer in the fetch window
    const activeKeys = new Set(rawSessions.map(r => sessionKey(r.groupId, r.date, r.time)));
    for (const [key, unsub] of Array.from(unsubsRef.current.entries())) {
      if (!activeKeys.has(key)) { unsub(); unsubsRef.current.delete(key); }
    }
  }, [rawSessions]);

  // ── 60 s interval: recompute phases + trigger auto-start fallback ─────────
  useEffect(() => {
    const id = setInterval(() => {
      const nowMs = Date.now();

      rawSessionsRef.current.forEach(raw => {
        const minutesUntil = (raw.sessionStartMs - nowMs) / 60_000;
        const key          = sessionKey(raw.groupId, raw.date, raw.time);
        const attendance   = attendanceMapRef.current[key];
        const phase        = computePhase(minutesUntil, attendance, raw.durationMinutes);

        // Subscribe to sessions that just crossed into lobby range
        if (minutesUntil <= LOBBY_SUB_MINUTES && minutesUntil > UNSUB_MINUTES
            && !unsubsRef.current.has(key)) {
          const docRef = doc(
            db,
            `community_groups/${raw.groupId}/attendance/${attendanceDocId(raw.date, raw.time)}`,
          );
          const unsub = onSnapshot(docRef, (snap) => {
            if (!snap.exists()) return;
            setAttendanceMap(prev => ({ ...prev, [key]: snap.data() as SessionAttendance }));
          });
          unsubsRef.current.set(key, unsub);
        }

        // Unsubscribe long-past sessions
        if (minutesUntil <= UNSUB_MINUTES) {
          const unsub = unsubsRef.current.get(key);
          if (unsub) { unsub(); unsubsRef.current.delete(key); }
        }

        // Auto-start: attempt once per session.
        // Will silently fail with permission-denied for non-leaders (expected).
        // TODO: replace with a Cloud Function trigger so non-leader devices also auto-start.
        if (phase === 'active' && !attendance?.sessionPhase && !autoStartedRef.current.has(key)) {
          autoStartedRef.current.add(key);
          import('@/features/arena/services/session-phase.service').then(({ setSessionPhase }) => {
            setSessionPhase(raw.groupId, raw.date, raw.time, 'active', 'auto').catch(err => {
              if ((err as { code?: string })?.code !== 'permission-denied') console.error(err);
            });
          });
        }
      });

      setTick(t => t + 1);
    }, 60_000);

    return () => clearInterval(id);
  }, []); // intentionally stable — reads via refs

  // ── cleanup all subscriptions on unmount ──────────────────────────────────
  useEffect(() => {
    return () => {
      unsubsRef.current.forEach(unsub => unsub());
      unsubsRef.current.clear();
    };
  }, []);

  // ── dismiss ───────────────────────────────────────────────────────────────
  const dismiss = useCallback((session: Pick<UpcomingSession, 'groupId' | 'date' | 'time'>) => {
    const key = dismissKey(session.groupId, session.date, session.time);
    try { localStorage.setItem(key, 'true'); } catch { /* unavailable */ }
    setDismissed(prev => new Set([...Array.from(prev), key]));
  }, []);

  // ── derived sessions (phase + attendance merged) ───────────────────────────
  const sessions = useMemo<UpcomingSession[]>(() => {
    const nowMs = Date.now();
    return rawSessions
      .map((raw): UpcomingSession => {
        const minutesUntil = (raw.sessionStartMs - nowMs) / 60_000;
        const key          = sessionKey(raw.groupId, raw.date, raw.time);
        const attendance   = attendanceMap[key];
        const phase        = computePhase(minutesUntil, attendance, raw.durationMinutes);
        return {
          groupId: raw.groupId, groupName: raw.groupName, category: raw.category,
          date: raw.date, time: raw.time, slot: raw.slot,
          isToday: raw.isToday, isTomorrow: raw.isTomorrow,
          minutesUntil, phase, attendance, routeId: raw.routeId,
          targetGender: raw.targetGender,
        };
      })
      .filter(s => {
        if (s.phase !== 'ended') return true;
        // Show ended sessions for 30 min after they finish, then remove
        const slotDur = s.slot.durationMinutes ?? 60;
        const endedAt =
          s.attendance?.sessionPhaseUpdatedAt?.toMillis?.()
          ?? (new Date(`${s.date}T${s.time}:00`).getTime() + slotDur * 60_000);
        return (nowMs - endedAt) < 30 * 60_000;
      });
  // tick is a dep so the memo re-runs every 60 s even when rawSessions/attendanceMap are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSessions, attendanceMap, tick]);

  const visibleSessions = sessions.filter(
    s => !dismissed.has(dismissKey(s.groupId, s.date, s.time)),
  );

  return { sessions: visibleSessions, loading, dismiss, refresh: fetchSessions };
}
