'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GroupMember } from '@/types/community.types';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface RemoveMemberModalProps {
  member: GroupMember | null;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** "הסרת חבר/ה" confirmation (z 95, above the sheet). */
export default function RemoveMemberModal({ member, removing, onCancel, onConfirm }: RemoveMemberModalProps) {
  const t = useT(community);
  return (
    <AnimatePresence>
      {member && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center p-5"
          style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => !removing && onCancel()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-4"
            dir="rtl"
          >
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
                <LogOut className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                {t('group.removeMember.title')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t.rich('group.removeMember.question', {
                  name: member.name,
                  b: (chunks: ReactNode) => <span className="font-bold text-gray-800 dark:text-gray-200">{chunks}</span>,
                })}
              </p>
              <p className="text-xs text-gray-400">{t('group.removeMember.note')}</p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={removing}
                onClick={onConfirm}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : t('group.removeMember.confirm')}
              </button>
              <button
                disabled={removing}
                onClick={onCancel}
                className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-bold active:scale-95 transition-all"
              >
                {t('group.removeMember.cancel')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
