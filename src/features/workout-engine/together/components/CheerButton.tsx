'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { hapticTap } from '@/lib/haptics';
import { TOGETHER_CONFIG } from '../core/config';

/** Tap-to-cheer (כיף): a small burst + a light haptic. Counting lives in the caller. */
export default function CheerButton({ name, onCheer }: { name: string; onCheer: () => void }) {
  const t = useT(together);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(0), TOGETHER_CONFIG.cheerBurstMs);
    return () => clearTimeout(id);
  }, [burst]);
  return (
    <button
      type="button"
      aria-label={t('cheer.aria', { name })}
      onClick={() => { hapticTap('impact'); setBurst((n) => n + 1); onCheer(); }}
      className="relative mt-0.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white active:scale-90"
    >
      {burst > 0 && <span key={burst} aria-hidden className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-amber-300/70" />}
      <span className="relative">{t('cheer.button')}</span>
    </button>
  );
}
