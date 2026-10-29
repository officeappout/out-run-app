'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { buildJoinUrl, formatCodeGroups } from '../core/code';
import { TV_MAX_PARTICIPANTS } from '../core/constants';
import type { TvParticipant, TvSession } from '../core/types';
import Avatar from '../ui/Avatar';
import QrBlock from '../ui/QrBlock';
import { PAGE_BG } from '../ui/styles';

import { useUiDir } from '@/lib/i18n/useUiDir';
/** W-19: the shared room — one QR + code (join = control), and who is in the living room. */
export default function TvLobbyScreen({ session, participants, origin }: { session: TvSession; participants: TvParticipant[]; origin: string }) {
  const { direction } = useUiDir();
  const t = useT(wide);
  const shown = participants.slice(0, TV_MAX_PARTICIPANTS);
  const extra = participants.length - shown.length;
  return (
    <main dir={direction} className={`fixed inset-0 flex items-center justify-between gap-[4vw] px-[6vw] ${PAGE_BG}`}>
      <section className="flex-1">
        {session.workout && <p className="text-[1.6vw] font-extrabold text-[#0284c7]">{t('lobby.workout', { title: session.workout.title })}</p>}
        <h1 className="mt-[1vh] text-[5vw] font-black leading-tight">{t('lobby.title')}</h1>
        <p className="mt-[1.4vh] max-w-[40vw] text-[1.8vw] font-bold leading-snug text-[#475569]">{t('lobby.hint')}</p>
        <ul className="mt-[4vh] flex flex-col gap-[1.8vh]" aria-label={t('lobby.count', { n: participants.length })}>
          {shown.map((p) => (
            <li key={p.uid} className="flex items-center gap-[1.2vw]">
              <Avatar uid={p.uid} name={p.name} avatar={p.avatar} size={64} />
              <span className="text-[2.4vw] font-black">{p.name || t('lobby.noName')}</span>
              <span
                className={`rounded-full px-[1vw] py-[0.4vh] text-[1.4vw] font-extrabold ${
                  p.uid === session.hostUid ? 'bg-[#e0f4fd] text-[#0369a1]' : 'bg-[#e8f8f1] text-[#047857]'
                }`}
              >
                {p.uid === session.hostUid ? t('lobby.host') : t('lobby.joined')}
              </span>
            </li>
          ))}
          {extra > 0 && <li className="text-[1.8vw] font-bold text-[#475569]">{t('lobby.more', { n: extra })}</li>}
        </ul>
        <p role="status" className="mt-[3vh] text-[2vw] font-extrabold text-[#0284c7]">
          {t('lobby.count', { n: participants.length })} · {t('lobby.waitingHost', { hostGender: session.hostGender ?? 'other' })}
        </p>
      </section>
      <section className="flex flex-col items-center gap-[2.4vh] rounded-[2vw] bg-white p-[2.4vw] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
        <QrBlock value={buildJoinUrl(origin, session.code)} size="min(24vw, 46vh)" label={t('pair.tv.qrLabel')} />
        <div className="text-center">
          <div className="text-[1.5vw] font-extrabold text-[#475569]">{t('lobby.or')}</div>
          <div dir="ltr" className="text-[5vw] font-black leading-none tracking-[0.04em]">{formatCodeGroups(session.code)}</div>
        </div>
      </section>
    </main>
  );
}
