'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { buildJoinUrl, formatCodeGroups } from '../core/code';
import QrBlock from '../ui/QrBlock';

/** W-16 (TV): the workout keeps running on the local clock; amber banner + a small QR to reconnect. */
export function TvLostBanner() {
  const t = useT(wide);
  return (
    <div role="status" className="mx-[5vw] mt-[4vh] flex items-center gap-[1vw] rounded-[1.4vw] bg-[#fff7e8] px-[1.6vw] py-[1.4vh] shadow-[inset_0_0_0_1px_#fde68a]">
      <span className="h-[1.2vw] w-[1.2vw] rounded-full bg-[#f59e0b]" aria-hidden="true" />
      <span className="flex-1 text-[1.9vw] font-extrabold leading-snug">{t('lost.tv.banner')}</span>
    </div>
  );
}

export function TvReconnectCorner({ code, origin }: { code: string; origin: string }) {
  const t = useT(wide);
  return (
    <div className="fixed bottom-[4vh] end-[4vw] flex items-center gap-[1vw] rounded-[1.4vw] bg-white p-[1vw] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
      <QrBlock value={buildJoinUrl(origin, code)} size="8vw" label={t('pair.tv.qrLabel')} />
      <div>
        <div className="text-[1.3vw] font-extrabold text-[#475569]">{t('lost.tv.code')}</div>
        <div dir="ltr" className="text-[2.6vw] font-black">{formatCodeGroups(code)}</div>
      </div>
    </div>
  );
}
