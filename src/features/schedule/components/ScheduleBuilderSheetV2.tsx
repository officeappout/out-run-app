'use client';

/**
 * ScheduleBuilderSheetV2 — the enable_home_v2 shell of ScheduleBuilderDrawer,
 * on the shared `<Sheet>` (kept out of the drawer so that file doesn't grow).
 *
 * Preserves the drawer's mechanics 1:1: z-[101] backdrop + panel (clears
 * OfflineBanner — .cursorrules), 92vh, the 'follow' drag started from the
 * handle row (caller's `dragControls`), the caller's `y` / `opacity` motion
 * values (useSheetScrollChain swipe-to-dismiss from inside the scroll body),
 * and the drawer's own release rule (> CLOSE_THRESHOLD px or > 500 px/s
 * closes, else spring back). Only the chrome is v2: tinted surface, v2
 * grabber, header with the sheet title + IconButton close.
 */

import type { ReactNode, Ref } from 'react';
import { animate, type DragControls, type MotionValue, type Transition } from 'framer-motion';
import { X } from 'lucide-react';
import Sheet, { SheetGrabber } from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';

export interface ScheduleBuilderSheetV2Props {
  isOpen: boolean;
  /** The drawer's handleClose (resets `y`, then closes). */
  onClose: () => void;
  y: MotionValue<number>;
  opacity: MotionValue<number>;
  dragControls: DragControls;
  /** useSheetScrollChain's ref — the scroll body. */
  scrollRef: Ref<HTMLDivElement>;
  /** Release distance (px) that closes. */
  closeThreshold: number;
  spring: Transition;
  children: ReactNode;
}

export default function ScheduleBuilderSheetV2({
  isOpen,
  onClose,
  y,
  opacity,
  dragControls,
  scrollRef,
  closeThreshold,
  spring,
  children,
}: ScheduleBuilderSheetV2Props) {
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      // Backdrop and panel both z-[101] (.cursorrules) — unchanged.
      zIndex={SHEET_Z.aboveOffline}
      backdropZIndex={SHEET_Z.aboveOffline}
      portal={false}
      keyboardAware={false}
      backdropStyle={{ backdropFilter: 'blur(4px)' }}
      frameClassName="max-w-md mx-auto"
      frameStyle={{ height: '92vh', opacity }}
      surface="rounded-t-[28px] bg-v2-surface shadow-v2-sheet"
      className="flex h-full flex-col"
      safeArea={false}
      scroll="none"
      grabber={false}
      transition={spring}
      y={y}
      dragControls={dragControls}
      dragToDismiss={{
        mode: 'follow',
        maxOffset: 500,
        elastic: 0.08,
        onRelease: (offsetY, velocityY) => {
          if (offsetY > closeThreshold || velocityY > 500) onClose();
          else animate(y, 0, spring);
        },
      }}
      ariaLabel="בואו נבנה לוז"
    >
      {/* Handle row — the drag zone; the close button doesn't start a drag. */}
      <div
        className="shrink-0 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => dragControls.start(e)}
        style={{ touchAction: 'none' }}
      >
        <SheetGrabber />
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
          <h2 className="whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">בואו נבנה לוז</h2>
          <IconButton
            aria-label="סגור"
            tone="white-ring"
            size={36}
            className="shrink-0"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
        {children}
      </div>
    </Sheet>
  );
}
