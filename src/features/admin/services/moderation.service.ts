/**
 * Unified Moderation Service — "unify by contract"
 *
 * One generic approve/reject surface over every moderatable entity, WITHOUT a
 * merged collection or migration. Each entity keeps its own collection + status
 * contract; this service dispatches to the correct side-effect and writes a
 * uniform audit row (APPROVE / REJECT) for all of them.
 *
 * Reuses the existing per-entity logic (approvePark, InventoryService.approveRoute,
 * approveNewLocation / approveSuggestEdit) — it does NOT reimplement it. It only
 * adds: climb approval, and unified rejection (reason + audit) where it was missing
 * (parks / routes previously had no reject path).
 *
 * Status contract per entity (all reach a pending → published/approved | rejected shape):
 *   park          parks.contentStatus: pending_review → published | draft(+rejectionReason)
 *   route         official_routes.status: pending → published | archived(+rejectionReason)
 *   climb         climb_segments.status: pending → published | rejected(+rejectionReason)
 *   contribution  user_contributions.status: pending → approved | rejected(+rejectionReason)
 *   amenity       osm_amenities.status: pending → published | rejected(+rejectionReason)
 */
import { doc, getDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logAction } from './audit.service';
import { approvePark } from './parks.service';
import { InventoryService } from '@/features/parks/core/services/inventory.service';
import {
  approveNewLocation,
  approveSuggestEdit,
} from '@/features/parks/core/services/contribution.service';
import type { UserContribution } from '@/types/contribution.types';
import type { AuditTargetEntity } from '@/types/audit-log.type';

export type ModerationEntityType = 'park' | 'route' | 'climb' | 'contribution' | 'amenity';

export interface ModeratorInfo {
  adminId: string;
  adminName: string;
}

const AUDIT_ENTITY: Record<ModerationEntityType, AuditTargetEntity> = {
  park: 'Park',
  route: 'Route',
  climb: 'ClimbSegment',
  contribution: 'Contribution',
  amenity: 'Amenity',
};

/** Approve a pending item — dispatches the entity-specific publish side-effect + audits. */
export async function approveEntity(
  entityType: ModerationEntityType,
  id: string,
  admin: ModeratorInfo,
): Promise<void> {
  switch (entityType) {
    case 'park':
      await approvePark(id);
      break;

    case 'route':
      await InventoryService.approveRoute(id);
      break;

    case 'climb':
      await updateDoc(doc(db, 'climb_segments', id), {
        status: 'published',
        publishedAt: serverTimestamp(),
        reviewedBy: admin.adminId,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      break;

    case 'amenity':
      // No publishedAt — OsmAmenity has no such field (unlike climb_segments).
      await updateDoc(doc(db, 'osm_amenities', id), {
        status: 'published',
        reviewedBy: admin.adminId,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      break;

    case 'contribution': {
      const snap = await getDoc(doc(db, 'user_contributions', id));
      if (!snap.exists()) throw new Error('Contribution not found');
      const contribution = { id: snap.id, ...(snap.data() as any) } as UserContribution;
      // Route to the EXISTING UGC approval logic (creates park / applies edit + awards XP)
      if (contribution.type === 'new_location') {
        await approveNewLocation(contribution, admin.adminId);
      } else if (contribution.type === 'suggest_edit') {
        await approveSuggestEdit(contribution, admin.adminId);
      } else {
        // report / review: no entity to create — just mark approved
        await updateDoc(doc(db, 'user_contributions', id), {
          status: 'approved',
          updatedAt: serverTimestamp(),
        });
      }
      break;
    }
  }

  logAction({
    adminId: admin.adminId,
    adminName: admin.adminName,
    actionType: 'APPROVE',
    targetEntity: AUDIT_ENTITY[entityType],
    targetId: id,
    details: `Approved ${entityType} ${id}`,
  });
}

/** Reject a pending item — uniform reason + audit across all entity types. */
export async function rejectEntity(
  entityType: ModerationEntityType,
  id: string,
  reason: string,
  admin: ModeratorInfo,
): Promise<void> {
  const reviewFields = {
    rejectionReason: reason || null,
    reviewedBy: admin.adminId,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  switch (entityType) {
    case 'park':
      // Keep unpublished; contentStatus back to draft + reason marks it rejected.
      await updateDoc(doc(db, 'parks', id), { published: false, contentStatus: 'draft', ...reviewFields });
      break;

    case 'route':
      await updateDoc(doc(db, 'official_routes', id), { published: false, status: 'archived', ...reviewFields });
      break;

    case 'climb':
      await updateDoc(doc(db, 'climb_segments', id), { status: 'rejected', ...reviewFields });
      break;

    case 'amenity':
      await updateDoc(doc(db, 'osm_amenities', id), { status: 'rejected', ...reviewFields });
      break;

    case 'contribution':
      // Single atomic write: status + reason + reviewer together (rejectContribution
      // only sets status, so we inline the equivalent write to avoid a partial-failure
      // window where a rejected contribution has no rejectionReason/reviewer).
      await updateDoc(doc(db, 'user_contributions', id), { status: 'rejected', ...reviewFields });
      break;
  }

  logAction({
    adminId: admin.adminId,
    adminName: admin.adminName,
    actionType: 'REJECT',
    targetEntity: AUDIT_ENTITY[entityType],
    targetId: id,
    details: `Rejected ${entityType} ${id}${reason ? ` — ${reason}` : ''}`,
  });
}

/**
 * Bulk-reject climb_segments — Stage 6 (route-enrichment-pipeline plan, 17.08.2026),
 * built so triaging structural noise (e.g. construction-ramp false positives,
 * unwanted stairs) at scale doesn't mean 175 individual clicks. Fixed-shape
 * payload only (status + reviewFields, no arbitrary caller fields) — same
 * "no chokepoint needed" reasoning as InventoryService.bulkRejectRoutes. Lives
 * here (not InventoryService) because climb_segments' status transitions
 * already live in this file, not there. Modeled on bulkRejectRoutes'
 * chunked-batch skeleton (inventory.service.ts) but the body is climb-specific,
 * not copied verbatim — per Stage 5's own finding that the skeleton is
 * portable but route-specific side effects are not (this has none to strip:
 * climb_segments has no broadcast/adjacency/cache side effects to replicate).
 * No per-item audit log entry — matches bulkApproveRoutes/bulkRejectRoutes'
 * own precedent of skipping individual audit rows for bulk operations.
 */
export async function bulkRejectClimbs(
  ids: string[],
  reason: string | null,
  admin: ModeratorInfo,
): Promise<number> {
  if (ids.length === 0) return 0;
  const reviewFields = {
    status: 'rejected' as const,
    rejectionReason: reason || null,
    reviewedBy: admin.adminId,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const CHUNK = 500;
  let rejected = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const id of chunk) batch.update(doc(db, 'climb_segments', id), reviewFields);
    await batch.commit();
    rejected += chunk.length;
  }
  return rejected;
}
