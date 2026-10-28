'use client';
/**
 * ParkMessageRow — the one thin message line under the story bars (enable_park_live_v2, board
 * Park 2, pilot M2). Today it carries "a strength station is coming" from 300 m; turns stay in
 * the map's turn card until that card moves into this row.
 */
import React from 'react';
import { Dumbbell } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { fmtDistance } from '../../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from '../HybridPlayerV2Context';
import { stationName } from '../hybrid-v2-view';
import { stationMessageM } from '../../park-live-v2';

export default function ParkMessageRow({ api }: { api: HybridPlayerV2Api }) {
  const t = useT(player);
  const d = stationMessageM(api.view);
  if (d == null) return null;
  const park = stationName(api.view?.upcomingStation, api.names);
  return (
    <div role="status" className="mt-2 flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2 shadow-v2-ring">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
        <Dumbbell size={15} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-v2-ink">
        {park ? t('parkLive.message.stationNamed', { name: park }) : t('parkLive.message.station')}
      </span>
      <span dir="ltr" className="shrink-0 text-[13px] font-black tabular-nums text-v2-muted">{fmtDistance(d)}</span>
    </div>
  );
}
