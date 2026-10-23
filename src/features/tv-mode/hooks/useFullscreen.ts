'use client';

import { useCallback, useEffect, useState } from 'react';

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function current(): Element | null {
  if (typeof document === 'undefined') return null;
  const d = document as FsDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export interface FullscreenControls {
  isFullscreen: boolean;
  supported: boolean;
  /** true after a request the browser refused (no user gesture, policy, unsupported). */
  denied: boolean;
  enter: () => Promise<boolean>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
}

/**
 * requestFullscreen needs a user gesture — call enter() from a click / OK key press.
 * A refusal never throws: it flips `denied` and the page carries on windowed.
 */
export function useFullscreen(): FullscreenControls {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [denied, setDenied] = useState(false);
  const supported =
    typeof document !== 'undefined' &&
    Boolean(document.documentElement.requestFullscreen || (document.documentElement as FsEl).webkitRequestFullscreen);

  useEffect(() => {
    const sync = () => setIsFullscreen(current() != null);
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement as FsEl;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else throw new Error('unsupported');
      setDenied(false);
      return true;
    } catch {
      setDenied(true);
      return false;
    }
  }, []);

  const exit = useCallback(async () => {
    const d = document as FsDoc;
    try {
      if (d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    } catch {
      /* already out */
    }
  }, []);

  const toggle = useCallback(async () => {
    if (current()) await exit();
    else await enter();
  }, [enter, exit]);

  return { isFullscreen, supported, denied, enter, exit, toggle };
}
