'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WeddingAccessError,
  WeddingConflictError,
  loadWedding,
  saveWedding,
} from '../wedding.client';
import type { WeddingState } from '../wedding.types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Holds the planner state and autosaves it. Edits apply locally at once;
 * a debounced PUT follows. Saves are serialized (never two in flight) and
 * carry the last known rev — a 409 means another tab saved first, so the
 * server's copy replaces ours and the person is told.
 */
export function useWeddingStore() {
  const [state, setState] = useState<WeddingState | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rev = useRef(0);
  const latest = useRef<WeddingState | null>(null);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    loadWedding()
      .then((doc) => {
        if (!alive) return;
        rev.current = doc.rev;
        latest.current = doc.state;
        setState(doc.state);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof WeddingAccessError) setForbidden(true);
        else setError(e instanceof Error ? e.message : 'טעינה נכשלה');
      });
    return () => {
      alive = false;
    };
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current || !dirty.current || !latest.current) return;
    inFlight.current = true;
    dirty.current = false;
    setStatus('saving');
    try {
      const doc = await saveWedding(latest.current, rev.current);
      rev.current = doc.rev;
      setStatus(dirty.current ? 'saving' : 'saved');
    } catch (e: unknown) {
      if (e instanceof WeddingConflictError) {
        rev.current = e.latest.rev;
        latest.current = e.latest.state;
        dirty.current = false;
        setState(e.latest.state);
        setNotice('הנתונים עודכנו בחלון אחר, אז טענתי את הגרסה האחרונה. אם שינוי שלך חסר, הזן אותו שוב.');
        setStatus('saved');
      } else {
        dirty.current = true;
        setStatus('error');
      }
    } finally {
      inFlight.current = false;
      if (dirty.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 700);
      }
    }
  }, []);

  const update = useCallback(
    (fn: (s: WeddingState) => WeddingState) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        latest.current = next;
        return next;
      });
      dirty.current = true;
      setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  const retry = useCallback(() => {
    dirty.current = true;
    void flush();
  }, [flush]);

  // Save pending edits when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  return { state, status, error, forbidden, notice, dismissNotice: () => setNotice(null), update, retry };
}
