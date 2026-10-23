'use client';

import React from 'react';
import { Bookmark, BookmarkCheck, Play, Users } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

interface Props {
  variant: 'share' | 'invite';
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onStart: () => void;
  onJoin: () => void;
}

const CTA_BG = { background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 44 } as const;

/** Canvas G6-01 / G6-02 footer. SHARE: save + start. INVITE: one CTA, "מצטרפים לאימון". */
export default function SharedLinkFooter({ variant, saved, saving, onSave, onStart, onJoin }: Props) {
  const t = useT(library);
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200/80 bg-white/90 backdrop-blur-lg dark:border-gray-800 dark:bg-gray-900/90">
      <div className="flex items-center gap-3 px-4 py-4">
        {variant === 'invite' ? (
          <button onClick={onJoin} style={CTA_BG} className="flex flex-1 items-center justify-center gap-2 rounded-full font-bold text-white transition-all active:scale-[0.98]">
            <Users size={20} aria-hidden />
            <span>{t('sharedWorkout.link.cta.join')}</span>
          </button>
        ) : (
          <>
            <button
              onClick={onSave}
              disabled={saving || saved}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-extrabold text-cyan-700 shadow-sm ring-1 ring-slate-900/10 transition-all active:scale-[0.98] disabled:opacity-70"
            >
              {saved ? <BookmarkCheck size={18} aria-hidden /> : <Bookmark size={18} aria-hidden />}
              <span>{saved ? t('sharedWorkout.link.cta.saved') : t('sharedWorkout.link.cta.save')}</span>
            </button>
            <button onClick={onStart} style={CTA_BG} className="flex flex-1 items-center justify-center gap-2 rounded-full font-bold text-white transition-all active:scale-[0.98]">
              <Play size={20} fill="currentColor" aria-hidden />
              <span>{t('sharedWorkout.link.cta.start')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
