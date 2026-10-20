'use client';

import React from 'react';
import BrandCtaButton from '@/components/ui/BrandCtaButton';
import { INTRO_UI } from '../intro-copy';
import { IntroCanvas } from './IntroCanvas';

export interface IntroShellProps {
  cta: string;
  onCta: () => void;
  /** "דלג" — straight to the globe. */
  onSkip?: () => void;
  /** Canvas content (390×800 coordinates). */
  children: React.ReactNode;
}

/**
 * The frame every intro screen shares (enable_entry_intro_v1): white page, the
 * soft brand-gradient blob at the top, the scaled canvas, and the bottom bar with
 * the pill CTA over a white fade. The CTA is always live — the story can be
 * skipped ahead at any moment.
 */
export function IntroShell({ cta, onCta, onSkip, children }: IntroShellProps) {
  return (
    <div className="fixed inset-0 isolate overflow-hidden bg-white text-v2-ink" dir="rtl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-[60px] -top-[140px] h-[440px] rounded-b-[50%] bg-v2-cta opacity-[0.13]"
      />
      <IntroCanvas>{children}</IntroCanvas>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="absolute left-3 z-20 rounded-full px-3 py-1.5 text-[13px] font-semibold text-v2-muted active:opacity-60"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
        >
          {INTRO_UI.skip}
        </button>
      )}

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end px-6"
        style={{
          height: 'calc(150px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(30px, env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(rgba(255,255,255,0), #ffffff 42%)',
        }}
      >
        <BrandCtaButton
          onClick={onCta}
          whileTap={{ scale: 0.97 }}
          className="h-[54px] w-full max-w-md text-[17px] !font-bold text-v2-on-cta"
        >
          {cta}
        </BrandCtaButton>
      </div>
    </div>
  );
}
