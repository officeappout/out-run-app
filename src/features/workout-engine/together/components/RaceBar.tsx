'use client';

import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import type { RaceView } from '../core/race';

/**
 * The second thin bar under the story bars: me vs the person picked on the
 * rail — two markers on one track, the distance gap and (when known) the pace
 * gap. Presentational; the player decides where it sits.
 */
export default function RaceBar({ race, name }: { race: RaceView; name: string }) {
  const t = useT(together);
  const km = Math.abs(race.gapKm).toFixed(2);
  const gapKey = race.leader === 'even' ? 'race.even' : race.leader === 'me' ? 'race.ahead' : 'race.behind';
  const pace = race.paceGapSec;
  return (
    <div className="w-full px-3" dir="rtl" role="status">
      <div className="relative h-1.5 w-full rounded-full bg-white/25">
        <span className="absolute top-0 h-full rounded-full bg-sky-400" style={{ width: `${Math.round(race.themFrac * 100)}%`, opacity: 0.55 }} />
        <span className="absolute top-0 h-full rounded-full bg-white" style={{ width: `${Math.round(race.meFrac * 100)}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-white/90">
        <span>{t('race.label', { name })}</span>
        <span className="tabular-nums">
          {t(gapKey, { km })}
          {pace != null && Math.abs(pace) >= 1 ? ` · ${t(pace < 0 ? 'race.paceFaster' : 'race.paceSlower', { sec: Math.abs(pace) })}` : ''}
        </span>
      </div>
    </div>
  );
}
