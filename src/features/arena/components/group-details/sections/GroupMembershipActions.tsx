'use client';

import { MessageCircle, LogOut, Loader2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface GroupMembershipActionsProps {
  /** The scheduled-run start CTA is shown — it is then the screen's one gradient. */
  startCtaShown: boolean;
  onOpenChat: () => void;
  canLeave: boolean;
  confirmLeave: boolean;
  onAskLeave: () => void;
  onCancelLeave: () => void;
  leaving: boolean;
  onConfirmLeave: () => void;
}

/** Post-join: the community chat button, "עזוב קבוצה" and its confirmation. */
export default function GroupMembershipActions({
  startCtaShown,
  onOpenChat,
  canLeave,
  confirmLeave,
  onAskLeave,
  onCancelLeave,
  leaving,
  onConfirmLeave,
}: GroupMembershipActionsProps) {
  const t = useT(community);
  return (
    <>
      <button
        onClick={onOpenChat}
        className={
          startCtaShown
            // The start CTA above is this screen's one gradient.
            ? 'flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white text-[15px] font-extrabold text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]'
            : 'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.97]'
        }
      >
        <MessageCircle className="w-4 h-4" />
        {t('group.membership.chat')}
      </button>

      {canLeave && !confirmLeave && (
        <button
          onClick={onAskLeave}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold text-red-400 hover:text-red-500 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t('group.membership.leave')}
        </button>
      )}

      {confirmLeave && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-100 dark:border-red-800/40 space-y-3">
          <p className="text-sm font-bold text-red-700 dark:text-red-400 text-center">
            {t('group.membership.leaveConfirm')}
          </p>
          <div className="flex gap-2">
            <button
              disabled={leaving}
              onClick={onConfirmLeave}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              {t('group.membership.leaveYes')}
            </button>
            <button
              onClick={onCancelLeave}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-bold transition-all active:scale-95"
            >
              {t('group.membership.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
