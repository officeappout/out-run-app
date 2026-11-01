'use client';

/**
 * UnifiedGpsMark — the one GPS mark of the unified frame (enable_unified_player_v1, canvas 9ב):
 * a small pill at the end of the header row. Searching (grey), weak (orange), lost (red), ok (green "GPS").
 * Replaces the floating GPS toasts.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import type { UnifiedGps } from './unified-chrome-logic';

const LOOK: Record<UnifiedGps, { dot: string; text: string; bg: string; key: 'chrome.gps.ok' | 'chrome.gps.searching' | 'chrome.gps.weak' | 'chrome.gps.lost' }> = {
  ok: { dot: '#16a34a', text: '#334155', bg: 'rgba(255,255,255,0.92)', key: 'chrome.gps.ok' },
  searching: { dot: '#94a3b8', text: '#475569', bg: 'rgba(255,255,255,0.92)', key: 'chrome.gps.searching' },
  weak: { dot: '#ea580c', text: '#c2410c', bg: '#fff7ed', key: 'chrome.gps.weak' },
  lost: { dot: '#e5484d', text: '#c0392b', bg: '#fdeceb', key: 'chrome.gps.lost' },
};

export default function UnifiedGpsMark({ state }: { state: UnifiedGps }) {
  const t = useT(together);
  const l = LOOK[state];
  return (
    <span role="status" aria-live="polite" className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-extrabold" style={{ background: l.bg, color: l.text }}>
      <span aria-hidden className={`block h-2 w-2 rounded-full ${state === 'searching' ? 'animate-pulse' : ''}`} style={{ background: l.dot }} />
      {t(l.key)}
    </span>
  );
}
