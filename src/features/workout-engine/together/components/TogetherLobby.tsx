'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUserStore } from '@/features/user';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { strengthLevelOf } from '@/features/schedule/recommendation-policy';
import { bookSession } from '@/features/arena/services/booking.service';
import { usePresence } from '../hooks/usePresence';
import { usePublishPresence } from '../hooks/usePublishPresence';
import { useTogetherCountdown } from '../hooks/useTogetherCountdown';
import { useLobbyHostShare } from '../hooks/useLobbyHostShare';
import { buildLobbyRoster } from '../core/lobby-roster';
import { decideTogetherMode } from '../core/level-similarity';
import { sessionDateTimeOf } from '../core/schedule';
import { startTogetherSession } from '../services/start-session';
import type { StatusInput } from '../services/presence-publisher';
import TogetherLobbyPanel from './TogetherLobbyPanel';

interface Props {
  onStartFreeRun: () => void;
  ephemeralActivityType?: 'running' | 'walking';
}

/**
 * enable_together_layer_v1 lobby (replaces the classic overlay's body): publishes
 * my "I'm here" presence, shows who is in, explains the system's choice and
 * runs the host-stamped 3-2-1. At GO everyone enters the run together.
 */
export default function TogetherLobby({ onStartFreeRun, ephemeralActivityType }: Props) {
  const profile = useUserStore((s) => s.profile) as any;
  const uid = profile?.id as string | undefined;
  const { groupId, groupName, attendanceId, attendeeProfiles, togetherStartAtMs, phase } = useSharedSession();
  const kind = ephemeralActivityType ? 'run' : 'strength';
  const ref = groupId && attendanceId ? { groupId, attendanceId } : null;

  const level = useMemo(() => strengthLevelOf(profile?.progression) ?? undefined, [profile?.progression]);
  const usualPace = profile?.running?.paceProfile?.basePace as number | undefined;
  const status: StatusInput | null = uid
    ? {
        uid,
        name: profile?.core?.name ?? '',
        ...(profile?.core?.photoURL ? { photoURL: profile.core.photoURL as string } : {}),
        kind,
        state: 'active',
        ready: true,
        ...(level != null ? { level } : {}),
        ...(usualPace && usualPace > 0 ? { usualPaceSecPerKm: usualPace } : {}),
      }
    : null;
  usePublishPresence(ref, status);

  const { entries, clockOffsetMs } = usePresence(ref, uid);
  const people = useMemo(() => buildLobbyRoster(attendeeProfiles, entries, uid), [attendeeProfiles, entries, uid]);
  const decision = useMemo(
    () => decideTogetherMode(kind, entries.map((e) => ({ level: e.level, paceSecPerKm: e.usualPaceSecPerKm }))),
    [entries, kind],
  );
  const synced = useTogetherCountdown(togetherStartAtMs, clockOffsetMs);
  // Auto-started by the clock (no host stamp): nothing to count to — go straight in.
  const countdown = phase === 'active' && togetherStartAtMs == null ? ({ phase: 'go' } as const) : synced;
  const { isHost, shareUrl } = useLobbyHostShare({ uid, groupId, attendanceId, groupName, ephemeralActivityType });
  const [starting, setStarting] = useState(false);

  // GO: everyone enters at the same server instant (host or not).
  const wentRef = useRef(false);
  useEffect(() => {
    if (countdown.phase === 'go' && !wentRef.current) {
      wentRef.current = true;
      onStartFreeRun();
    }
  }, [countdown.phase, onStartFreeRun]);

  const handleStart = async () => {
    if (!ref || !uid || starting) return;
    setStarting(true);
    try {
      const { date, time } = sessionDateTimeOf(ref.attendanceId);
      // Idempotent — makes sure the attendance doc exists before the admin update.
      await bookSession(ref.groupId, date, time, uid, profile?.core?.name ?? '', profile?.core?.photoURL ?? null);
      await startTogetherSession(ref, { hostUid: uid, clockOffsetMs, mode: decision.mode });
    } catch (err) {
      console.error('[TogetherLobby] start failed:', err);
      setStarting(false);
    }
  };

  const handleShare = () => {
    if (!shareUrl) return;
    const text = groupName ?? '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: text, url: shareUrl }).catch(() => window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, '_blank'));
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, '_blank');
    }
  };

  return (
    <TogetherLobbyPanel
      groupName={groupName ?? ''}
      people={people}
      decision={decision}
      countdown={countdown}
      isHost={isHost}
      starting={starting}
      shareReady={!!shareUrl}
      onStart={handleStart}
      onShare={handleShare}
    />
  );
}
