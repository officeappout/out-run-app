'use client';

import { Lock, Copy, Check, Share2 } from 'lucide-react';
import { APP_ORIGIN_FALLBACK } from '../utils/group-details-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/**
 * Invite code panel — private group members / creator. The code is fetched
 * on demand (useGroupInviteCode); the caller renders this only once it exists.
 */
export default function InviteCodePanel({
  code,
  groupName,
  inviteCopied,
  setInviteCopied,
}: {
  code: string;
  groupName: string;
  /** Lives in the drawer (survives the panel re-mounting). */
  inviteCopied: boolean;
  setInviteCopied: (copied: boolean) => void;
}) {
  const t = useT(community);
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/40 space-y-3" dir="rtl">
      <div className="flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5 text-gray-400" />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('group.invite.title')}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 text-center font-mono text-2xl font-black tracking-[0.25em] text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-xl py-3 border border-gray-200 dark:border-gray-600 select-all">
          {code}
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code ?? '').catch(() => {});
            setInviteCopied(true);
            setTimeout(() => setInviteCopied(false), 2000);
          }}
          aria-label={inviteCopied ? t('group.invite.copied') : t('group.invite.copy')}
          className="w-12 h-12 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
        >
          {inviteCopied
            ? <Check className="w-4 h-4 text-emerald-500" />
            : <Copy className="w-4 h-4 text-gray-500" />
          }
        </button>
      </div>
      <button
        onClick={() => {
          const origin = typeof window !== 'undefined' ? window.location.origin : APP_ORIGIN_FALLBACK;
          const link = `${origin}/join/${code}`;
          const text = t('group.invite.shareText', { groupName, code, link });
          if (typeof navigator !== 'undefined' && navigator.share) {
            navigator.share({ title: groupName, text, url: link }).catch(() => {});
          } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
          }
        }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-sm font-black transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20"
      >
        <Share2 className="w-4 h-4" />
        {t('group.invite.whatsapp')}
      </button>
    </div>
  );
}
