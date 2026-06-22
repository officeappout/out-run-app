'use client';

/**
 * LiveSessionShell — policy-driven wrapper for all live-session modes.
 *
 * Four named slots driven by SessionPolicy:
 *   TopBar   — goal progress / mode indicator
 *   SideRail — participant rail (focus-center, vertical)
 *   MapLayer — map tiles + presence pins / silhouettes
 *   Drawer   — metrics pager (general / laps / VS)
 *
 * Block 1: solo mode only — all modes fall back to the caller's children
 * (FreeRunOverlay), achieving pixel-identical output to the pre-shell state.
 * Slot decomposition (routing content by policy.mode) happens in Blocks 2–8.
 *
 * AppMap remount note:
 *   LiveSessionShell always renders TwoLayerShell unconditionally, so AppMap
 *   (which lives inside the children render-prop) is never moved in the React
 *   tree at runtime. The wrapper adds one component level in the static tree
 *   but never causes a runtime unmount/remount.
 */

import React from 'react';
import TwoLayerShell, { type TwoLayerShellRenderProps } from './TwoLayerShell';
import type { SessionPolicy } from '../types/session-policy';

// ─────────────────────────────────────────────────────────────────────────────

interface LiveSessionShellProps {
  policy: SessionPolicy;
  /** Collapsed dock height in px — passed through to TwoLayerShell. */
  dockH: number;
  /** When false, drag is disabled and the layer stays expanded. */
  isActive?: boolean;
  /** Tailwind bg-class for the BASE layer (default: 'bg-white'). */
  behindBg?: string;
  /** BASE layer content (e.g. <RunLapsList />). */
  behindContent: React.ReactNode;
  /** MINI strip render-prop (shown when minimized). */
  miniContent: (api: { onExpand: () => void }) => React.ReactNode;
  /**
   * TOP layer content — render-prop receives drag controls + minimized state.
   * In Block 1 this is the full FreeRunOverlay + AppMap, unchanged from today.
   */
  children: (props: TwoLayerShellRenderProps) => React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LiveSessionShell({
  policy,
  dockH,
  isActive,
  behindBg,
  behindContent,
  miniContent,
  children,
}: LiveSessionShellProps) {
  // DEBUG — remove after Block 1 verification
  React.useEffect(() => {
    console.log('[LiveSessionShell] mode:', policy.mode, '| coLocation:', policy.coLocation, '| participants:', policy.participants.length);
  }, [policy.mode, policy.coLocation, policy.participants.length]);

  // Blocks 2–8 will route slot content by policy.mode.
  // All unimplemented modes fall back to the caller's children (solo rendering)
  // so users with groupId see the same screen as today — never a blank screen.
  if (policy.mode !== 'solo') {
    console.warn('[LiveSessionShell] mode not yet implemented — falling back to solo:', policy.mode);
  }

  return (
    <TwoLayerShell
      dockH={dockH}
      isActive={isActive}
      behindBg={behindBg}
      behindContent={behindContent}
      miniContent={miniContent}
    >
      {children}
    </TwoLayerShell>
  );
}
