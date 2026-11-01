'use client';

/**
 * UnifiedHeaderLayer — the blocks layer of the unified frame (enable_unified_player_v1, canvas
 * "עיצובים סופיים"): the workout name, then the story bars with their data label, then a transient
 * hint line (no box). Sits inside RunHeaderChrome, on its white fade.
 */

import React from 'react';

export type HeaderFlashTone = 'info' | 'good' | 'warn';

const FLASH_COLOR: Record<HeaderFlashTone, string> = { info: '#0369a1', good: '#15803d', warn: '#c0392b' };

export interface UnifiedHeaderLayerProps {
  title: string;
  /** Story bars (or one progress bar); omitted = no bar (a free run without a goal). */
  bars?: React.ReactNode;
  /** The bars' data, e.g. "חזרה 3 מתוך 6 · 400 מ׳" or "הקפה 2 · 12:04". */
  label?: string;
  /** e.g. the next turn (RouteTurnRow). */
  hint?: React.ReactNode;
  /** A passing line (lap closed, goal reached, GPS lost); shown instead of the hint while set. */
  flash?: { text: string; tone?: HeaderFlashTone } | null;
}

export default function UnifiedHeaderLayer({ title, bars, label, hint, flash }: UnifiedHeaderLayerProps) {
  return (
    <div className="px-5">
      <div className="truncate text-center text-[15px] font-black text-v2-ink">{title}</div>
      {bars && <div className="mt-2">{bars}</div>}
      {label && <div className="mt-1.5 text-center text-[12.5px] font-extrabold text-slate-600">{label}</div>}
      {flash ? (
        <div role="status" aria-live="polite" className="mt-1.5 text-center text-[12.5px] font-extrabold" style={{ color: FLASH_COLOR[flash.tone ?? 'info'] }}>
          {flash.text}
        </div>
      ) : hint}
    </div>
  );
}
