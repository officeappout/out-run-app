'use client';

/**
 * PresenceRail — the together layer's vertical rail (enable_together_layer_v1):
 * everyone in the session as a face + a tiny live status. Scrolls, fades at
 * both ends, collapses to an edge chip, and can be dragged up / down / to the
 * other side (the spot is remembered on the device). Based on the free-run
 * SideRail, but data-agnostic: it takes the ordered participants from
 * usePresence and never touches stores, so every player (run / walk / bike /
 * strength / AMRAP / EMOM) mounts the same component. It floats at the player's
 * edge, never over the video.
 *
 * Tap a face to pick (e.g. the race-bar opponent); tap again to clear.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import type { OrderedParticipant } from '@/features/workout-engine/together/core/presence-order';
import {
  DEFAULT_RAIL_PLACEMENT, RAIL_STORAGE_KEY, parsePlacement, placementTopPx, railStatus, resolveDrop, toggleSelected,
  type RailPlacement,
} from '@/features/workout-engine/together/core/rail-logic';

export interface PresenceRailProps {
  participants: OrderedParticipant[];
  selectedUid?: string | null;
  /** Called with the new selection (null = cleared). */
  onSelect?: (uid: string | null) => void;
  /** Free vertical band, px from the viewport top / bottom (header, drawer + buttons). */
  topInset: number;
  bottomInset: number;
  /** Extra per-face content (e.g. a cheer button). */
  renderExtra?: (p: OrderedParticipant) => React.ReactNode;
  /** Rail height cap, px. Default 4.5 faces. */
  maxHeight?: number;
}

const FACE = 40;
const ROW = 62;

function readPlacement(): RailPlacement {
  try { return parsePlacement(window.localStorage.getItem(RAIL_STORAGE_KEY)); } catch { return DEFAULT_RAIL_PLACEMENT; }
}
function savePlacement(p: RailPlacement) {
  try { window.localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

export default function PresenceRail({ participants, selectedUid = null, onSelect, topInset, bottomInset, renderExtra, maxHeight = ROW * 4.5 }: PresenceRailProps) {
  const t = useT(together);
  const [place, setPlace] = useState<RailPlacement>(DEFAULT_RAIL_PLACEMENT);
  const [viewH, setViewH] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [dragY, setDragY] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dy: number } | null>(null);

  useEffect(() => {
    setPlace(readPlacement());
    const onResize = () => setViewH(window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const commit = useCallback((next: RailPlacement) => { setPlace(next); savePlacement(next); }, []);

  const freeTop = topInset;
  const freeHeight = Math.max(0, viewH - topInset - bottomInset);
  const railH = Math.min(maxHeight, participants.length * ROW + 28, freeHeight);
  const top = dragY ?? placementTopPx(place.topFrac, freeTop, freeHeight, railH);
  const sideStyle = place.side === 'left' ? { left: 8 } : { right: 8 };

  const onHandleDown = (e: React.PointerEvent) => {
    const rect = railRef.current?.getBoundingClientRect();
    grab.current = { dy: e.clientY - (rect?.top ?? e.clientY) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!grab.current) return;
    setDragY(Math.min(Math.max(freeTop, e.clientY - grab.current.dy), freeTop + Math.max(0, freeHeight - railH)));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (!grab.current) return;
    const next = resolveDrop({ x: e.clientX, y: e.clientY, viewW: window.innerWidth, freeTop, freeHeight: Math.max(1, freeHeight - railH), grabOffsetY: grab.current.dy });
    grab.current = null;
    setDragY(null);
    commit({ ...next, collapsed: place.collapsed });
  };

  if (participants.length === 0) return null;
  const Chevron = place.side === 'left' ? ChevronLeft : ChevronRight;

  if (place.collapsed) {
    return (
      <button
        type="button"
        onClick={() => commit({ ...place, collapsed: false })}
        aria-label={t('rail.expand')}
        className="pointer-events-auto absolute z-[35] flex items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 text-white backdrop-blur"
        style={{ ...sideStyle, top }}
      >
        <Users className="h-4 w-4" />
        <span className="text-[12px] font-bold tabular-nums">{participants.length}</span>
      </button>
    );
  }

  return (
    <div
      ref={railRef}
      role="group"
      aria-label={t('rail.label')}
      className="pointer-events-auto absolute z-[35] flex flex-col items-center rounded-2xl bg-black/35 py-1 backdrop-blur-sm"
      style={{ ...sideStyle, top, height: railH, width: 64, touchAction: 'none' }}
    >
      <div
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        aria-label={t('rail.drag')}
        className="flex h-3.5 w-full flex-shrink-0 cursor-grab items-center justify-center"
      >
        <span className="h-1 w-6 rounded-full bg-white/50" />
      </div>
      <div
        className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain"
        style={{
          touchAction: 'pan-y',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)',
        }}
      >
        <ul className="flex flex-col items-center gap-1 py-2">
          {participants.map((p) => {
            const st = railStatus(p);
            const selected = p.uid === selectedUid;
            return (
              <li key={p.uid} className="flex w-full flex-col items-center" style={{ minHeight: ROW - 4, opacity: p.freshness === 'stale' ? 0.55 : 1 }}>
                <button
                  type="button"
                  disabled={p.isMe || !onSelect}
                  onClick={() => onSelect?.(toggleSelected(selectedUid, p.uid))}
                  aria-pressed={selected}
                  aria-label={t('rail.select', { name: p.name })}
                  className="flex flex-col items-center gap-0.5"
                >
                  <span
                    className="flex items-center justify-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-white"
                    style={{ width: FACE, height: FACE, border: selected ? '3px solid #38bdf8' : p.isMe ? '2px solid #fff' : '2px solid rgba(255,255,255,0.45)' }}
                  >
                    {p.photoURL ? <img src={p.photoURL} alt="" className="h-full w-full object-cover" /> : (p.name.charAt(0) || '·')}
                  </span>
                  <span className="max-w-[60px] truncate text-[9px] font-semibold leading-none text-white/90 tabular-nums" data-testid="rail-status">
                    {t(st.key, st.params)}
                  </span>
                </button>
                {renderExtra?.(p)}
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => commit({ ...place, collapsed: true })}
        aria-label={t('rail.collapse')}
        className="flex h-5 w-full flex-shrink-0 items-center justify-center text-white/70"
      >
        <Chevron className="h-4 w-4" />
      </button>
    </div>
  );
}
