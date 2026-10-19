'use client';

/**
 * OverviewDrawerShell — the ONE pre-start overview drawer for every route /
 * workout-on-route case (owner, 19.10.2026). A DRAGGABLE bottom sheet over the
 * LIVE map with three detents (useOverviewSheet). Layout, top → bottom:
 *   grabber + back · sticky summary header (drag zone) · journey strip ·
 *   scroll body (the consumer's content — usually an OverviewLegAxis) · CTA.
 *
 * Extracted from HybridOverviewScreen (route + stops), which now renders
 * through it byte-for-byte (parity snapshots in overview/__tests__). The
 * consumer owns the content; the shell owns geometry, gestures and map sync.
 */

import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';
import { useOverviewSheet } from './useOverviewSheet';

export interface OverviewDrawerShellProps {
  /** Home v2 look (enable_home_v2); false = the pre-v2 drawer, unchanged. */
  v2: boolean;
  onBack: () => void;
  /** Sticky summary (title · time · …) — also a drag zone. */
  header: ReactNode;
  /** Journey strip under the header (shown at every detent). Omit → no row. */
  strip?: ReactNode;
  /** Scroll body content. */
  children: ReactNode;
  /** Sticky CTA row content, pinned to the visible card bottom. */
  cta: ReactNode;
}

export default function OverviewDrawerShell({ v2, onBack, header, strip, children, cta }: OverviewDrawerShellProps) {
  const {
    dragControls, cardRef, currentAnchor, controls, dragConstraints,
    sheetY, cardHeight, springRef, onDragEndSnap, scrollBodyRef,
  } = useOverviewSheet();

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none" dir="rtl">
      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={dragConstraints}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={() => springRef.current?.stop()}
        onDragEnd={onDragEndSnap}
        animate={controls}
        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none"
        // Route-preview (MAP_OVERVIEW_CHROME_V1): `touch-action:none` lives ONLY on the
        // drag handle (grabber/header), not on this wrapper — `dragListener={false}`
        // means framer drags only via the handle, and leaving this `auto` lets the
        // scroll body scroll natively at full AND keeps the strip's pan-x.
        // Flag OFF = `none` (byte-identical).
        style={{ y: sheetY, touchAction: MAP_OVERVIEW_CHROME_V1 ? undefined : 'none' }}
      >
        <motion.div
          ref={cardRef}
          className={v2
            ? 'absolute top-0 left-0 right-0 bg-v2-surface rounded-t-[28px] shadow-v2-sheet pointer-events-auto flex flex-col overflow-hidden'
            : 'absolute top-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden'}
          style={{
            height: cardHeight,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          data-anchor={currentAnchor}
        >
          {/* grabber = the drag handle (+ back button) */}
          <div className="relative pt-3 px-4 flex-shrink-0" onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none', cursor: 'grab' }}>
            {v2
              ? <div className="mx-auto h-1.5 w-10 rounded-full bg-v2-pill-border" />
              : <div className="mx-auto rounded-full" style={{ width: 36, height: 5, background: '#E2E8F0' }} />}
            <button type="button" onClick={onBack} aria-label="חזור"
              onPointerDown={(e) => e.stopPropagation()}
              className={v2
                ? 'absolute top-3 left-4 grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]'
                : 'absolute top-3 left-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform'}>
              <ArrowRight size={v2 ? 18 : 16} className={v2 ? 'text-v2-ink' : 'text-gray-600'} />
            </button>
          </div>

          {/* Sticky summary header (point 3) — fixed while the body scrolls; doubles
              as a drag zone (same onPointerDown → dragControls.start pattern). */}
          <div
            className={v2 ? 'px-4 pt-1 pb-2.5 pl-16 flex-shrink-0' : 'px-4 pt-0.5 pb-2 flex-shrink-0'}
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none', cursor: 'grab' }}
          >
            {header}
          </div>

          {/* Journey strip — shown at EVERY detent incl. peek (points 9/10). */}
          {strip != null && (
            <div className="px-4 pb-2.5 flex-shrink-0">
              {strip}
            </div>
          )}

          {/* scroll body — overflow-x-hidden pins the content horizontally. */}
          <div
            ref={scrollBodyRef}
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-2"
            // #16 detent lock (MAP_OVERVIEW_CHROME_V1): native content scroll only at
            // `full` (pan-y); at peek/half `none` so every vertical gesture drives the
            // sheet via the non-passive handler. Flag OFF = unset.
            style={MAP_OVERVIEW_CHROME_V1 ? { touchAction: currentAnchor === 'full' ? 'pan-y' : 'none' } : undefined}
          >
            {children}
            <div style={{ height: 8 }} />
          </div>

          {/* sticky CTA — pinned to the visible card bottom at every detent */}
          <div className="px-4 pt-2 flex-shrink-0">
            {cta}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
