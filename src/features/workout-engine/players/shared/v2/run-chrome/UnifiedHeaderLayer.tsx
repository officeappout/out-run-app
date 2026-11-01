'use client';

/**
 * UnifiedHeaderLayer — the blocks layer of the unified frame (enable_unified_player_v1, canvas
 * "עיצובים סופיים"): the workout name, then the story bars with their data label, then a transient
 * hint line (no box). Sits inside RunHeaderChrome, on its white fade.
 */

import React from 'react';

export interface UnifiedHeaderLayerProps {
  title: string;
  /** Story bars (or one progress bar); omitted = no bar (a free run without a goal). */
  bars?: React.ReactNode;
  /** The bars' data, e.g. "חזרה 3 מתוך 6 · 400 מ׳" or "הקפה 2 · 12:04". */
  label?: string;
  /** e.g. the next turn (RouteTurnRow). */
  hint?: React.ReactNode;
}

export default function UnifiedHeaderLayer({ title, bars, label, hint }: UnifiedHeaderLayerProps) {
  return (
    <div className="px-5">
      <div className="truncate text-center text-[15px] font-black text-v2-ink">{title}</div>
      {bars && <div className="mt-2">{bars}</div>}
      {label && <div className="mt-1.5 text-center text-[12.5px] font-extrabold text-slate-600">{label}</div>}
      {hint}
    </div>
  );
}
