'use client';
/**
 * ParkStationIntro — ONE screen at the start of a machine station, before the first machine
 * (enable_park_live_v2, board Park 5, pilot M10 / M11 / M13): the station's muscles, how tabata
 * works here (rounds per machine, work / rest), the machines as photo cards that scroll sideways,
 * and the difficulty in bolts (it only changes the work / rest split; the station length stays).
 * Replaces the guided welcome screen for stations with machine tabata only.
 */
import React from 'react';
import { Dumbbell, X, Zap } from 'lucide-react';
import { Button, Chip } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { TABATA_DIFFICULTY_LADDER } from '../../../services/compose-park-strength-workout.service';
import type { StationContext } from '../../station-flow';
import { STATION_DIFFICULTIES, type StationDifficulty, type StationIntroView, type StationMachine } from '../../park-live-v2';

import { useUiDir } from '@/lib/i18n/useUiDir';
import { ParkAfterRow, ParkWelcomeHeading } from './ParkWelcome';
interface Props {
  intro: StationIntroView;
  context: StationContext;
  difficulty: StationDifficulty;
  onDifficulty: (d: StationDifficulty) => void;
  onStart: () => void;
  onSkip?: () => void;
}

const LEVEL_KEY = {
  easy: 'parkLive.intro.level.easy',
  medium: 'parkLive.intro.level.medium',
  hard: 'parkLive.intro.level.hard',
} as const;

function MachineCard({ m, index, rounds }: { m: StationMachine; index: number; rounds: number }) {
  return (
    <div className="flex w-[150px] shrink-0 flex-col gap-1.5 rounded-2xl bg-white p-2 ring-1 ring-inset ring-v2-hairline">
      <div className="grid h-[96px] place-items-center overflow-hidden rounded-xl bg-v2-tint text-v2-deep">
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Dumbbell size={30} strokeWidth={2.2} aria-hidden />
        )}
      </div>
      <span className="line-clamp-2 text-[13px] font-black leading-[17px] text-v2-ink">{`${index + 1} · ${m.name}`}</span>
      {m.muscles.length > 0 && (
        <span className="truncate text-[11.5px] font-bold text-v2-deep">{m.muscles.map(getMuscleGroupLabel).join(' · ')}</span>
      )}
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: rounds }, (_, i) => (
          <span key={i} className="h-3.5 flex-1 rounded bg-v2-accent" />
        ))}
      </span>
    </div>
  );
}

export default function ParkStationIntro({ intro, context, difficulty, onDifficulty, onStart, onSkip }: Props) {
  const { direction } = useUiDir();
  const t = useT(player);
  const rung = TABATA_DIFFICULTY_LADDER[difficulty];
  return (
    <div className="absolute inset-0 flex flex-col bg-v2-surface" dir={direction}>
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <div className="flex flex-col gap-2 px-[18px]">
          <ParkWelcomeHeading context={context} />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-black text-v2-deep">
              {t('hybrid.welcome.stationOf', { number: String(context.stationNumber), total: String(context.stationTotal) })}
            </span>
            {context.parkName && <span className="truncate text-[12.5px] font-extrabold text-v2-muted">{context.parkName}</span>}
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                aria-label={t('parkLive.intro.skipAria')}
                className="ms-auto grid h-9 w-9 place-items-center rounded-full bg-white text-v2-ink ring-1 ring-inset ring-v2-hairline"
              >
                <X size={16} strokeWidth={2.4} aria-hidden />
              </button>
            )}
          </div>
          <h1 className="text-[23px] font-black leading-[29px] text-v2-ink" style={{ fontFamily: 'var(--font-simpler)' }}>
            {t('parkLive.intro.title', { n: String(intro.machines.length), min: String(intro.totalMin) })}
          </h1>
          {intro.muscles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-extrabold text-v2-muted">{t('parkLive.intro.muscles')}</span>
              {intro.muscles.map((m) => <Chip key={m} tone="accent">{getMuscleGroupLabel(m)}</Chip>)}
            </div>
          )}
          <p className="text-[13.5px] leading-[21px] text-v2-ink-2">
            {t('parkLive.intro.how', { rounds: String(intro.roundsPerMachine), work: String(rung.workSec), rest: String(rung.restSec) })}
          </p>
        </div>
        <div className="mt-3 flex gap-2.5 overflow-x-auto px-[18px] pb-1">
          {intro.machines.map((m, i) => <MachineCard key={`${m.id}-${i}`} m={m} index={i} rounds={intro.roundsPerMachine} />)}
        </div>
        <div className="mt-4 flex flex-col gap-2 px-[18px] pb-4">
          <span className="text-[15px] font-black text-v2-ink">{t('parkLive.intro.difficulty')}</span>
          <div className="flex gap-2" role="radiogroup" aria-label={t('parkLive.intro.difficulty')}>
            {STATION_DIFFICULTIES.map((d, i) => {
              const on = d === difficulty;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onDifficulty(d)}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1.5 py-2.5 ${on ? 'bg-v2-tint ring-2 ring-inset ring-v2-accent' : 'bg-white ring-1 ring-inset ring-v2-hairline'}`}
                >
                  <span className="flex gap-0.5" aria-hidden>
                    {[1, 2, 3].map((b) => (
                      <Zap key={b} size={13} strokeWidth={0} fill={b <= i + 1 ? '#f59e0b' : '#dfe7ed'} />
                    ))}
                  </span>
                  <span className="text-[14.5px] font-black text-v2-ink">{t(LEVEL_KEY[d])}</span>
                  <span className="text-[11.5px] font-bold text-v2-muted">{t('parkLive.intro.workSec', { sec: String(TABATA_DIFFICULTY_LADDER[d].workSec) })}</span>
                </button>
              );
            })}
          </div>
          <span className="text-[12px] text-v2-muted">{t('parkLive.intro.difficultyNote', { min: String(intro.totalMin) })}</span>
          <div className="mt-2"><ParkAfterRow context={context} /></div>
        </div>
      </div>
      <div className="px-[18px] pt-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}>
        <Button variant="cta" block onClick={onStart}>{t('parkLive.intro.start')}</Button>
      </div>
    </div>
  );
}
