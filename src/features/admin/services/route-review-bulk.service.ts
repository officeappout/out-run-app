/**
 * route-review-bulk.service.ts — the approval center's routes-tab review data and
 * filtered bulk actions (owner 24.10.2026). Server: /api/admin/routes/review-bulk
 * (super admin; the same bulk-routes.server.ts half as the hub's nationwide approve:
 * ≤ 499 per call, ownership + pending + filter re-checked at write time, straight-bridge
 * guard on approve, updateTime preconditions). After an approve, the browser runs the
 * same post-approval side effects as the single approve (broadcast, recompute, decision log).
 */
import { auth } from '@/lib/firebase';
import { InventoryService } from '@/features/parks/core/services/inventory.service';
import type { BatchOutcome } from '@/lib/city-mapping-hub/bulk-approve.logic';
import type { RouteReviewFilter } from '@/lib/city-mapping-hub/review-filters';
import type { PendingRoutesPreviewResponse } from './city-mapping-hub-moderation.service';
import type { ModeratorInfo } from './moderation.service';

const ENDPOINT = '/api/admin/routes/review-bulk';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Every pending route with score / low confidence / authority kind / geometry (server-side read). */
export async function loadRouteReviewData(): Promise<PendingRoutesPreviewResponse> {
  const res = await fetch(ENDPOINT, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: await authHeaders() });
  const json = (await res.json().catch(() => ({}))) as Partial<PendingRoutesPreviewResponse> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { candidates: json.candidates ?? [], authorityNames: json.authorityNames ?? {}, unattributed: json.unattributed ?? 0 };
}

async function post(body: Record<string, unknown>): Promise<BatchOutcome> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<BatchOutcome> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { updated: json.updated ?? [], skipped: json.skipped ?? [] };
}

export async function approveFilteredRoutesBatch(authorityId: string, ids: string[], filter: RouteReviewFilter, admin: ModeratorInfo): Promise<BatchOutcome> {
  const out = await post({ action: 'approve', authorityId, ids, filter });
  if (out.updated.length) {
    // Already published; a side-effect failure must not mark the batch as failed.
    await InventoryService.runRouteApproveSideEffects(out.updated, { adminId: admin.adminId }).catch((err) => {
      console.warn('[approval-center] post-approve side effects failed (non-fatal):', err);
    });
  }
  return out;
}

export async function rejectFilteredRoutesBatch(authorityId: string, ids: string[], filter: RouteReviewFilter, reason: string | null): Promise<BatchOutcome> {
  return post({ action: 'reject', authorityId, ids, filter, reason });
}
