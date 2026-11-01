'use client';

/**
 * RunDrawerSheet — the ATTACHED bottom sheet of the run / walk / bike players
 * (enable_run_player_drawer_v1, boards H-1…H-5; same family as the strength
 * drawer #712): full width, flush with the bottom edge, rounded top, drag
 * handle, content-sized (no blank bands). Two snaps — compact and large — with
 * the same gesture rules as the old floating drawer: drag down from compact
 * hands over to the session list. The floating buttons sit above its top edge.
 *
 * The outer wrapper (cardRef) covers buttons + sheet, so the map camera keeps
 * the runner's marker above the buttons at either snap.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { getRememberedDrawerSnap, rememberDrawerSnap, resolveDrawerGesture, toggleDrawerSnap, type RunDrawerSnap } from '../run-drawer-logic';
import { useTogetherLocale } from '@/features/workout-engine/together/hooks/useTogetherLocale';
import { clampPage, pageAfterSwipe } from './unified-chrome-logic';

/** enable_unified_player_v1: one drawer page (blue dots + a small caption on top). */
export interface RunDrawerPage {
  id: string;
  caption: string;
  compact: React.ReactNode;
  large: React.ReactNode;
}

export interface RunDrawerSheetProps {
  compact: React.ReactNode;
  large: React.ReactNode;
  /** Replaces the content (e.g. the me-vs-them panel) while set. */
  override?: React.ReactNode;
  /** Floating buttons above the sheet's top edge. */
  buttons: React.ReactNode;
  onOpenList: () => void;
  cardRef: (node: HTMLDivElement | null) => void;
  /** Reports the wrapper height (px) so the rail can stay above the buttons. */
  onHeight?: (h: number) => void;
  className?: string;
  /** enable_unified_player_v1: pages replace compact / large; a sideways swipe or a dot turns them. */
  pages?: RunDrawerPage[];
  /** enable_unified_player_v1: small icons in the sheet's top corner (settings, partner). */
  corner?: React.ReactNode;
  /** enable_unified_player_v1: jump to a page for a while (a closed lap → the lap page), then back. New nonce = new jump. */
  pageRequest?: { id: string; nonce: number; holdMs: number } | null;
  /** enable_unified_player_v1: caption over the override (e.g. "me vs partner"). */
  overrideCaption?: string;
}

export default function RunDrawerSheet({ compact, large, override, buttons, onOpenList, cardRef, onHeight, className = '', pages, corner, pageRequest, overrideCaption }: RunDrawerSheetProps) {
  const t = useT(together);
  const { isRtl } = useTogetherLocale();
  const [pageRaw, setPage] = useState(0);
  const pageCount = pages?.length ?? 0;
  const page = clampPage(pageRaw, pageCount);
  const downAt = useRef<{ x: number; y: number } | null>(null);

  // A page jump: show the asked page, then return to where the user was.
  const reqIndex = pageRequest && pages ? pages.findIndex((pg) => pg.id === pageRequest.id) : -1;
  useEffect(() => {
    if (!pageRequest || reqIndex < 0) return;
    let before = 0;
    setPage((p) => { before = p; return reqIndex; });
    const id = setTimeout(() => setPage(before), pageRequest.holdMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRequest?.nonce]);
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const [snap, setSnapState] = useState<RunDrawerSnap>(getRememberedDrawerSnap);
  const dragged = useRef(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const setSnap = useCallback((next: RunDrawerSnap) => { rememberDrawerSnap(next); setSnapState(next); }, []);
  const setRefs = useCallback((n: HTMLDivElement | null) => { nodeRef.current = n; cardRef(n); }, [cardRef]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !onHeight || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => onHeight(Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)));
    obs.observe(node);
    return () => obs.disconnect();
  }, [onHeight]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button:not([data-drawer-handle])')) return;
    downAt.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
    controls.start(e);
  }, [controls]);

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    const a = resolveDrawerGesture(snap, info.offset.y, info.velocity.y);
    if (a.type === 'snap') setSnap(a.snap);
    else if (a.type === 'openList') onOpenList();
  }, [snap, setSnap, onOpenList]);

  const isLarge = snap === 'full';
  const onPointerUp = (e: React.PointerEvent) => {
    const d = downAt.current;
    downAt.current = null;
    if (!d || pageCount < 2) return;
    setPage(pageAfterSwipe(page, pageCount, e.clientX - d.x, e.clientY - d.y, isRtl));
  };
  const current = pages?.[page];
  const body = current ? (isLarge ? current.large : current.compact) : (isLarge ? large : compact);

  return (
    <div ref={setRefs} className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col ${className}`} data-run-sheet={isLarge ? 'large' : 'compact'}>
      <div className="mb-3">{buttons}</div>
      <motion.div
        className="pointer-events-auto relative rounded-t-[28px] bg-white px-5 pt-[22px]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)', boxShadow: '0 -18px 40px -20px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.06)', touchAction: 'none' }}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 0.35 }}
        dragSnapToOrigin
        dragMomentum={false}
        onPointerDown={startDrag}
        onPointerUp={onPointerUp}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={onDragEnd}
        role="region"
        aria-label={t('chrome.sheet.handle')}
      >
        <button
          type="button"
          data-drawer-handle
          aria-label={isLarge ? t('chrome.sheet.collapse') : t('chrome.sheet.expand')}
          aria-expanded={isLarge}
          onClick={() => { if (!dragged.current) setSnap(toggleDrawerSnap(snap)); }}
          className="absolute inset-x-0 top-0 mx-auto flex h-6 w-24 items-center justify-center"
        >
          <span className="block h-[5px] w-10 rounded-full bg-slate-200" aria-hidden />
        </button>
        {/* One row: page dots + caption in the middle, the corner tools at the end (no overlap with the content). */}
        {(corner || (pages && pageCount > 1 && !override)) && (
        <div className="relative mb-2.5 flex min-h-[34px] items-center justify-center">
        {corner && <div className="absolute end-0 top-1/2 flex -translate-y-1/2 items-center gap-1.5">{corner}</div>}
        {pages && pageCount > 1 && !override && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-[5px]" role="tablist" aria-label={t('chrome.sheet.handle')}>
              {pages.map((pg, i) => (
                <button
                  key={pg.id}
                  type="button"
                  role="tab"
                  aria-selected={i === page}
                  aria-label={t('chrome.page.aria', { n: i + 1, total: pageCount, name: pg.caption })}
                  onClick={() => setPage(i)}
                  className="grid h-4 place-items-center"
                >
                  <span className="block h-1.5 rounded-full transition-all duration-200" style={{ width: i === page ? 16 : 6, background: i === page ? '#00baf7' : '#cbd5e1' }} />
                </button>
              ))}
            </div>
            <span className="text-[11.5px] font-extrabold text-slate-500">{current?.caption}</span>
          </div>
        )}
        </div>
        )}
        {override && overrideCaption && (
          <div className="mb-2 text-center text-[11.5px] font-extrabold text-slate-500">{overrideCaption}</div>
        )}
        <motion.div key={override ? 'override' : `${current?.id ?? ''}-${snap}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {override ?? body}
        </motion.div>
      </motion.div>
    </div>
  );
}
