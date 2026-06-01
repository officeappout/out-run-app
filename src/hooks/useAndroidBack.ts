'use client';

import { useEffect, useRef } from 'react';

import { BackStack } from '@/lib/native/backStack';

/**
 * useAndroidBack — register a hardware/gesture back handler for the lifetime
 * of the calling component.
 *
 * The handler is pushed onto the global `BackStack` on mount and popped on
 * unmount. When the Android back button fires (see `src/lib/native/init.ts`),
 * the stack is dispatched top-down: return `true` to consume the event (the
 * app will NOT navigate browser history), or `false` to let the next handler
 * — or the default `history.back()` — run.
 *
 * The latest `handler` is always invoked even if its identity changes between
 * renders, so callers don't need to memoise it. Toggle `enabled` to register
 * conditionally (e.g. only while an overlay is open or a session is active).
 *
 * Safe on web/SSR: the BackStack is a pure module and is simply never
 * dispatched outside the native shell.
 */
export function useAndroidBack(handler: () => boolean, enabled = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const stableHandler = () => handlerRef.current();
    BackStack.push(stableHandler);
    return () => BackStack.pop(stableHandler);
  }, [enabled]);
}
