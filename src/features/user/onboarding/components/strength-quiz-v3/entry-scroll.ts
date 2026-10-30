'use client';

import { useEffect } from 'react';

/**
 * Owner 30.10 (AD8): opened from the map's first drawer, the questionnaire sat too high and its
 * story bars ran into the iPhone status bar. ClientLayout's <main> survives the route change, and
 * on /map it has no top inset and can be left scrolled; the quiz then inherits that offset.
 * Every quiz entry starts from the top: the window, the document and <main>.
 */
export function resetEntryScroll(doc: Document, win: Window): void {
  const main = doc.getElementById('main-content');
  if (main && main.scrollTop !== 0) main.scrollTop = 0;
  const root = doc.scrollingElement;
  if (root && root.scrollTop !== 0) root.scrollTop = 0;
  if (win.scrollY !== 0) win.scrollTo(0, 0);
}

/** Runs resetEntryScroll on mount and whenever `key` changes (a new quiz screen). */
export function useEntryScrollReset(key?: unknown): void {
  useEffect(() => {
    resetEntryScroll(document, window);
  }, [key]);
}
