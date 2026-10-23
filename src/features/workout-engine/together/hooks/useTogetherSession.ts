'use client';

import { useMemo, useState } from 'react';
import { useUserStore } from '@/features/user';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { usePresence } from './usePresence';
import { usePublishPresence } from './usePublishPresence';
import { useTogetherLayerV1 } from './useTogetherLayerV1';
import { addCheer, mergeCheers } from '../core/cheers';
import type { StatusInput } from '../services/presence-publisher';
import type { TogetherKind, TogetherState } from '../core/types';

export interface TogetherLiveStatus {
  kind: TogetherKind;
  state: TogetherState;
  distanceKm?: number;
  paceSecPerKm?: number;
  avgPaceSecPerKm?: number;
  elapsedSec?: number;
  elevGainM?: number;
  set?: number;
  totalSets?: number;
  round?: number;
  roundsDone?: number;
  minute?: number;
  totalReps?: number;
}

/**
 * The whole together state a player needs, in one hook: publish my status,
 * subscribe to the others (ordered), the rail selection (= duel opponent),
 * cheers. `on` is false (and nothing is subscribed or written) unless
 * enable_together_layer_v1 is on AND the player is inside a together session.
 */
export function useTogetherSession(live: TogetherLiveStatus, enabled = true) {
  const flagOn = useTogetherLayerV1();
  const { groupId, attendanceId } = useSharedSession();
  const profile = useUserStore((s) => s.profile) as any;
  const uid = profile?.id as string | undefined;
  const ref = enabled && flagOn && groupId && attendanceId ? { groupId, attendanceId } : null;

  const [selected, setSelected] = useState<string | null>(null);
  const [localCheers, setLocalCheers] = useState<Record<string, number>>({});
  const presence = usePresence(ref, uid);
  const myRemote = presence.participants.find((p) => p.isMe)?.cheersSent;
  const cheersSent = useMemo(() => mergeCheers(localCheers, myRemote), [localCheers, myRemote]);
  const cheer = (toUid: string) => setLocalCheers((cur) => addCheer(mergeCheers(cur, myRemote), toUid));

  const status: StatusInput | null = ref && uid
    ? {
        uid,
        name: profile?.core?.name ?? '',
        ...(profile?.core?.photoURL ? { photoURL: profile.core.photoURL as string } : {}),
        ...live,
        ...(Object.keys(cheersSent).length ? { cheersSent } : {}),
        ...(selected ? { duelUid: selected } : {}),
      }
    : null;
  usePublishPresence(ref, status);

  const rival = selected ? presence.participants.find((p) => p.uid === selected && !p.isMe) : undefined;
  // Everyone's distance, mine from the live value (the echo arrives seconds later).
  const totalKm = presence.participants.reduce((sum, p) => sum + (p.isMe ? (live.distanceKm ?? 0) : (p.distanceKm ?? 0)), 0);

  return {
    on: !!ref,
    uid,
    myName: (profile?.core?.name as string | undefined) ?? '',
    myPhoto: profile?.core?.photoURL as string | undefined,
    participants: presence.participants,
    events: presence.events,
    ackEvents: presence.ackEvents,
    selected,
    setSelected,
    rival,
    cheer,
    totalKm,
  };
}

export type TogetherSession = ReturnType<typeof useTogetherSession>;
