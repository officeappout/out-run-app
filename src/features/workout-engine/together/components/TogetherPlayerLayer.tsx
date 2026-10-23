'use client';

import { useMemo, useState } from 'react';
import { useUserStore } from '@/features/user';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import PresenceRail from '@/features/workout-engine/players/shared/v2/PresenceRail';
import { usePresence } from '../hooks/usePresence';
import { usePublishPresence } from '../hooks/usePublishPresence';
import { useTogetherLayerV1 } from '../hooks/useTogetherLayerV1';
import { computeRace } from '../core/race';
import type { StatusInput } from '../services/presence-publisher';
import type { TogetherKind, TogetherState } from '../core/types';
import RaceBar from './RaceBar';
import CheerButton from './CheerButton';
import TogetherToasts from './TogetherToasts';
import { addCheer, mergeCheers } from '../core/cheers';

export interface TogetherLiveStatus {
  kind: TogetherKind;
  state: TogetherState;
  distanceKm?: number;
  paceSecPerKm?: number;
  set?: number;
  totalSets?: number;
  round?: number;
  roundsDone?: number;
  minute?: number;
}

export interface TogetherPlayerLayerProps {
  live: TogetherLiveStatus;
  /** Free band for the rail (px from the viewport top / bottom): header and drawer + buttons. */
  topInset: number;
  bottomInset: number;
  /** Renders the race bar through this slot (run / walk / bike place it under the story bars). */
  renderRaceBar?: (bar: React.ReactNode) => React.ReactNode;
}

/**
 * Everything a player needs for the together layer in ONE mount: publishes my
 * status, subscribes to the others, shows the rail and (for runs) the race bar
 * once a face is picked. Renders nothing unless enable_together_layer_v1 is on
 * AND the player is inside a together session (useSharedSession has a ref).
 */
export default function TogetherPlayerLayer(props: TogetherPlayerLayerProps) {
  const on = useTogetherLayerV1();
  const { groupId, attendanceId } = useSharedSession();
  const profile = useUserStore((s) => s.profile) as any;
  const uid = profile?.id as string | undefined;
  const ref = on && groupId && attendanceId ? { groupId, attendanceId } : null;

  const [localCheers, setLocalCheers] = useState<Record<string, number>>({});
  const presence = usePresence(ref, uid);
  const { participants } = presence;
  const myRemote = participants.find((p) => p.isMe)?.cheersSent;
  const cheersSent = useMemo(() => mergeCheers(localCheers, myRemote), [localCheers, myRemote]);
  const cheer = (toUid: string) => setLocalCheers((cur) => addCheer(mergeCheers(cur, myRemote), toUid));

  const status: StatusInput | null = ref && uid
    ? {
        uid,
        name: profile?.core?.name ?? '',
        ...(profile?.core?.photoURL ? { photoURL: profile.core.photoURL as string } : {}),
        ...props.live,
        ...(Object.keys(cheersSent).length ? { cheersSent } : {}),
      }
    : null;
  usePublishPresence(ref, status);
  const [selected, setSelected] = useState<string | null>(null);

  const me = participants.find((p) => p.isMe);
  const rival = selected ? participants.find((p) => p.uid === selected) : undefined;
  const race = useMemo(() => (me && rival && props.live.kind === 'run' ? computeRace(me, rival) : null), [me, rival, props.live.kind]);

  if (!ref) return null;
  const bar = race && rival ? <RaceBar race={race} name={rival.name} /> : null;
  return (
    <>
      {bar && (props.renderRaceBar ? props.renderRaceBar(bar) : bar)}
      <PresenceRail
        participants={participants}
        selectedUid={selected}
        onSelect={setSelected}
        topInset={props.topInset}
        bottomInset={props.bottomInset}
        renderExtra={(p) => (p.isMe || p.state === 'done' ? null : <CheerButton name={p.name} onCheer={() => cheer(p.uid)} />)}
      />
      <TogetherToasts events={presence.events} onAck={presence.ackEvents} />
    </>
  );
}
