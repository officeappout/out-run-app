'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import type { TvParticipant } from '../core/types';
import Avatar from '../ui/Avatar';

/** Overlapped avatars ("4 משתתפים") used on the host and participant panels. */
export function AvatarStack({ list, size = 40 }: { list: TvParticipant[]; size?: number }) {
  return (
    <span className="flex ps-2.5" aria-hidden="true">
      {list.slice(0, 5).map((p) => (
        <span key={p.uid} className="-ms-2.5">
          <Avatar uid={p.uid} name={p.name} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Host panel rows: everyone who joined (the host themselves is left out — they know). */
export default function TvParticipantsList({ list }: { list: TvParticipant[] }) {
  const t = useT(wide);
  return (
    <ul className="mt-1.5 border-t border-[#eef2f6] pt-1">
      {list.map((p) => (
        <li key={p.uid} className="flex items-center gap-3 py-2">
          <Avatar uid={p.uid} name={p.name} size={40} />
          <span className="flex-1 text-[15.5px] font-extrabold">{p.name || t('lobby.noName')}</span>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[#047857]">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" aria-hidden="true" />
            {t('remote.host.online')}
          </span>
        </li>
      ))}
    </ul>
  );
}
