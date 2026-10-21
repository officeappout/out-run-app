'use client';

/**
 * AgendaDayCard's "delete this workout?" confirmation sheet.
 *
 *   • `DeleteEntrySheetClassic` — the pre-v2 markup, moved here VERBATIM from
 *     AgendaDayCard (sheets batch 3; pinned by agenda-confirm-sheets-parity).
 *     Always mounted, slides by `open`.
 *   • `DeleteEntrySheetV2` — enable_home_v2 (the planner's `v2` prop): the
 *     shared v2 ConfirmSheet.
 *
 * z: backdrop 300 / sheet 301 (.cursorrules) — rendered IN PLACE, inside
 * TrainingPlannerOverlay's transformed `fixed inset-0 z-50` root.
 */

import { motion } from 'framer-motion';
import ConfirmSheet from '@/components/ui/v2/ConfirmSheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

export interface DeleteEntrySheetProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteEntrySheetClassic({ open, onConfirm, onCancel }: DeleteEntrySheetProps) {
  const t = useT(home);
  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/40"
        style={{ zIndex: 300, pointerEvents: open ? 'auto' : 'none' }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
      />
      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 inset-x-0 bg-white rounded-t-2xl"
        style={{
          zIndex: 301,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: open ? 0 : '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        dir="rtl"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {/* Title */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">{t('agenda.delete.title')}</h2>
          <p className="text-xs text-gray-500 mt-1">{t('agenda.delete.body')}</p>
        </div>
        {/* Buttons */}
        <div className="px-5 py-4 space-y-3">
          <button
            type="button"
            className="w-full py-3.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-transform"
            style={{ background: '#EF4444' }}
            onClick={onConfirm}
          >
            {t('agenda.delete.confirm')}
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm text-gray-400 active:scale-[0.98] transition-transform"
            onClick={onCancel}
          >
            {t('agenda.delete.cancel')}
          </button>
        </div>
      </motion.div>
    </>
  );
}

/** enable_home_v2 — the same choice on the shared ConfirmSheet, in place. */
export function DeleteEntrySheetV2({ open, onConfirm, onCancel }: DeleteEntrySheetProps) {
  const t = useT(home);
  return (
    <ConfirmSheet
      open={open}
      onClose={onCancel}
      title={t('agenda.delete.title')}
      description={t('agenda.delete.body')}
      zIndex={SHEET_Z.agendaDeletePanel}
      backdropZIndex={SHEET_Z.agendaDelete}
      portal={false}
      // Clears the planner's bottom chrome, like the classic sheet.
      safeArea="calc(env(safe-area-inset-bottom, 0px) + 80px)"
      actions={[
        { label: t('agenda.delete.confirm'), tone: 'danger', onClick: onConfirm },
        { label: t('agenda.delete.cancel'), tone: 'ghost', onClick: onCancel },
      ]}
    />
  );
}
