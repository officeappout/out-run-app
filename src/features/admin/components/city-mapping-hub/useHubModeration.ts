'use client';

/**
 * useHubModeration — approve / reject state for the hub (§3.4): optimistic
 * overrides on the drawn data (reverted on failure), the bulk confirm, and a
 * short result notice. Writes go ONLY through city-mapping-hub-moderation.service
 * (the approval center's services). After a successful write the table row
 * counts are re-read; a failed bulk re-reads the layers too (a partial
 * success must never stay hidden behind a reverted override).
 */
import { useCallback, useMemo, useState } from 'react';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import type { ModeratorInfo } from '@/features/admin/services/moderation.service';
import {
  bulkApproveRoutes,
  moderateAmenities,
  moderateOne,
} from '@/features/admin/services/city-mapping-hub-moderation.service';
import { applyOverrides, moderationKind, overrideFor, type HubOverrides } from './hub-moderation.logic';
import type { HubBulkTarget } from './HubBulkBar';
import type { HubPointItem } from './HubPointList';
import type { HubLayerData } from './useHubLayers';

export interface HubNotice { tone: 'ok' | 'error'; text: string }

export interface UseHubModerationInput {
  authority: HubRow | null;
  admin: ModeratorInfo | null;
  data: HubLayerData;
  /** Re-read the table rows (counts). */
  onWritten: () => void;
  /** Drop the layer cache (re-read the truth from the server). */
  invalidate: () => void;
}

export function useHubModeration({ authority, admin, data, onWritten, invalidate }: UseHubModerationInput) {
  const [overrides, setOverrides] = useState<HubOverrides>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<HubBulkTarget | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<HubNotice | null>(null);

  const viewData = useMemo(() => applyOverrides(data, overrides), [data, overrides]);
  const set = (ids: string[], v: 'approved' | 'removed' | null) =>
    setOverrides((o) => {
      const n = { ...o };
      for (const id of ids) { if (v) n[id] = v; else delete n[id]; }
      return n;
    });
  const resetOverrides = useCallback(() => setOverrides({}), []);

  const decide = useCallback(async (item: HubPointItem, action: 'approve' | 'reject', reason: string | null) => {
    const kind = moderationKind(item.kind);
    if (!kind || !admin || !authority) return;
    setBusyId(item.id);
    setNotice(null);
    set([item.id], overrideFor(kind, action));
    try {
      await moderateOne({ kind, id: item.id, authorityId: authority.authorityId, action, reason, admin });
      setNotice({ tone: 'ok', text: action === 'approve' ? 'אושר.' : 'נדחה.' });
      onWritten();
    } catch (err) {
      set([item.id], null);
      setNotice({ tone: 'error', text: `${action === 'approve' ? 'האישור' : 'הדחייה'} נכשל: ${(err as Error)?.message ?? 'שגיאה'}` });
    } finally {
      setBusyId(null);
    }
  }, [admin, authority, onWritten]);

  const confirmBulk = useCallback(async () => {
    if (!bulk || !authority || !admin) return;
    setBulkBusy(true);
    setNotice(null);
    set(bulk.ids, 'approved');
    try {
      let n: number;
      if (bulk.layer === 'routes') n = await bulkApproveRoutes(bulk.ids);
      else {
        const r = await moderateAmenities(authority.authorityId, bulk.ids, 'approve', null);
        set(r.skipped.map((s) => s.id), null);
        n = r.updated.length;
      }
      setNotice({ tone: 'ok', text: `אושרו ${n} ${bulk.label}.` });
      setBulk(null);
      onWritten();
    } catch (err) {
      set(bulk.ids, null);
      setNotice({ tone: 'error', text: `האישור המרובה נכשל: ${(err as Error)?.message ?? 'שגיאה'} — נטען מחדש מהשרת.` });
      setBulk(null);
      invalidate();
      onWritten();
    } finally {
      setBulkBusy(false);
    }
  }, [bulk, authority, admin, onWritten, invalidate]);

  return {
    viewData,
    busyId,
    notice,
    clearNotice: () => setNotice(null),
    resetOverrides,
    approve: (it: HubPointItem) => decide(it, 'approve', null),
    reject: (it: HubPointItem, reason: string) => decide(it, 'reject', reason),
    bulk,
    bulkBusy,
    openBulk: (t: HubBulkTarget) => setBulk(t),
    cancelBulk: () => { if (!bulkBusy) setBulk(null); },
    confirmBulk,
  };
}
