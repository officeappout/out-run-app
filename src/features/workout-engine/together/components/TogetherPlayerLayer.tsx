'use client';

import { useMemo } from 'react';
import PresenceRail from '@/features/workout-engine/players/shared/v2/PresenceRail';
import { useTogetherSession, type TogetherLiveStatus } from '../hooks/useTogetherSession';
import { computeRace } from '../core/race';
import RaceBar from './RaceBar';
import CheerButton from './CheerButton';
import TogetherToasts from './TogetherToasts';

export type { TogetherLiveStatus };

export interface TogetherPlayerLayerProps {
  live: TogetherLiveStatus;
  /** Free band for the rail (px from the viewport top / bottom): header and drawer + buttons. */
  topInset: number;
  bottomInset: number;
  /** Renders the race bar through this slot (players without the run header layers). */
  renderRaceBar?: (bar: React.ReactNode) => React.ReactNode;
}

/**
 * Generic one-mount together layer (rail + toasts + optional race bar) for
 * players that do not have the run header's sliding layers (strength / AMRAP /
 * EMOM). The run / walk / bike players use useRunTogetherChrome instead.
 * Renders nothing unless enable_together_layer_v1 is on inside a together session.
 */
export default function TogetherPlayerLayer(props: TogetherPlayerLayerProps) {
  const s = useTogetherSession(props.live);
  const me = s.participants.find((p) => p.isMe);
  const race = useMemo(() => (me && s.rival && props.live.kind === 'run' ? computeRace(props.live, s.rival) : null), [me, s.rival, props.live]);
  if (!s.on) return null;
  const bar = race && s.rival ? <RaceBar race={race} name={s.rival.name} /> : null;
  return (
    <>
      {bar && (props.renderRaceBar ? props.renderRaceBar(bar) : bar)}
      <PresenceRail
        participants={s.participants}
        selectedUid={s.selected}
        onSelect={s.setSelected}
        topInset={props.topInset}
        bottomInset={props.bottomInset}
        renderExtra={(p) => (p.isMe || p.state === 'done' ? null : <CheerButton name={p.name} onCheer={() => s.cheer(p.uid)} />)}
      />
      <TogetherToasts events={s.events} onAck={s.ackEvents} />
    </>
  );
}
