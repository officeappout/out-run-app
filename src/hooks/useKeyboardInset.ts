'use client';

/**
 * Keyboard inset hooks.
 *
 *   useKeyboardInsetController() — mount ONCE (KeyboardInsetBootstrap, root
 *     layout). Tracks the on-screen keyboard and writes `--kb-inset` /
 *     `data-kb-open` on <html>.
 *
 *   useKeyboardInset() — read the current inset (px) in any component that
 *     needs it in JS. Most screens don't: use the CSS utilities from
 *     globals.css instead —
 *       .kb-fit        `fixed inset-0` overlay / bar → ends at the keyboard
 *       .kb-sheet      `fixed bottom-0` sheet → sits on the keyboard, capped to
 *                      the visible height while it is open
 *       .kb-cap        max-height cap only (sheet inside a .kb-fit wrapper)
 *       <main> already pads itself by var(--kb-inset) (ClientLayout.tsx)
 *       --kb-safe-bottom  env(safe-area-inset-bottom) while closed, 0 while
 *                      open (the keyboard already covers the home indicator)
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  getKeyboardInset,
  installKeyboardInsetController,
  subscribeKeyboardInset,
} from '@/lib/keyboard/keyboardInsetController';

export function useKeyboardInsetController(): void {
  useEffect(() => installKeyboardInsetController(), []);
}

export function useKeyboardInset(): { inset: number; isOpen: boolean } {
  const inset = useSyncExternalStore(subscribeKeyboardInset, getKeyboardInset, () => 0);
  return { inset, isOpen: inset > 0 };
}
