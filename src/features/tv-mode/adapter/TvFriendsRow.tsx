'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import Avatar from '../ui/Avatar';
import type { WideStageModel } from './stage-model';

/** The together row under the stage: everyone in the room, equal list (host tagged), a live status each. */
export default function TvFriendsRow({ model }: { model: Pick<WideStageModel, 'friends' | 'moreFriends' | 'hostUid'> }) {
  const t = useT(wide);
  if (model.friends.length === 0) return null;
  return (
    <ul className="flex items-center justify-center gap-[1.4vw] px-[5vw]" aria-label={t('stage.friends')}>
      {model.friends.map((p) => (
        <li key={p.uid} className="flex items-center gap-[0.8vw] rounded-full bg-white py-[0.8vh] ps-[0.8vw] pe-[1.6vw] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
          <Avatar uid={p.uid} name={p.name} avatar={p.avatar} size={52} />
          <span className="text-[1.7vw] font-extrabold">{p.name || t('lobby.noName')}</span>
          {p.uid === model.hostUid && <span className="rounded-full bg-[#e0f4fd] px-[0.7vw] py-[0.2vh] text-[1.2vw] font-extrabold text-[#0369a1]">{t('lobby.host')}</span>}
          <span className="text-[1.4vw] font-bold text-[#475569]">
            {p.state === 'resting'
              ? t('remote.friend.resting')
              : p.state === 'done'
                ? t('remote.friend.done')
                : p.state === 'active' && p.set && p.totalSets
                  ? t('remote.friend.active', { set: p.set, total: p.totalSets })
                  : ''}
          </span>
        </li>
      ))}
      {model.moreFriends > 0 && <li className="text-[1.6vw] font-extrabold text-[#475569]">{t('lobby.more', { n: model.moreFriends })}</li>}
    </ul>
  );
}
