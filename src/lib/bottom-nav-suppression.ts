'use client';

/**
 * Bottom-nav suppression — the one switch that hides the global tab bar
 * (BottomNavbar) while something owns the bottom of the screen: a map layer's
 * CTA card, a drawer, any modal sheet.
 *
 * A reference counter, not a boolean, so concurrent suppressors never fight on
 * mount / unmount races: the bar comes back only when the last one releases.
 *
 * The shared v2 sheets (Sheet, DraggableSheet) suppress while open, so a screen
 * built on them never has to think about the nav. Overlays that don't render
 * through those primitives call `useSuppressBottomNav(open)` themselves.
 *
 * Why hide instead of out-stacking the nav: overlays mounted inside the map layer
 * (no portal) live in that layer's stacking context, so no z-index on the overlay
 * can lift them over the nav. Hiding the nav works whatever the stacking.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

interface BottomNavSuppressionState {
  count: number;
  suppress: () => void;
  release: () => void;
}

export const useBottomNavSuppression = create<BottomNavSuppressionState>((set) => ({
  count: 0,
  suppress: () => set((s) => ({ count: s.count + 1 })),
  release: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

/** True while any suppressor is up. */
export function useIsBottomNavSuppressed(): boolean {
  return useBottomNavSuppression((s) => s.count > 0);
}

/**
 * Hides the bottom nav while the caller is mounted and `active` is true.
 * `active = false` is a no-op (conditional suppression, e.g. a sheet's `open`).
 */
export function useSuppressBottomNav(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const { suppress, release } = useBottomNavSuppression.getState();
    suppress();
    return () => release();
  }, [active]);
}
