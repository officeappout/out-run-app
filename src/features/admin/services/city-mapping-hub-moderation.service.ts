/**
 * city-mapping-hub-moderation.service.ts — approve / reject from the hub map.
 * REUSES the approval center's services, never a new payload:
 *   route        → moderation.service approveEntity / rejectEntity('route')
 *                  (approve = InventoryService.approveRoute: publish + street-segment
 *                  broadcast + adjacency / enrichment recompute + decision log;
 *                  reject = status 'archived' + reason — NOT bulkRejectRoutes'
 *                  soft "back to pending")
 *   park         → approveEntity / rejectEntity('park')
 *   contribution → approveEntity / rejectEntity('contribution') — the server
 *                  chokepoint /api/admin/contributions/[id]/(approve|reject):
 *                  park creation / edit apply, the contributor's XP / credit and
 *                  its audit row, exactly as in the approval center
 *   amenity      → POST /api/admin/city-mapping/hub/moderate (osm_amenities is
 *                  root-only in the rules; same payload as moderation.service)
 * Bulk = routes (InventoryService.bulkApproveRoutes) and amenities (the hub
 * route, ≤ 500 per call) — only ever for ONE authority, after a confirm that
 * shows the exact count (owner decision 22.10.2026). Parks / contributions
 * have per-item side effects and are never bulk-approved here.
 */
import { approveEntity, rejectEntity, type ModeratorInfo } from './moderation.service';
import { InventoryService } from '@/features/parks/core/services/inventory.service';

export type HubModerationKind = 'route' | 'park' | 'contribution' | 'amenity';
export type HubAction = 'approve' | 'reject';

export interface AmenityModerateResult {
  updated: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export async function moderateAmenities(
  authorityId: string, ids: string[], action: HubAction, reason: string | null, fetchImpl: typeof fetch = fetch,
): Promise<AmenityModerateResult> {
  const out: AmenityModerateResult = { updated: [], skipped: [] };
  for (let i = 0; i < ids.length; i += 500) {
    const res = await fetchImpl('/api/admin/city-mapping/hub/moderate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorityId, action, ids: ids.slice(i, i + 500), reason }),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<AmenityModerateResult> & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    out.updated.push(...(json.updated ?? []));
    out.skipped.push(...(json.skipped ?? []));
  }
  return out;
}

export interface ModerateOneInput {
  kind: HubModerationKind;
  id: string;
  authorityId: string;
  action: HubAction;
  reason: string | null;
  admin: ModeratorInfo;
}

/** One item, through the same service the approval center calls. */
export async function moderateOne(i: ModerateOneInput): Promise<void> {
  if (i.kind === 'amenity') {
    const r = await moderateAmenities(i.authorityId, [i.id], i.action, i.reason);
    if (!r.updated.includes(i.id)) throw new Error(`לא עודכן (${r.skipped[0]?.reason ?? 'לא ידוע'})`);
    return;
  }
  if (i.action === 'approve') await approveEntity(i.kind, i.id, i.admin);
  else await rejectEntity(i.kind, i.id, i.reason ?? '', i.admin);
}

/** Every pending route of the focused authority, via the existing bulk approve (publish + broadcast + recompute). */
export async function bulkApproveRoutes(ids: string[]): Promise<number> {
  return InventoryService.bulkApproveRoutes(ids);
}
