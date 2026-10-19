'use client';

/**
 * HeroSheetFrame — the chrome of the full-height media-hero sheets
 * (WorkoutPreviewDrawer, ParkDetailSheet): blurred backdrop, a panel that
 * tracks the finger downward (closes past 120 px / 500 px/s, else springs
 * back), a full-width drag zone overlaid on the hero, the caller's `y` /
 * `opacity` MotionValues (scroll-chain + drag fade).
 *
 *  - v2 (enable_home_v2): the shared `<Sheet>` in its 'follow' drag mode.
 *  - classic: the pre-v2 markup, BYTE-IDENTICAL to the old inline copies
 *    (hero-sheet-frame-parity.test.tsx). The two strings that differed between
 *    them (panel class: keyboard layer; style: height cap / font) are passed in
 *    VERBATIM by each caller. Retire the classic branch with the flag.
 *
 * z-index: backdrop and panel both z-[100] (.cursorrules "Full-screen overlays").
 * Rendered in place (not portalled), as before.
 */

import type { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence, type DragControls, type MotionValue, type PanInfo } from 'framer-motion';
import Sheet, { SheetDragHandle, SPRING_HERO_SNAP } from './v2/Sheet';
import { SHEET_Z } from './v2/tokens';

export interface HeroSheetFrameProps {
  isOpen: boolean;
  onClose: () => void;
  v2: boolean;
  /** Caller-owned translate (scroll-chain hooks drive it too). */
  y: MotionValue<number>;
  /** Drag fade (a useTransform of `y`). */
  opacity: MotionValue<number>;
  dragControls: DragControls;
  /** classic only — the v2 Sheet applies the same rule itself. */
  onDragEnd: (event: unknown, info: PanInfo) => void;
  /** Height / max-height / font / willChange — in the original key order. */
  frameStyle: Pick<CSSProperties, 'height' | 'maxHeight' | 'fontFamily' | 'willChange'>;
  /** classic panel class string, verbatim. */
  classicClassName: string;
  /** The sheet has inputs → follows the on-screen keyboard (v2). */
  keyboardAware?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}

export default function HeroSheetFrame({
  isOpen,
  onClose,
  v2,
  y,
  opacity,
  dragControls,
  onDragEnd,
  frameStyle,
  classicClassName,
  keyboardAware = false,
  ariaLabel,
  children,
}: HeroSheetFrameProps) {
  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        zIndex={SHEET_Z.overlay}
        backdropZIndex={SHEET_Z.overlay}
        portal={false}
        keyboardAware={keyboardAware}
        backdropClassName="bg-black/40 backdrop-blur-sm"
        scroll="none"
        grabber={false}
        safeArea={false}
        className="relative h-full"
        y={y}
        frameStyle={{ opacity, ...frameStyle }}
        dragControls={dragControls}
        dragToDismiss={{ mode: 'follow', snapBack: SPRING_HERO_SNAP }}
        transition={SPRING_HERO_SNAP}
        ariaLabel={ariaLabel}
      >
        <SheetDragHandle controls={dragControls} />
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
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={onDragEnd}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
            style={{ y, opacity, ...frameStyle }}
            className={classicClassName}
            dir="rtl"
          >
            {/* Drag handle — full-width touch target */}
            <div
              className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-4 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
