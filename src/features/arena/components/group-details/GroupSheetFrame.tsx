'use client';

/**
 * GroupDetailsDrawer's sheet chrome (sheets batch 2, 19.10.2026).
 *
 * The group page is a full-height sheet whose cover photo is the drag zone
 * (the caller starts `dragControls` from it). A release closes past 100 px /
 * 500 px/s, an upward pull past 50 px expands to the top, anything else
 * settles at the peek (`groupSheetRelease`, shared by both looks).
 *
 *  - v2 (enable_home_v2): the shared `<Sheet>` ('follow' drag), open at y=0.
 *  - classic: the pre-v2 markup, BYTE-IDENTICAL to the old inline copy
 *    (group-sheet-frame-parity.test.tsx), opening at the peek.
 *
 * z-index (.cursorrules): backdrop z-[80] / sheet z-[81], rendered in place.
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence, animate, type DragControls, type MotionValue } from 'framer-motion';
import Sheet, { SPRING_HERO_SNAP } from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';

export const GROUP_SHEET_CLOSE_PX = 100;
export const GROUP_SHEET_EXPAND_PX = 50;

/** Where a released drag goes: 'close', the top ('expand') or back to the peek. */
export function resolveGroupSheetRelease(offsetY: number, velocityY: number): 'close' | 'expand' | 'peek' {
  if (offsetY > GROUP_SHEET_CLOSE_PX || velocityY > 500) return 'close';
  if (offsetY < -GROUP_SHEET_EXPAND_PX) return 'expand';
  return 'peek';
}

export interface GroupSheetFrameProps {
  isOpen: boolean;
  onClose: () => void;
  v2: boolean;
  y: MotionValue<number>;
  opacity: MotionValue<number>;
  dragControls: DragControls;
  /** Resting offset of the classic sheet (and where short releases settle). */
  peekY: number;
  ariaLabel?: string;
  children: ReactNode;
}

export default function GroupSheetFrame({
  isOpen,
  onClose,
  v2,
  y,
  opacity,
  dragControls,
  peekY,
  ariaLabel,
  children,
}: GroupSheetFrameProps) {
  const release = (offsetY: number, velocityY: number) => {
    const to = resolveGroupSheetRelease(offsetY, velocityY);
    if (to === 'close') onClose();
    else animate(y, to === 'expand' ? 0 : peekY, SPRING_HERO_SNAP);
  };

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        zIndex={SHEET_Z.groupPanel}
        portal={false}
        backdropClassName="bg-black/40"
        backdropStyle={{ backdropFilter: 'blur(4px)' }}
        frameClassName="mx-auto max-w-md"
        scroll="none"
        grabber={false}
        safeArea={false}
        className="flex h-full flex-col"
        y={y}
        frameStyle={{ height: '95vh', opacity }}
        dragControls={dragControls}
        dragToDismiss={{ mode: 'follow', onRelease: release }}
        transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
        ariaLabel={ariaLabel}
      >
        {children}
      </Sheet>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: peekY }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={(_, info) => release(info.offset.y, info.velocity.y)}
            className="kb-sheet fixed bottom-0 left-0 right-0 z-[81] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ height: '95vh', y, opacity }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
