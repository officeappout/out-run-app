'use client';
/**
 * ParkMessageRow — the one thin message line under the story bars (enable_park_live_v2, board
 * Park 2, pilot M2). It carries the next turn (from TurnCarousel in publishOnly mode, which no
 * longer draws its card here) and "a strength station is coming" from 300 m. One message at a
 * time: a turn under 50 m opens wide, then the station, then the next turn, compact.
 */
import React from 'react';
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Dumbbell, Flag, type LucideIcon } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useMapStore, type ParkTurnInfo } from '@/features/parks/core/store/useMapStore';
import { fmtDistance } from '../../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from '../HybridPlayerV2Context';
import { stationName } from '../hybrid-v2-view';
import { messageRowKind, stationMessageM } from '../../park-live-v2';

const TURN_ICON: Record<ParkTurnInfo['icon'], LucideIcon> = {
  straight: ArrowUp,
  slightRight: ArrowUpRight,
  slightLeft: ArrowUpLeft,
  right: CornerUpRight,
  left: CornerUpLeft,
  destination: Flag,
};

function Row({ icon: Icon, text, sub, distanceM, wide }: { icon: LucideIcon; text: string; sub?: string | null; distanceM: number | null; wide?: boolean }) {
  return (
    <div
      role="status"
      className={`mt-2 flex items-center gap-2.5 rounded-2xl shadow-v2-ring ${wide ? 'bg-v2-ink px-3 py-3 text-white' : 'bg-white px-3 py-2 text-v2-ink'}`}
    >
      {/* dir="ltr": the arrows are literal (no RTL mirroring), as on the turn card. */}
      <span
        dir="ltr"
        className={`grid shrink-0 place-items-center ${wide ? 'h-12 w-12 rounded-xl bg-white/15' : 'h-7 w-7 rounded-full bg-v2-tint text-v2-deep'}`}
        aria-hidden
      >
        <Icon size={wide ? 30 : 15} strokeWidth={2.4} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {wide && distanceM != null && <span dir="ltr" className="text-end text-[22px] font-black tabular-nums leading-none">{fmtDistance(distanceM)}</span>}
        {sub && <span className={`truncate text-[12px] font-bold ${wide ? 'text-white/80' : 'text-v2-muted'}`}>{sub}</span>}
        <span className={`truncate font-extrabold ${wide ? 'text-[15px]' : 'text-[14px]'}`}>{text}</span>
      </span>
      {!wide && distanceM != null && (
        <span dir="ltr" className="shrink-0 text-[13px] font-black tabular-nums text-v2-muted">{fmtDistance(distanceM)}</span>
      )}
    </div>
  );
}

export default function ParkMessageRow({ api }: { api: HybridPlayerV2Api }) {
  const t = useT(player);
  const turn = useMapStore((s) => s.parkTurn);
  const stationM = stationMessageM(api.view);
  const kind = messageRowKind(turn, stationM);
  if (kind === 'station') {
    const park = stationName(api.view?.upcomingStation, api.names);
    return (
      <Row
        icon={Dumbbell}
        text={park ? t('parkLive.message.stationNamed', { name: park }) : t('parkLive.message.station')}
        distanceM={stationM}
      />
    );
  }
  if (!turn || !kind) return null;
  return <Row icon={TURN_ICON[turn.icon]} text={turn.headline} sub={turn.actionLine} distanceM={turn.distanceM} wide={kind === 'turnWide'} />;
}
