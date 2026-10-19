'use client';

/**
 * RollingAgenda's drag-reschedule confirmation sheet ("move only this
 * workout / shift the whole schedule / cancel").
 *
 *   • `MoveConfirmSheetClassic` — the pre-v2 markup, moved here VERBATIM from
 *     RollingAgenda (sheets batch 3; pinned by agenda-confirm-sheets-parity).
 *     Always mounted; the caller portals it into <body>.
 *   • `MoveConfirmSheetV2` — enable_home_v2: the shared v2 ConfirmSheet.
 *
 * z: backdrop z-[140] / sheet z-[150] (.cursorrules) — portalled out of
 * TrainingPlannerOverlay's `fixed inset-0 z-50` transformed root, whose
 * stacking context would otherwise trap the sheet under BottomNavbar (z-50).
 */

import { motion } from 'framer-motion';
import ConfirmSheet from '@/components/ui/v2/ConfirmSheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';

export interface MoveConfirmSheetProps {
  open: boolean;
  /** '' while closed. */
  title: string;
  /** Short "from" / "to" dates; shown only while open. */
  fromLabel: string;
  toLabel: string;
  onMoveOnce: () => void;
  onMoveAll: () => void;
  onCancel: () => void;
}

export function MoveConfirmSheetClassic({ open, title, fromLabel, toLabel, onMoveOnce, onMoveAll, onCancel }: MoveConfirmSheetProps) {
  return (
        <>
          <motion.div
            key="drag-confirm-backdrop"
            className="fixed inset-0 z-[140] bg-black/40"
            style={{ pointerEvents: open ? 'auto' : 'none' }}
            animate={{ opacity: open ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCancel}
          />
          {/*
            Fluid Drawer Layout Contract — DO NOT RE-INTRODUCE:
              • No `min-h-[…px]` — the sheet hugs its content height so
                short viewports (small Androids, landscape) never get
                clipped and tall viewports (Pro Max, foldables) never
                stretch into wasted whitespace.
              • No `48px + 24px` style pixel math for nav clearance.
                The bottom inset is owned by `paddingBottom` below, which
                uses `max(rem-floor, env(safe-area-inset-bottom))` so:
                  – iOS notched devices get the home-indicator inset
                  – Android / flat displays get the rem floor
                Both keep the "ביטול" tap target clear of system chrome
                without hard-coding any nav-bar height.
              • No `justify-between` — the container hugs its content, so
                space-between would be a visual no-op and a footgun if a
                fixed height is ever added later by mistake.
          */}
          <motion.div
            key="drag-confirm-sheet"
            className="fixed bottom-0 inset-x-0 z-[150] flex flex-col bg-white rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
            style={{
              paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom, 28px))',
            }}
            initial={{ y: '100%' }}
            animate={{ y: open ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            dir="rtl"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Title — divider line drops naturally below the heading.
                shrink-0 prevents flex compression on tiny viewports. */}
            <div className="px-5 pt-3 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-black text-gray-900">
                {title}
              </h2>
              {open && (
                <p className="text-xs text-gray-500 mt-1">
                  {fromLabel} ← {toLabel}
                </p>
              )}
            </div>

            {/* Action buttons — pt-4 keeps spacing from divider; the
                bottom edge of "ביטול" is protected by the wrapper's
                fluid safe-area paddingBottom above. */}
            <div className="px-5 pt-4 space-y-3 shrink-0">
              <button
                type="button"
                className="w-full py-3.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: '#00C9F2' }}
                onClick={onMoveOnce}
              >
                שנה רק את האימון הזה
              </button>
              <button
                type="button"
                className="w-full py-3.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700 active:scale-[0.98] transition-transform"
                onClick={onMoveAll}
              >
                שנה את כל הלוז קדימה
              </button>
              <button
                type="button"
                className="w-full py-3 text-sm text-gray-400 active:scale-[0.98] transition-transform"
                onClick={onCancel}
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </>
  );
}

/** enable_home_v2 — same actions on the shared ConfirmSheet (portals itself). */
export function MoveConfirmSheetV2({ open, title, fromLabel, toLabel, onMoveOnce, onMoveAll, onCancel }: MoveConfirmSheetProps) {
  return (
    <ConfirmSheet
      open={open}
      onClose={onCancel}
      title={title}
      description={open ? `${fromLabel} ← ${toLabel}` : undefined}
      zIndex={SHEET_Z.agendaMove}
      backdropZIndex={SHEET_Z.agendaMoveBackdrop}
      safeArea="max(1.75rem, env(safe-area-inset-bottom, 28px))"
      actions={[
        { label: 'שנה רק את האימון הזה', tone: 'cta', onClick: onMoveOnce },
        { label: 'שנה את כל הלוז קדימה', tone: 'secondary', onClick: onMoveAll },
        { label: 'ביטול', tone: 'ghost', onClick: onCancel },
      ]}
    />
  );
}
