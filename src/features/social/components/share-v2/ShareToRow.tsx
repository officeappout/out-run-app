'use client';
/**
 * "שיתוף אל" (enable_workout_post_v1, board PostShare): Instagram story, download, copy, more.
 * Round icon buttons with a label; the sheet owns what each does.
 */
import React from 'react';
import { Copy, Download, Instagram, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

export type ShareTarget = 'story' | 'download' | 'copy' | 'more';

const ITEMS: { id: ShareTarget; Icon: LucideIcon; key: 'social.share.to.story' | 'social.share.to.download' | 'social.share.to.copy' | 'social.share.to.more' }[] = [
  { id: 'story', Icon: Instagram, key: 'social.share.to.story' },
  { id: 'download', Icon: Download, key: 'social.share.to.download' },
  { id: 'copy', Icon: Copy, key: 'social.share.to.copy' },
  { id: 'more', Icon: MoreHorizontal, key: 'social.share.to.more' },
];

export default function ShareToRow({ disabled, onPick }: { disabled: boolean; onPick: (t: ShareTarget) => void }) {
  const t = useT(community);
  return (
    <div className="mt-4">
      <div className="text-[13px] font-extrabold text-v2-deep">{t('social.share.to.title')}</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {ITEMS.map(({ id, Icon, key }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(id)}
            className="flex flex-col items-center gap-1.5 disabled:opacity-60"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.95]">
              <Icon size={20} strokeWidth={2.2} aria-hidden />
            </span>
            <span className="whitespace-nowrap text-[12px] font-bold text-v2-ink-2">{t(key)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
