'use client';

import { useEffect } from 'react';
import { useMapStore } from '../store/useMapStore';

/**
 * Hides the global BottomNavbar while the calling component is mounted.
 *
 * Usage — drop the hook at the top of any layer/screen that owns its own
 * bottom-anchored UI (CTA card, drawer, etc.) and shouldn't have to fight
 * the floating tab bar for that space:
 *
 * ```tsx
 * export default function PlannedPreviewLayer() {
 *   useSuppressBottomNav();
 *   // ...
 * }
 * ```
 *
 * Internally this just bumps a reference counter on `useMapStore`. The
 * `BottomNavbar` reads `count > 0` and animates itself out/in accordingly,
 * so unmounting the layer (or navigating away from `/map`) automatically
 * brings the bar back. Multiple suppressors stack safely — the bar only
 * reappears when the last one releases.
 *
 * @param active Optional flag for conditional suppression. When `false`
 *               the hook is a no-op. Defaults to `true`.
 */
export function useSuppressBottomNav(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const { suppressBottomNav, releaseBottomNav } = useMapStore.getState();
    suppressBottomNav();
    return () => releaseBottomNav();
  }, [active]);
}
