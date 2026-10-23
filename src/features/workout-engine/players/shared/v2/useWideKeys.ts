'use client';

import { useEffect, useRef } from 'react';
import { wideIntentForKey, type WideIntent } from './wide-keys';

/** Window keydown → intent, only while `enabled` (wide + flag). Latest handler is always used. */
export function useWideKeys(enabled: boolean, onIntent: (intent: WideIntent) => void): void {
  const ref = useRef(onIntent);
  ref.current = onIntent;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const intent = wideIntentForKey({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: el ? { tag: el.tagName, role: el.getAttribute?.('role'), editable: !!el.isContentEditable } : null,
      });
      if (!intent) return;
      e.preventDefault();
      ref.current(intent);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
