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
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
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
import { logRouteDecision } from '@/lib/route-decisions/log-decision';
import { buildUnitDoc } from '@/lib/unit-doc';

export type ModerationEntityType = 'park' | 'route' | 'climb' | 'contribution' | 'amenity' | 'pending_unit';

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
  pending_unit: 'PendingUnit',
};

interface PendingUnitData {
  level: 'brigade' | 'battalion' | 'company';
  orgId: string | null;
  parentUnitId: string | null;
  parentUnitPath: string[];
  proposedName: string;
  computedUnitId: string;
}

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
      await InventoryService.approveRoute(id, { adminId: admin.adminId });
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

    case 'pending_unit': {
      const snap = await getDoc(doc(db, 'pending_units', id));
      if (!snap.exists()) throw new Error('Pending unit not found');
      const p = snap.data() as PendingUnitData;
      let resolvedTo: string;

      if (p.level === 'brigade') {
        // Mirrors organizations/page.tsx's exact new-military-org shape
        // (handleCreate) — same random-suffix id scheme as every other
        // brigade, NOT p.computedUnitId (that's a file-internal-style key,
        // never a real brigade doc id — see import-military-units.ts's note
        // on why bde_/bde_u_ ids are never used as literal brigade ids).
        const slug = p.proposedName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const suffix = Math.random().toString(36).substring(2, 6);
        const newOrgId = slug ? `${slug}_${suffix}` : `mil_${suffix}`;
        const batch = writeBatch(db);
        batch.set(doc(db, 'authorities', newOrgId), {
          name: p.proposedName,
          type: 'military_unit',
          tenantType: 'military',
          managerIds: [],
          userCount: 0,
          status: 'active',
          isActiveClient: false,
          pipelineStatus: 'lead',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'tenants', newOrgId), {
          name: p.proposedName,
          type: 'military',
          authorityId: newOrgId,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        resolvedTo = newOrgId;
      } else {
        // battalion/company: p.computedUnitId IS the real, literal doc id —
        // same scheme Task 1's import uses for its own bn_/co_ ids.
        if (!p.orgId) throw new Error('Pending unit missing orgId for non-brigade level');
        const data = buildUnitDoc({
          name: p.proposedName,
          parentUnitId: p.parentUnitId,
          parentUnitPath: p.parentUnitPath,
          unitType: p.level as 'battalion' | 'company',
        });
        await setDoc(doc(db, 'tenants', p.orgId, 'units', p.computedUnitId), {
          ...data,
          createdAt: serverTimestamp(),
        });
        resolvedTo = p.computedUnitId;
      }

      await updateDoc(doc(db, 'pending_units', id), {
        status: 'approved',
        resolvedTo,
        reviewedBy: admin.adminId,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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

    case 'route': {
      await updateDoc(doc(db, 'official_routes', id), { published: false, status: 'archived', ...reviewFields });
      // ── Decision-log hook (Stage 2, accuracy-agent plan) ──────────────
      // Fire-and-forget, non-fatal — a getDoc/log failure here must never
      // fail the reject action itself, which already succeeded above.
      getDoc(doc(db, 'official_routes', id))
        .then((snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          // getDoc returns the PERSISTED path form ({lat,lng}[]), not the
          // [lng,lat] tuples logRouteDecision/pathLengthMeters expect (the
          // conversion InventoryService.getRouteById normally does) —
          // convert here since this is a raw getDoc, not a getRouteById call.
          const path: Array<[number, number]> = Array.isArray(data.path)
            ? data.path.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0])
            : [];
          logRouteDecision(
            { id: snap.id, name: data.name, city: data.city, authorityId: data.authorityId, path, distance: data.distance, qualitySignals: data.qualitySignals },
            'drop',
            admin.adminId,
            { dropDetail: { reasonNote: reason || undefined } },
          ).catch(() => {});
        })
        .catch(() => {});
      break;
    }

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

    case 'pending_unit':
      // Stage A: reject only, no redirect (that's Stage B — resolvedTo stays
      // null, so usePendingUnitSelfHeal's `status==='approved' && resolvedTo`
      // filter correctly ignores this; the user's real declaration was never
      // touched while pending, so they're already back at the parent level
      // they had — no write needed there at all).
      await updateDoc(doc(db, 'pending_units', id), { status: 'rejected', ...reviewFields });
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
 * Bulk approve/reject — Stage 6 (route-enrichment-pipeline plan, 17.08.2026),
 * generalized in Phase 2 of the POI-moderation build (18.08.2026) to also
 * cover osm_amenities ("approve all 649 benches" without 649 clicks).
 *
 * Deliberately restricted to entity types whose approve/reject is a fixed-
 * shape status flip with no other side effects — park/route/contribution are
 * NOT eligible here (approveEntity/rejectEntity for those call real side-
 * effecting logic: park publish hooks, InventoryService's broadcast+adjacency
 * cascade, UGC's park-creation+XP-award — none of that collapses into a
 * `writeBatch.update()` payload). Same "no chokepoint needed" reasoning as
 * InventoryService.bulkRejectRoutes: a fixed 2-4 field payload, no arbitrary
 * caller-supplied fields. Lives here (not InventoryService) because both
 * entities' status transitions already live in this file.
 *
 * One real per-type difference preserved below: climb approve sets
 * `publishedAt` (matches its single-item approveEntity case); amenity does
 * not (OsmAmenity has no such field). No per-item audit log entry — matches
 * the original bulkRejectClimbs' own precedent of skipping individual audit
 * rows for bulk operations (chunked writeBatch, not one doc at a time).
 */
export type BulkModerationEntityType = 'climb' | 'amenity';

const BULK_COLLECTION: Record<BulkModerationEntityType, string> = {
  climb: 'climb_segments',
  amenity: 'osm_amenities',
};

export async function bulkApproveEntities(
  entityType: BulkModerationEntityType,
  ids: string[],
  admin: ModeratorInfo,
): Promise<number> {
  if (ids.length === 0) return 0;
  const reviewFields = {
    status: 'published' as const,
    reviewedBy: admin.adminId,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(entityType === 'climb' ? { publishedAt: serverTimestamp() } : {}),
  };
  const CHUNK = 500;
  let approved = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const id of chunk) batch.update(doc(db, BULK_COLLECTION[entityType], id), reviewFields);
    await batch.commit();
    approved += chunk.length;
  }
  return approved;
}

export async function bulkRejectEntities(
  entityType: BulkModerationEntityType,
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
    for (const id of chunk) batch.update(doc(db, BULK_COLLECTION[entityType], id), reviewFields);
    await batch.commit();
    rejected += chunk.length;
  }
  return rejected;
}

/**
 * Un-suppress a garden-dedup-suppressed amenity (Phase 4, POI-moderation
 * build) — returns it to 'pending' so it re-enters the normal queue on next
 * load. Clears BOTH suppressedDuplicateOfParkId and rejectionReason so the
 * item doesn't carry a stale "matched park X" reason into its next real
 * review. Distinct from rejectEntity/approveEntity: this is a correction to
 * an automated ingestion-time decision, not a moderation verdict — logged as
 * UPDATE, not APPROVE/REJECT.
 */
export async function unsuppressAmenity(id: string, admin: ModeratorInfo): Promise<void> {
  await updateDoc(doc(db, 'osm_amenities', id), {
    status: 'pending',
    suppressedDuplicateOfParkId: null,
    rejectionReason: null,
    reviewedBy: admin.adminId,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  logAction({
    adminId: admin.adminId,
    adminName: admin.adminName,
    actionType: 'UPDATE',
    targetEntity: 'Amenity',
    targetId: id,
    details: `Un-suppressed amenity ${id} (returned to pending review)`,
  });
}
