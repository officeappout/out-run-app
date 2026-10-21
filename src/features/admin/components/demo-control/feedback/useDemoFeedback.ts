'use client';
/**
 * "משוב דמו" data: GET /api/admin/demo/feedback (30 per page, "טען עוד" appends with the
 * server's cursor) + POST …/status (optimistic, rolled back on failure). A filter change
 * starts over; a stale response (older filters) is dropped. No polling — the feed is
 * triaged, not watched.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackItem, TriageStatus } from '@/lib/demo-control/feedback-model';
import { demoFetch, readError } from '../demo-client';

export interface FeedbackFilterState {
  source: 'all' | 'life' | 'testers';
  type: string;
  severity: string;
  persona: string;
  status: 'all' | TriageStatus;
  from: string;
  to: string;
}

export const DEFAULT_FILTERS: FeedbackFilterState = { source: 'all', type: '', severity: '', persona: '', status: 'open', from: '', to: '' };

export function filtersToQuery(f: FeedbackFilterState, cursor: string | null): string {
  const p = new URLSearchParams();
  p.set('source', f.source);
  p.set('status', f.status);
  if (f.type) p.set('type', f.type);
  if (f.severity) p.set('severity', f.severity);
  if (f.persona.trim()) p.set('persona', f.persona.trim());
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

export function useDemoFeedback(enabled: boolean, filters: FeedbackFilterState) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const fetchPage = useCallback(
    async (from: string | null, append: boolean) => {
      const my = ++gen.current;
      setLoading(true);
      setError(null);
      try {
        const res = await demoFetch(`/api/admin/demo/feedback?${filtersToQuery(filters, from)}`);
        if (!res.ok) throw new Error(await readError(res));
        const page = (await res.json()) as { items: FeedbackItem[]; nextCursor: string | null };
        if (my !== gen.current) return;
        setItems((prev) => (append ? [...prev, ...page.items.filter((x) => !prev.some((p) => p.source === x.source && p.id === x.id))] : page.items));
        setCursor(page.nextCursor);
        setLoaded(true);
      } catch (err) {
        if (my === gen.current) setError(err instanceof Error ? err.message : 'הטעינה נכשלה');
      } finally {
        if (my === gen.current) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    if (!enabled) return;
    setItems([]);
    setCursor(null);
    setLoaded(false);
    void fetchPage(null, false);
  }, [enabled, fetchPage]);

  const loadMore = useCallback(() => {
    if (cursor && !loading) void fetchPage(cursor, true);
  }, [cursor, loading, fetchPage]);

  const reload = useCallback(() => void fetchPage(null, false), [fetchPage]);

  /** Optimistic; returns an error text or null. */
  const setStatus = useCallback(async (item: FeedbackItem, status: TriageStatus, reason?: string): Promise<string | null> => {
    const patch = (st: TriageStatus, why: string | null) =>
      setItems((prev) => prev.map((x) => (x.source === item.source && x.id === item.id ? { ...x, status: st, triageReason: why } : x)));
    patch(status, status === 'irrelevant' ? (reason ?? null) : null);
    try {
      const res = await demoFetch('/api/admin/demo/feedback/status', {
        method: 'POST',
        body: JSON.stringify({ source: item.source, id: item.id, status, ...(reason ? { reason } : {}) }),
      });
      if (!res.ok) throw new Error(await readError(res));
      return null;
    } catch (err) {
      patch(item.status, item.triageReason);
      return err instanceof Error ? err.message : 'השמירה נכשלה';
    }
  }, []);

  return { items, hasMore: cursor !== null, loading, loaded, error, loadMore, reload, setStatus };
}

export function openScreenshot(findingId: string): Promise<string | null> {
  return openSigned(`id=${encodeURIComponent(findingId)}`);
}

/** A "ציוני עיצוב" screen's screenshot (the server reads the path from the summary doc). */
export function openDesignScreenshot(screen: string): Promise<string | null> {
  return openSigned(`screen=${encodeURIComponent(screen)}`);
}

async function openSigned(query: string): Promise<string | null> {
  // Open the tab synchronously (popup blockers), then point it at the signed URL.
  const win = window.open('about:blank', '_blank');
  try {
    const res = await demoFetch(`/api/admin/demo/feedback/screenshot?${query}`);
    if (!res.ok) throw new Error(await readError(res));
    const { url } = (await res.json()) as { url: string };
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
    return null;
  } catch (err) {
    win?.close();
    return err instanceof Error ? err.message : 'הפתיחה נכשלה';
  }
}
