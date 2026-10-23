'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { nextCommand } from '../core/commands';
import { formatClock } from '../core/format';
import { timerReading } from '../core/mirror';
import type { TvMirror, TvParticipant, TvSession } from '../core/types';
import { leaveTvSession } from '../hooks/useTvJoin';
import { getTvRepo } from '../services/tv-repo';
import Avatar from '../ui/Avatar';
import { CARD, CHIP_OK, PAGE_BG, SECONDARY_BTN } from '../ui/styles';
import type { TvRemoteControls } from './phone-store';

const ROUND = 'grid place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.08)] active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00baf7]/60';

/** W-15: the phone as the remote. Pure view over the host's own mirror + the player's controls. */
export default function TvRemote({
  session,
  mirror,
  controls,
  participants,
  serverNow,
}: {
  session: TvSession;
  mirror: TvMirror;
  controls: TvRemoteControls;
  participants: TvParticipant[];
  serverNow: number;
}) {
  const t = useT(wide);
  const [volume, setVolume] = useState(session.volume);
  const [muted, setMuted] = useState(false);
  const lastSend = useRef(0);
  const reading = timerReading(mirror.timer, session.timerAnchorAtMs, serverNow);
  const friends = participants.filter((p) => p.uid !== session.hostUid);

  const send = (type: 'volume' | 'mute', value: number) => {
    void getTvRepo().sendCommand(session.code, nextCommand(session.cmd, type, value)).catch(() => undefined);
  };
  const onVolume = (v: number) => {
    setVolume(v);
    setMuted(false);
    const now = Date.now();
    if (now - lastSend.current > 250) {
      lastSend.current = now;
      send('volume', v);
    }
  };

  const chips = [session.workout?.kind === 'timed' ? t('remote.chip.timed') : t('remote.chip.strength'), ...(mirror.together ? [t('remote.chip.together')] : [])];
  const reps =
    mirror.repsMin != null && mirror.repsMax != null
      ? mirror.repsMin === mirror.repsMax
        ? t('remote.target.repsOne', { min: mirror.repsMin })
        : t('remote.target.reps', { min: mirror.repsMin, max: mirror.repsMax })
      : mirror.holdSec
        ? t('remote.target.hold', { sec: mirror.holdSec })
        : '';

  return (
    <div dir="rtl" className={`fixed inset-0 z-[101] flex flex-col overflow-y-auto ${PAGE_BG}`} role="region" aria-label={t('remote.connected')}>
      <div className="flex items-center gap-2.5 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <span className={CHIP_OK}>
            <span className="h-2 w-2 rounded-full bg-[#10b981]" aria-hidden="true" />
            {t('remote.connected')}
          </span>
        </div>
        <button type="button" onClick={() => void leaveTvSession()} className="min-h-[44px] rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-[#b91c1c] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
          {t('remote.disconnect')}
        </button>
      </div>

      <div className={`${CARD} mx-4 mt-3.5`}>
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span key={i} className={`inline-flex min-h-[28px] items-center rounded-full px-2.5 text-[12.5px] font-extrabold ${i === 0 ? 'bg-[#eef8fc] text-[#0284c7]' : 'bg-[#f1f5f9] text-[#475569]'}`}>
              {c}
            </span>
          ))}
        </div>
        <div className="mt-2.5 text-[24px] font-black leading-tight">{mirror.phase === 'done' ? t('remote.done') : mirror.exerciseName || t('remote.idle')}</div>
        {mirror.phase !== 'done' && (
          <div className="mt-1 text-[14px] font-bold text-[#475569]">
            {t('remote.setOf', { set: mirror.setIndex, total: mirror.setCount })}
            {reps ? ` · ${reps}` : ''}
          </div>
        )}
        {mirror.timer.dir !== 'none' && (
          <div dir="ltr" className="mt-2 text-[44px] font-black leading-none tracking-[-0.03em] tabular-nums">
            {formatClock(reading)}
          </div>
        )}
      </div>

      <div className="mt-[22px] flex items-end justify-between px-7">
        <button type="button" aria-label={t('remote.prev')} className={`${ROUND} h-[60px] w-[60px]`} onClick={controls.prev}>
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={mirror.paused ? t('remote.resume') : t('remote.pause')}
          className={`grid h-[92px] w-[92px] place-items-center rounded-full ${mirror.paused ? 'bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] text-[#04222b] shadow-[0_16px_30px_-12px_rgba(0,186,247,0.8)]' : 'bg-[#f97316] text-white shadow-[0_16px_30px_-12px_rgba(249,115,22,0.8)]'} active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0e1419]/40`}
          onClick={controls.togglePause}
        >
          {mirror.paused ? <Play size={38} aria-hidden="true" fill="currentColor" /> : <Pause size={38} aria-hidden="true" fill="currentColor" />}
        </button>
        <button type="button" aria-label={t('remote.next')} className={`${ROUND} h-[60px] w-[60px]`} onClick={controls.next}>
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1.5 flex justify-between px-7 text-[12px] font-extrabold text-[#475569]" aria-hidden="true">
        <span className="w-[60px] text-center">{t('remote.prev')}</span>
        <span>{mirror.paused ? t('remote.resume') : t('remote.pause')}</span>
        <span className="w-[60px] text-center">{t('remote.next')}</span>
      </div>

      <div className="mt-3 flex justify-center">
        <button type="button" className={`${SECONDARY_BTN} !w-auto min-h-[44px] !text-[14px] text-[#0284c7]`} onClick={controls.skipExercise}>
          {t('remote.skip')}
        </button>
      </div>

      <div className="mx-4 mt-[18px] flex items-center gap-3 rounded-[20px] bg-white px-4 py-3.5 shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
        <button
          type="button"
          aria-label={muted ? t('remote.unmute') : t('remote.mute')}
          aria-pressed={muted}
          className="grid h-11 w-11 place-items-center rounded-full text-[#475569]"
          onClick={() => {
            setMuted(!muted);
            send('mute', muted ? 0 : 1);
          }}
        >
          {muted ? <VolumeX size={22} aria-hidden="true" /> : <Volume2 size={22} aria-hidden="true" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label={t('remote.volume')}
          dir="ltr"
          className="h-6 flex-1 accent-[#00baf7]"
          onChange={(e) => onVolume(Number(e.target.value))}
          onPointerUp={() => send('volume', volume)}
          onKeyUp={() => send('volume', volume)}
        />
        <span className="min-w-9 text-end text-[13px] font-extrabold">{t('remote.volume')}</span>
      </div>

      {friends.length > 0 && (
        <div className={`${CARD} mx-4 mt-3.5 flex flex-col gap-2.5 !p-3.5`}>
          <div className="text-[13px] font-extrabold text-[#64748b]">{t('remote.friends')}</div>
          {friends.map((p) => (
            <div key={p.uid} className="flex items-center gap-2.5">
              <Avatar uid={p.uid} name={p.name} avatar={p.avatar} size={34} />
              <span className="flex-1 text-[14.5px] font-extrabold">{p.name || t('lobby.noName')}</span>
              <span className="text-[13px] font-extrabold text-[#0284c7]">
                {p.state === 'resting' ? t('remote.friend.resting') : p.state === 'done' ? t('remote.friend.done') : p.set && p.totalSets ? t('remote.friend.active', { set: p.set, total: p.totalSets }) : t('remote.friend.joined')}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="h-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0" />
    </div>
  );
}
