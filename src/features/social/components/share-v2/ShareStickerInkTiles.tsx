'use client';

/**
 * "צבע הסטיקר" (SH-5d): white (default) / dark / OUT colours, each on a
 * checkerboard, plus the hint that the sticker is transparent.
 */
import { Check, Image as ImageIcon } from 'lucide-react';
import type { ShareInk } from '../../share-v2/types';
import { CHECKER_STYLE } from './checker';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import type { CommunityKey } from '../social-t';

const INKS: { id: ShareInk; labelKey: CommunityKey; dot: string; ring: string }[] = [
  { id: 'white', labelKey: 'social.share.ink.white', dot: '#ffffff', ring: 'rgba(255,255,255,0.4)' },
  { id: 'dark', labelKey: 'social.share.ink.dark', dot: '#0e1419', ring: '#ffffff' },
  { id: 'brand', labelKey: 'social.share.ink.brand', dot: 'linear-gradient(135deg,#00baf7,#0cf2e3)', ring: '#ffffff' },
];

export default function ShareStickerInkTiles({ value, onChange }: { value: ShareInk; onChange: (ink: ShareInk) => void }) {
  const t = useT(community);
  return (
    <div>
      <div className="flex gap-2 pt-1">
        {INKS.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.id)}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5 transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <span
                className={`relative grid h-14 w-14 place-items-center rounded-[16px] ${on ? 'shadow-[0_0_0_2.5px_#00baf7,0_6px_14px_-8px_rgba(0,186,247,0.7)]' : 'shadow-[0_0_0_1px_rgba(14,27,42,0.1)]'}`}
                style={CHECKER_STYLE}
              >
                <span className="h-6 w-6 rounded-full" style={{ background: o.dot, boxShadow: `0 0 0 2px ${o.ring}` }} />
                {on && (
                  <span className="absolute -left-1.5 -top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-[#00baf7] shadow-[0_0_0_2.5px_#fff]">
                    <Check size={13} strokeWidth={3.2} className="text-white" aria-hidden />
                  </span>
                )}
              </span>
              <span className={`whitespace-nowrap text-[12.5px] ${on ? 'font-black text-v2-deep' : 'font-extrabold text-v2-ink-2'}`}>{t(o.labelKey)}</span>
            </button>
          );
        })}
        <span className="flex-1" aria-hidden />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[16px] bg-[#f1f9fd] px-3 py-2.5">
        <ImageIcon size={18} strokeWidth={2.4} className="shrink-0 text-v2-deep" aria-hidden />
        <span className="text-[12.5px] font-bold text-v2-ink-2">{t('social.share.ink.hint')}</span>
      </div>
    </div>
  );
}
