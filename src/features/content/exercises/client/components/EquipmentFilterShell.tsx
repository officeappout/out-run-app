'use client';

/**
 * EquipmentFilterShell — the outer chrome of EquipmentFilterSheet, by mode
 * (extracted from it so the sheet file stays content-only):
 *   • profile mode → full-screen surface sliding in from the side (z-[102]);
 *   • filter / inline-onboarding, enable_home_v2 ON → the shared v2 <Sheet>;
 *   • filter / inline-onboarding, flag OFF → the classic bottom sheet.
 * The caller portals it to document.body (EquipmentFilterSheet).
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sheet from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';

export interface EquipmentFilterShellProps {
  isOpen: boolean;
  onClose: () => void;
  isProfileMode: boolean;
  v2: boolean;
  /** Header + body + footer (shared by every mode). */
  children: ReactNode;
}

export default function EquipmentFilterShell({ isOpen, onClose, isProfileMode, v2, children }: EquipmentFilterShellProps) {
  // v2 (filter / inline-onboarding): the shared Sheet owns backdrop (z-[70],
  // blurred), panel (z-[71]), spring, grabber and whole-panel
  // drag-to-dismiss (> 120 px) — the classic branch's values. Profile mode
  // stays full-screen (nothing behind it to dim or swipe past).
  return v2 && !isProfileMode ? (
    <Sheet
      open={isOpen}
      onClose={onClose}
      ariaLabel="ציוד ומיקום"
      zIndex={SHEET_Z.filterPanel}
      backdropZIndex={SHEET_Z.filter}
      backdropStyle={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      scroll="none"
      className="flex max-h-[85vh] flex-col"
      safeArea={false}
      grabberClassName="flex justify-center pb-2 pt-2.5"
      dragToDismiss={{ handleOnly: false, distance: 120, velocity: 0, elastic: 0.2 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      portal={false}
    >
      {children}
    </Sheet>
  ) : (
    <AnimatePresence>
      {isOpen && (
        isProfileMode ? (
          // z-[102] — NOT z-[71] (that's the filter/inline bottom-sheet
          // tier, correct for those but far below SettingsModal's z-[101]).
          // This full-screen branch is launched FROM INSIDE SettingsModal
          // (the "הציוד שלי" row) and must render above it, same stacking
          // relationship as z-[130]/[131] (LegalDocModal) needing to clear
          // z-[120] (HealthConnectDisclosureModal) which opens it inline —
          // see .cursorrules' Z-Index Budget, updated with this entry.
          // Portal mount itself was already correct (createPortal to
          // document.body, same target every other full-screen overlay in
          // this app uses, including SettingsModal) — the stacking bug was
          // purely the numeric gap between z-[71] and SettingsModal's
          // z-[101], not a stacking-context/portal issue.
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className={`fixed inset-0 z-[102] flex flex-col ${v2 ? 'bg-v2-surface' : 'bg-white'}`}
            dir="rtl"
          >
            {children}
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 z-[70]"
              style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => { if (info.offset.y > 120) onClose(); }}
              className="fixed bottom-0 left-0 right-0 z-[71] bg-white rounded-t-3xl shadow-drawer max-h-[85vh] flex flex-col"
              dir="rtl"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              {children}
            </motion.div>
          </>
        )
      )}
    </AnimatePresence>
  );
}
