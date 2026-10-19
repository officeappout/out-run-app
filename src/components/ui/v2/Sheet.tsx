'use client';

/**
 * Sheet (v2) — the ONE modal bottom sheet. Replaces the hand-rolled
 * backdrop + `initial={{ y: '100%' }}` panel + grabber + title/close row +
 * safe-area padding that used to be copied into every sheet.
 *
 *   <Sheet open={isOpen} onClose={onClose} title="הוסף אימון" zIndex={SHEET_Z.drawer}>
 *     …body…
 *   </Sheet>
 *
 * Anatomy (top → bottom): grabber · header (default: 22px title + close
 * IconButton, or your own `header`) · body (`children`) · sticky `footer`.
 *
 * Layouts
 *   • `split` (default) — backdrop and panel are siblings; the backdrop sits
 *     one z-step under the panel (`backdropZIndex`, default zIndex − 1) and
 *     the panel spans the viewport width (narrow it with `frameClassName`).
 *   • `nested` — the panel lives inside the backdrop (a bottom-aligned flex
 *     row), so it fades in with the backdrop as it slides; centred, capped by
 *     `frameClassName` (default `w-full max-w-md`).
 *
 * Scroll
 *   • `body` (default) — header/footer stay put, only the body scrolls.
 *   • `panel` — the whole surface scrolls (header included).
 *   • `none` — nothing scrolls; the caller owns the layout of `children`.
 *
 * Drag-to-dismiss (`dragToDismiss`) is opt-in: by default only the grabber
 * zone starts a drag (content keeps its own native scroll); a release past
 * `distance` px or faster than `velocity` px/s closes the sheet
 * (`shouldDismissSheet`, unit-tested). `handleOnly: false` drags the whole panel.
 *
 * The surface pads its bottom by `safeArea` (default
 * `max(1.5rem, env(safe-area-inset-bottom))`).
 *
 * Keyboard (`keyboardAware`, default true): the shared keyboard-inset layer's
 * classes from globals.css (#455, enable_keyboard_insets_v1) — nested: the
 * backdrop gets `kb-fit` (ends at the keyboard), the surface `kb-cap`; split:
 * the frame gets `kb-sheet` (sits on the keyboard), the surface `kb-cap`.
 * They read `--kb-inset`, which is 0 unless that flag's controller is
 * running — so with the flag off they are a no-op.
 *
 * z-index: only values from the documented budget (`SHEET_Z`, .cursorrules).
 * Portals to document.body by default (escapes stacking contexts and
 * containing blocks); `portal={false}` renders in place, for sheets whose
 * existing mount relies on the parent's stacking.
 */

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo, type Transition } from 'framer-motion';
import { X } from 'lucide-react';
import IconButton from './IconButton';
import { SHEET_Z, SPRING_SHEET, type SheetZIndex } from './tokens';
import { DEFAULT_SHEET_DISMISS, sheetBottomPadding, shouldDismissSheet } from './logic';

/** The v2 sheet surface (rounded top, white, sheet shadow). */
export const SHEET_SURFACE_CLASS = 'rounded-t-[28px] bg-white shadow-v2-sheet';
/** The v2 grabber pill. */
export const SHEET_GRABBER_CLASS = 'h-1.5 w-10 rounded-full bg-v2-pill-border';
/** The v2 sheet title type (22px black, tight tracking). */
export const SHEET_TITLE_CLASS = 'text-[22px] font-black !tracking-[-0.02em] text-v2-ink';

export const DEFAULT_SHEET_SAFE_AREA = 'max(1.5rem, env(safe-area-inset-bottom))';

export interface SheetDragOptions {
  /** Release distance (px) that closes. Default 120. */
  distance?: number;
  /** Release velocity (px/s) that closes. Default 500; 0 = distance only. */
  velocity?: number;
  /** framer-motion dragElastic. Default 0.2. */
  elastic?: number;
  /** Only the grabber zone starts a drag (default true). */
  handleOnly?: boolean;
}

export interface SheetProps {
  open: boolean;
  /** Backdrop tap, close button and drag-dismiss all call this. */
  onClose: () => void;
  children?: ReactNode;

  /** Default header: this title (22px) + a round close button. Ignored when `header` is set. */
  title?: ReactNode;
  /** Replaces the default header row entirely. */
  header?: ReactNode;
  /** Hide the default header's close button. */
  hideClose?: boolean;
  /** aria-label of the close button. Default 'סגירה'. */
  closeLabel?: string;
  /** Pinned under the body (scroll="body"/"none"); scrolls with it for scroll="panel". */
  footer?: ReactNode;

  /** Show the grabber pill. Default true. */
  grabber?: boolean;
  /** Classes of the grabber row. Default `flex justify-center pt-3 pb-1`. */
  grabberClassName?: string;

  layout?: 'split' | 'nested';
  scroll?: 'body' | 'panel' | 'none';
  /** Panel z-index — a documented budget value. Default SHEET_Z.overlay (100). */
  zIndex?: SheetZIndex;
  /** split only: backdrop z-index. Default zIndex − 1 (must also be a budget value). */
  backdropZIndex?: SheetZIndex;

  /** Render a dimming backdrop. Default true. */
  backdrop?: boolean;
  backdropClassName?: string;
  backdropStyle?: CSSProperties;
  /** Tap on the backdrop closes. Default true. */
  dismissOnBackdrop?: boolean;

  /** Classes on the moving frame (width cap). Default `w-full max-w-md` (nested) / '' (split). */
  frameClassName?: string;
  /** Extra classes on the surface (max-height, padding…). */
  className?: string;
  /** Extra classes on the scroll body (scroll="body"). */
  bodyClassName?: string;
  /** Safe-area bottom padding expression, or false for none. */
  safeArea?: string | false;

  /** Opt-in drag-to-dismiss. `true` = defaults. */
  dragToDismiss?: boolean | SheetDragOptions;
  /** Where the panel slides in from (framer `y`). Default '100%'. */
  enterY?: number | string;
  /** Slide/spring transition. Default SPRING_SHEET. */
  transition?: Transition;

  portal?: boolean;
  dir?: 'rtl' | 'ltr';
  /** Accessible name when there is no `title` (e.g. a custom header). */
  ariaLabel?: string;
  /** Follow the on-screen keyboard via the kb-fit / kb-sheet / kb-cap layer. Default true. */
  keyboardAware?: boolean;
}

/** Grabber pill row — exported for surfaces that aren't a modal Sheet. */
export function SheetGrabber({ className = 'flex justify-center pt-3 pb-1' }: { className?: string }) {
  return (
    <div className={className} data-v2-sheet-grabber>
      <div className={SHEET_GRABBER_CLASS} />
    </div>
  );
}

/** Default header row: title + round close button. */
export function SheetHeader({
  title,
  titleId,
  onClose,
  hideClose = false,
  closeLabel = 'סגירה',
  className = 'flex items-center justify-between px-5 pb-2',
}: {
  title: ReactNode;
  titleId?: string;
  onClose?: () => void;
  hideClose?: boolean;
  closeLabel?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 id={titleId} className={SHEET_TITLE_CLASS}>{title}</h2>
      {!hideClose && onClose && (
        <IconButton aria-label={closeLabel} tone="surface" size={36} onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
}

export default function Sheet({
  open,
  onClose,
  children,
  title,
  header,
  hideClose = false,
  closeLabel,
  footer,
  grabber = true,
  grabberClassName,
  layout = 'split',
  scroll = 'body',
  zIndex = SHEET_Z.overlay,
  backdropZIndex,
  backdrop = true,
  backdropClassName = 'bg-black/40',
  backdropStyle,
  dismissOnBackdrop = true,
  frameClassName,
  className = '',
  bodyClassName = '',
  safeArea = DEFAULT_SHEET_SAFE_AREA,
  dragToDismiss = false,
  enterY = '100%',
  transition = SPRING_SHEET,
  portal = true,
  dir = 'rtl',
  ariaLabel,
  keyboardAware = true,
}: SheetProps) {
  const kbSurface = keyboardAware ? 'kb-cap' : '';
  const titleId = useId();
  const controls = useDragControls();
  // Portal only after mount (SSR has no document.body).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const drag = dragToDismiss ? (dragToDismiss === true ? {} : dragToDismiss) : null;
  const handleOnly = drag ? drag.handleOnly !== false : false;
  const rule = {
    distance: drag?.distance ?? DEFAULT_SHEET_DISMISS.distance,
    velocity: drag?.velocity ?? DEFAULT_SHEET_DISMISS.velocity,
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (shouldDismissSheet(info.offset.y, info.velocity.y, rule)) onClose();
  };

  const headerNode = header ?? (title != null ? (
    <SheetHeader title={title} titleId={titleId} onClose={onClose} hideClose={hideClose} closeLabel={closeLabel} />
  ) : null);

  const grabberNode = grabber ? (
    handleOnly ? (
      <div
        onPointerDown={(e) => controls.start(e)}
        style={{ touchAction: 'none' }}
        className="cursor-grab active:cursor-grabbing"
      >
        <SheetGrabber className={grabberClassName} />
      </div>
    ) : (
      <SheetGrabber className={grabberClassName} />
    )
  ) : null;

  const surfaceScroll =
    scroll === 'panel' ? 'overflow-y-auto overscroll-contain'
      : scroll === 'body' ? 'flex flex-col overflow-hidden'
        : 'overflow-hidden';

  const surface = (
    <div
      data-v2-sheet-surface
      className={`${kbSurface} ${SHEET_SURFACE_CLASS} ${surfaceScroll} ${className}`}
      style={{ paddingBottom: sheetBottomPadding(safeArea) }}
    >
      {grabberNode}
      {scroll === 'body' ? (
        <>
          {headerNode && <div className="shrink-0">{headerNode}</div>}
          <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>{children}</div>
          {footer && <div className="shrink-0" data-v2-sheet-footer>{footer}</div>}
        </>
      ) : (
        <>
          {headerNode}
          {children}
          {footer}
        </>
      )}
    </div>
  );

  const frame = (
    <motion.div
      key="v2-sheet-frame"
      role="dialog"
      aria-modal={backdrop ? true : undefined}
      aria-labelledby={title != null && !header ? titleId : undefined}
      aria-label={title != null && !header ? undefined : ariaLabel}
      data-v2-sheet-modal={layout}
      dir={dir}
      initial={{ y: enterY }}
      animate={{ y: 0 }}
      exit={{ y: enterY }}
      transition={transition}
      drag={drag ? 'y' : false}
      dragListener={drag ? !handleOnly : undefined}
      dragControls={drag && handleOnly ? controls : undefined}
      dragConstraints={drag ? { top: 0, bottom: 0 } : undefined}
      dragElastic={drag ? drag.elastic ?? 0.2 : undefined}
      onDragEnd={drag ? onDragEnd : undefined}
      onClick={layout === 'nested' ? (e) => e.stopPropagation() : undefined}
      className={
        layout === 'nested'
          ? `${frameClassName ?? 'w-full max-w-md'} ${backdrop ? '' : 'pointer-events-auto'}`
          : `${keyboardAware ? 'kb-sheet ' : ''}fixed inset-x-0 bottom-0 ${frameClassName ?? ''}`
      }
      style={layout === 'split' ? { zIndex } : undefined}
    >
      {surface}
    </motion.div>
  );

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const closeOnBackdrop = dismissOnBackdrop ? onClose : undefined;

  const tree = (
    <AnimatePresence>
      {open && (layout === 'nested' ? (
        <motion.div
          key="v2-sheet-backdrop"
          {...fade}
          data-v2-sheet-backdrop
          onClick={backdrop ? closeOnBackdrop : undefined}
          className={`${keyboardAware ? 'kb-fit ' : ''}fixed inset-0 flex items-end justify-center ${backdrop ? backdropClassName : 'pointer-events-none'}`}
          style={{ zIndex, ...(backdrop ? backdropStyle : undefined) }}
        >
          {frame}
        </motion.div>
      ) : (
        [
          backdrop ? (
            <motion.div
              key="v2-sheet-backdrop"
              {...fade}
              data-v2-sheet-backdrop
              onClick={closeOnBackdrop}
              className={`fixed inset-0 ${backdropClassName}`}
              style={{ zIndex: backdropZIndex ?? zIndex - 1, ...backdropStyle }}
            />
          ) : null,
          frame,
        ]
      ))}
    </AnimatePresence>
  );

  if (!portal) return tree;
  if (!mounted) return null;
  return createPortal(tree, document.body);
}
