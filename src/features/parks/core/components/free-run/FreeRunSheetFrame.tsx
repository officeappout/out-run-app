'use client';

/**
 * FreeRunDrawer's sheet chrome, in one place (sheets batch 2, 19.10.2026).
 *
 * The free-run drawer and its three sub-sheets (goal / extras / leg plan) used
 * to each hand-roll a backdrop + draggable panel + handle + header. Here:
 *  - flag ON (enable_home_v2): the shared v2 `<Sheet>` — handle-only drag that
 *    closes past 80 px / 300 px/s, the same spring, the same z-bands.
 *  - flag OFF: the pre-v2 markup, BYTE-IDENTICAL to the old inline copies
 *    (pinned by free-run-sheet-frame-parity.test.tsx). Retire with the flag.
 *
 * z-index (.cursorrules): the drawer z-[100]; GoalSheet z-[102]/[103];
 * ExtrasSheet / LegPlanSheet z-[104]/[105] (mutually exclusive).
 */

import type { CSSProperties, ReactNode } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import Sheet, { SheetHeader } from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';

/** The drawer's spring (unchanged). */
export const FREE_RUN_SPRING = { type: 'spring', damping: 28, stiffness: 300 } as const;
/** The drawer's dismiss rule: handle drag past 80 px or a 300 px/s flick. */
export const FREE_RUN_DRAG = { distance: 80, velocity: 300, elastic: 0.25 } as const;
const SAFE_AREA = 'calc(env(safe-area-inset-bottom, 0px) + 16px)';
const V2_HEADER_CLASS = 'flex items-center justify-between px-5 pb-4';

/** The legacy handle pill (flag off). */
function LegacyHandlePill() {
  return <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />;
}

/** The legacy sub-sheet header: 16px title, optional gray close (flag off). */
function LegacySubSheetHeader({ title, className, onClose }: { title: string; className: string; onClose?: () => void }) {
  if (!onClose) {
    return (
      <div className={className}>
        <h2 className="text-base font-black text-gray-900">{title}</h2>
      </div>
    );
  }
  return (
    <div className={className}>
      <h2 className="text-base font-black text-gray-900">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
        aria-label="סגור"
      >
        <X size={14} className="text-gray-600" />
      </button>
    </div>
  );
}

// ── Sub-sheets (goal / extras / leg plan) ────────────────────────────────────

export interface FreeRunSubSheetLegacy {
  /** Panel class string, verbatim from the old inline copy. */
  panelClassName: string;
  /** Panel style, verbatim from the old inline copy. */
  panelStyle: CSSProperties;
  /** Backdrop class string, verbatim. */
  backdropClassName: string;
  /** Handle row class string, verbatim. */
  handleClassName: string;
  /** Header row class string, verbatim. */
  headerClassName: string;
  /** The old header had a close button (goal / leg plan) or only a title (extras). */
  headerClose: boolean;
}

export interface FreeRunSubSheetProps {
  isOpen: boolean;
  onClose: () => void;
  v2: boolean;
  title: string;
  /** 'goal' = z-[102]/[103]; 'extras' = z-[104]/[105]. */
  tier: 'goal' | 'extras';
  /**
   * v2 surface: 'scroll' (capped at 90dvh, the whole sheet scrolls), 'column'
   * (capped at 80vh, header pinned, the caller's list scrolls), 'plain'.
   */
  v2Layout: 'scroll' | 'column' | 'plain';
  /** Has inputs → follows the on-screen keyboard (kb-sheet / kb-cap). */
  keyboardAware?: boolean;
  legacy: FreeRunSubSheetLegacy;
  children: ReactNode;
}

export function FreeRunSubSheet({
  isOpen,
  onClose,
  v2,
  title,
  tier,
  v2Layout,
  keyboardAware = false,
  legacy,
  children,
}: FreeRunSubSheetProps) {
  const dragControls = useDragControls();

  if (v2) {
    const column = v2Layout === 'column';
    const header = <SheetHeader title={title} onClose={onClose} closeLabel="סגור" className={V2_HEADER_CLASS} />;
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        zIndex={tier === 'goal' ? SHEET_Z.freeRunGoalPanel : SHEET_Z.freeRunExtrasPanel}
        portal={false}
        keyboardAware={keyboardAware}
        backdropClassName="bg-black/30 pointer-events-auto"
        frameClassName="pointer-events-auto"
        scroll={v2Layout === 'scroll' ? 'panel' : 'none'}
        className={v2Layout === 'scroll' ? 'max-h-[90dvh]' : column ? 'flex max-h-[80vh] flex-col' : ''}
        safeArea={SAFE_AREA}
        transition={FREE_RUN_SPRING}
        dragToDismiss={FREE_RUN_DRAG}
        grabberClassName={column ? 'flex justify-center pt-3 pb-2 shrink-0' : 'flex justify-center pt-3 pb-2'}
        ariaLabel={title}
        header={column ? <div className="shrink-0">{header}</div> : header}
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
            onClick={onClose}
            className={legacy.backdropClassName}
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={legacy.panelClassName}
            dir="rtl"
            style={legacy.panelStyle}
          >
            <div
              className={legacy.handleClassName}
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <LegacyHandlePill />
            </div>

            <LegacySubSheetHeader
              title={title}
              className={legacy.headerClassName}
              onClose={legacy.headerClose ? onClose : undefined}
            />

            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── The free-run drawer itself ───────────────────────────────────────────────

export interface FreeRunMainFrameProps {
  onClose: () => void;
  v2: boolean;
  title: string;
  children: ReactNode;
}

/**
 * The drawer (z-[100]): a transparent scrim that closes on tap, the panel
 * rising 400 px. Mounted only while shown (no exit animation) — as before.
 */
export function FreeRunMainFrame({ onClose, v2, title, children }: FreeRunMainFrameProps) {
  const dragControls = useDragControls();

  if (v2) {
    return (
      <Sheet
        open
        onClose={onClose}
        layout="nested"
        zIndex={SHEET_Z.overlay}
        portal={false}
        keyboardAware={false}
        backdropClassName=""
        frameClassName="w-full"
        // Capped at 90dvh and scrollable — with strength stations on + "אחר כך"
        // the stack is ~700px, taller than a small phone. Drag: handle only.
        scroll="panel"
        className="max-h-[90dvh]"
        safeArea={SAFE_AREA}
        enterY={400}
        transition={FREE_RUN_SPRING}
        dragToDismiss={FREE_RUN_DRAG}
        grabberClassName="flex justify-center pt-3 pb-2"
        ariaLabel={title}
        header={<SheetHeader title={title} onClose={onClose} closeLabel="סגור" className={V2_HEADER_CLASS} />}
      >
        {children}
      </Sheet>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Scrim */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- legacy markup, kept byte-identical */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 300) onClose();
        }}
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 pointer-events-auto"
      >
        <div
          className="bg-white rounded-t-3xl shadow-2xl"
          dir="rtl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none' }}
          >
            <LegacyHandlePill />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-4">
            <h2 className="text-base font-black text-gray-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform shrink-0"
              aria-label="סגור"
            >
              <X size={14} className="text-gray-600" />
            </button>
          </div>

          {children}
        </div>
      </motion.div>
    </div>
  );
}
