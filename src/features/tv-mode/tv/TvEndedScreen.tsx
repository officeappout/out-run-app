'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { useAutoFocus } from '../hooks/useAutoFocus';
import { PAGE_BG } from '../ui/styles';

/** The session is over (host ended it, or the 4 hours ran out): offer a fresh code. */
export default function TvEndedScreen({ reason, onNewCode }: { reason: 'ended' | 'expired'; onNewCode: () => void }) {
  const t = useT(wide);
  const focusRef = useAutoFocus<HTMLButtonElement>();
  return (
    <main dir="rtl" className={`fixed inset-0 grid place-items-center ${PAGE_BG}`}>
      <div className="flex flex-col items-center gap-[3vh] text-center">
        <h1 className="text-[4.6vw] font-black">{reason === 'ended' ? t('lost.tv.ended.title') : t('lost.tv.expired.title')}</h1>
        <p className="text-[2vw] font-bold text-[#475569]">{reason === 'ended' ? t('lost.tv.ended.body') : t('lost.tv.expired.body')}</p>
        <button
          type="button"
          ref={focusRef}
          onClick={onNewCode}
          className="min-h-[12vh] rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] px-[5vw] text-[3vw] font-black text-[#04222b] focus:outline-none focus-visible:ring-[0.6vw] focus-visible:ring-[#0e1419]/50"
        >
          {t('lost.tv.newCode')}
        </button>
      </div>
    </main>
  );
}
