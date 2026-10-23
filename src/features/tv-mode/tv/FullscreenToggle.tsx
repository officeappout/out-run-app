'use client';

import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import type { FullscreenControls } from '../hooks/useFullscreen';

/** Always-visible fullscreen switch (remote-focusable, large target) + the denial note. */
export default function FullscreenToggle({ fs }: { fs: FullscreenControls }) {
  const t = useT(wide);
  if (!fs.supported && !fs.denied) return null;
  const label = fs.isFullscreen ? t('pair.fullscreen.exit') : t('pair.fullscreen.enter');
  return (
    <div className="absolute end-[2vw] top-[3vh] z-20 flex items-center gap-[1vw]">
      {fs.denied && !fs.isFullscreen && (
        <span role="status" className="rounded-full bg-white px-[1.4vw] py-[1vh] text-[1.5vw] font-bold text-[#475569] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
          {t('pair.fullscreen.denied')}
        </span>
      )}
      <button
        type="button"
        onClick={() => void fs.toggle()}
        aria-label={label}
        className="inline-flex min-h-[7vh] min-w-[7vh] items-center justify-center gap-[0.8vw] rounded-full bg-white px-[1.6vw] text-[1.6vw] font-extrabold shadow-[0_0_0_1px_rgba(14,27,42,0.08)] focus:outline-none focus-visible:ring-[0.4vw] focus-visible:ring-[#00baf7]"
      >
        {fs.isFullscreen ? <Minimize2 className="h-[2.2vw] w-[2.2vw]" aria-hidden="true" /> : <Maximize2 className="h-[2.2vw] w-[2.2vw]" aria-hidden="true" />}
        <span>{label}</span>
      </button>
    </div>
  );
}
