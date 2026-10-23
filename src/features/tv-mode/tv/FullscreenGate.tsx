'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { useAutoFocus } from '../hooks/useAutoFocus';
import { PAGE_BG } from '../ui/styles';

/**
 * First screen of /tv: one big button. requestFullscreen needs a user gesture, and a TV remote's
 * OK key clicks the focused button — so the button is auto-focused and enormous.
 */
export default function FullscreenGate({ onStart }: { onStart: () => void }) {
  const t = useT(wide);
  const focusRef = useAutoFocus<HTMLButtonElement>();
  return (
    <main dir="rtl" className={`fixed inset-0 grid place-items-center ${PAGE_BG}`}>
      <div className="flex flex-col items-center gap-[3vh] text-center">
        <h1 className="text-[4vw] font-black leading-tight">{t('pair.gate.title')}</h1>
        <button
          type="button"
          ref={focusRef}
          onClick={onStart}
          className="min-h-[14vh] rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] px-[6vw] text-[3.4vw] font-black text-[#04222b] focus:outline-none focus-visible:ring-[0.6vw] focus-visible:ring-[#0e1419]/50"
        >
          {t('pair.gate.cta')}
        </button>
        <p className="text-[1.8vw] font-bold text-[#475569]">{t('pair.gate.hint')}</p>
      </div>
    </main>
  );
}
