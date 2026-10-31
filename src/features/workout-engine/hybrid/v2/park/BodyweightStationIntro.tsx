'use client';
/**
 * BodyweightStationIntro: the v2 intro for a station with no machine tabata (enable_park_live_v2,
 * boards PlayerStationIntro "park" / "street", PlayerParkWelcome "bodyweight"). Where, the muscles,
 * how it runs, the exercises (photo, name, sets × target) and "to the first video". The sibling of
 * ParkStationIntro (machines); replaces the guided StationWelcomeScreen for these stations.
 */
import React from 'react';
import { Dumbbell } from 'lucide-react';
import { Button, Chip } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useUiDir } from '@/lib/i18n/useUiDir';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { StationContext } from '../../station-flow';
import type { BodyweightIntroView } from './bodyweight-intro';
import { ParkAfterRow, ParkWelcomeHeading } from './ParkWelcome';

interface Props {
  intro: BodyweightIntroView;
  context: StationContext;
  onStart: () => void;
}

export default function BodyweightStationIntro({ intro, context, onStart }: Props) {
  const { direction } = useUiDir();
  const t = useT(player);
  const n = String(intro.rows.length);
  return (
    <div className="absolute inset-0 flex flex-col bg-v2-surface" dir={direction}>
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <div className="flex flex-col gap-2 px-[18px] pb-4">
          <ParkWelcomeHeading context={context} />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-black text-v2-deep">
              {t('hybrid.welcome.stationOf', { number: String(context.stationNumber), total: String(context.stationTotal) })}
            </span>
            {context.parkName && <span className="truncate text-[12.5px] font-extrabold text-v2-muted">{context.parkName}</span>}
          </div>
          <h1 className="text-[23px] font-black leading-[29px] text-v2-ink" style={{ fontFamily: 'var(--font-simpler)' }}>
            {t(intro.kind === 'street' ? 'parkLive.bw.title.street' : 'parkLive.bw.title.park')}
          </h1>
          {intro.kind === 'street' && <span className="text-[13.5px] font-bold text-v2-deep">{t('parkLive.bw.streetNote')}</span>}
          {intro.muscles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-extrabold text-v2-muted">{t('parkLive.intro.muscles')}</span>
              {intro.muscles.map((m) => <Chip key={m} tone="accent">{getMuscleGroupLabel(m)}</Chip>)}
            </div>
          )}
          <p className="text-[13.5px] leading-[21px] text-v2-ink-2">
            {intro.setsEach != null
              ? t('parkLive.bw.how', { n, sets: String(intro.setsEach) })
              : t('parkLive.bw.howMixed', { n })}
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {intro.rows.map((r, i) => (
              <div key={`${r.id}-${i}`} className="flex items-center gap-2.5 rounded-2xl bg-white p-2 ring-1 ring-inset ring-v2-hairline">
                <div className="grid h-[52px] w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-v2-tint text-v2-deep">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Dumbbell size={22} strokeWidth={2.2} aria-hidden />
                  )}
                </div>
                <span className="min-w-0 flex-1 text-[14.5px] font-black leading-[19px] text-v2-ink">{r.name}</span>
                {r.target && <span dir="ltr" className="shrink-0 text-[13.5px] font-extrabold text-v2-ink-2">{r.target}</span>}
              </div>
            ))}
          </div>
          <div className="mt-2">
            <ParkAfterRow context={context} />
          </div>
        </div>
      </div>
      <div className="px-[18px] pt-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}>
        <Button variant="cta" block onClick={onStart}>{t('parkLive.bw.start')}</Button>
      </div>
    </div>
  );
}
