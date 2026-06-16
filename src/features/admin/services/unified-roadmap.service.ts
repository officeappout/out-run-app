/**
 * Unified Roadmap Service — Read-model aggregator
 *
 * Reads from two source-of-truth domains:
 *   - dev    → product_roadmap (top-level Firestore collection)
 *   - sales  → authorities[].tasks[] (array field on each authority doc)
 *
 * Returns RoadmapItem[] normalised to the shared contract.
 * Writes always go back to the originating domain via sourceRef.
 */
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllTasks } from './product-roadmap.service';
import { getAllAuthorities } from './authority.service';
import type { ProductTask } from '@/types/product-roadmap.types';
import type { Authority } from '@/types/admin-types';
import type { AdminUser } from './admin-management.service';
import {
  RoadmapItem,
  RoadmapDomain,
  RoadmapFilters,
  CommonStatus,
  DEV_TO_COMMON,
  SALES_TO_COMMON,
  COMMON_TO_DEV,
  COMMON_TO_SALES,
} from '@/types/roadmap-unified.types';

// ─── Normalise helpers ────────────────────────────────────────────────────────

function fromProductTask(task: ProductTask): RoadmapItem {
  return {
    id: task.id,
    domain: 'dev' as RoadmapDomain,
    title: task.title,
    status: DEV_TO_COMMON[task.status] ?? 'todo',
    nativeStatus: task.status,
    assigneeId: task.assignedTo ?? null,
    assigneeName: task.assignedToName ?? null,
    assigneePhotoURL: null,
    priority: task.priority ?? null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    parentGoalId: null,
    sourceRef: {
      collection: 'product_roadmap',
      docId: task.id,
    },
  };
}

function fromAuthorityTask(
  task: Record<string, unknown>,
  authorityId: string,
): RoadmapItem {
  const status = typeof task.status === 'string' ? task.status : 'pending';
  const dueDate = typeof task.dueDate === 'string' ? task.dueDate : null;
  return {
    id: typeof task.id === 'string' ? task.id : '',
    domain: 'sales' as RoadmapDomain,
    title: typeof task.title === 'string' ? task.title : '',
    status: SALES_TO_COMMON[status] ?? 'todo',
    nativeStatus: status,
    assigneeId: typeof task.assignedTo === 'string' ? task.assignedTo : null,
    assigneeName: typeof task.assignedToName === 'string' ? task.assignedToName : null,
    assigneePhotoURL: null,
    priority: (['critical', 'high', 'medium', 'low'].includes(task.priority as string)
      ? task.priority as RoadmapItem['priority']
      : null),
    dueDate,
    parentGoalId: typeof task.parentGoalId === 'string' ? task.parentGoalId : null,
    sourceRef: {
      collection: 'authorities',
      docId: authorityId,
      taskId: typeof task.id === 'string' ? task.id : '',
    },
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function applyFilters(items: RoadmapItem[], filters: RoadmapFilters): RoadmapItem[] {
  let result = items;

  if (filters.domains && filters.domains.length > 0) {
    result = result.filter(i => filters.domains!.includes(i.domain));
  }
  if (filters.assigneeId) {
    result = result.filter(i => i.assigneeId === filters.assigneeId);
  }
  if (filters.thisWeek) {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    result = result.filter(i => {
      if (!i.dueDate) return false;
      const due = new Date(i.dueDate).getTime();
      return due >= now && due <= now + weekMs;
    });
  }
  if (filters.status) {
    result = result.filter(i => i.status === filters.status);
  }
  if (filters.parentGoalId !== undefined) {
    result = result.filter(i => i.parentGoalId === filters.parentGoalId);
  }

  return result;
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

function sortItems(items: RoadmapItem[]): RoadmapItem[] {
  return [...items].sort((a, b) => {
    // 1. Priority (nulls last)
    const pa = a.priority != null ? PRIORITY_ORDER[a.priority] : 99;
    const pb = b.priority != null ? PRIORITY_ORDER[b.priority] : 99;
    if (pa !== pb) return pa - pb;
    // 2. Due date (nulls last)
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

// ─── Enrich with photoURL from admin list ────────────────────────────────────

function enrichWithPhotos(items: RoadmapItem[], admins: AdminUser[]): RoadmapItem[] {
  const photoMap = new Map(admins.map(a => [a.id, a.photoURL ?? null]));
  return items.map(i => ({
    ...i,
    assigneePhotoURL: i.assigneeId ? (photoMap.get(i.assigneeId) ?? null) : null,
  }));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch all items from dev + sales domains, normalise to RoadmapItem[],
 * apply optional filters, and sort by priority + dueDate.
 *
 * Marketing domain is not yet populated (collection marketing_tasks not seeded),
 * but the normaliser is ready when that collection is built.
 */
export async function getUnifiedRoadmap(
  filters: RoadmapFilters = {},
  admins: AdminUser[] = [],
): Promise<RoadmapItem[]> {
  const [devTasks, authorities] = await Promise.all([
    getAllTasks(),
    getAllAuthorities(),
  ]);

  const devItems = devTasks.map(fromProductTask);

  const salesItems: RoadmapItem[] = authorities.flatMap((auth: Authority) => {
    const tasks = Array.isArray(auth.tasks) ? auth.tasks : [];
    return tasks.map(t => fromAuthorityTask(t as unknown as Record<string, unknown>, auth.id));
  });

  const all = [...devItems, ...salesItems];
  const enriched = admins.length > 0 ? enrichWithPhotos(all, admins) : all;
  const filtered = applyFilters(enriched, filters);
  return sortItems(filtered);
}

// ─── Write-back ───────────────────────────────────────────────────────────────

/**
 * Update an item's status and write the change back to the originating domain.
 * Always maps CommonStatus → native status before writing.
 */
export async function updateRoadmapItemStatus(
  item: RoadmapItem,
  newCommonStatus: CommonStatus,
): Promise<void> {
  if (item.domain === 'dev') {
    const nativeStatus = COMMON_TO_DEV[newCommonStatus];
    const updateData: Record<string, unknown> = {
      status: nativeStatus,
      updatedAt: serverTimestamp(),
    };
    if (newCommonStatus === 'done') {
      updateData.completedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'product_roadmap', item.sourceRef.docId), updateData);
    return;
  }

  if (item.domain === 'sales') {
    const nativeStatus = COMMON_TO_SALES[newCommonStatus];
    const authorityId = item.sourceRef.docId;
    const taskId = item.sourceRef.taskId;
    if (!taskId) throw new Error('Missing taskId in sourceRef for sales item');

    await fetch(`/api/admin/authorities/${authorityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updateTask: {
          id: taskId,
          status: nativeStatus,
        },
      }),
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `PATCH failed: ${res.status}`);
      }
    });
    return;
  }

  throw new Error(`Write-back not yet implemented for domain: ${item.domain}`);
}

/**
 * Update any writable fields on an item and write back to the originating domain.
 * For sales domain, passes all provided fields through the PATCH route.
 */
export async function updateRoadmapItem(
  item: RoadmapItem,
  updates: {
    title?: string;
    status?: CommonStatus;
    priority?: RoadmapItem['priority'];
    assigneeId?: string | null;
    assigneeName?: string | null;
    dueDate?: string | null;
    parentGoalId?: string | null;
  },
): Promise<void> {
  if (item.domain === 'dev') {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.assigneeId !== undefined) patch.assignedTo = updates.assigneeId;
    if (updates.assigneeName !== undefined) patch.assignedToName = updates.assigneeName;
    if (updates.dueDate !== undefined) patch.dueDate = updates.dueDate;
    if (updates.status !== undefined) {
      patch.status = COMMON_TO_DEV[updates.status];
      if (updates.status === 'done') patch.completedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'product_roadmap', item.sourceRef.docId), patch);
    return;
  }

  if (item.domain === 'sales') {
    const taskPatch: Record<string, unknown> = { id: item.sourceRef.taskId };
    if (updates.title !== undefined) taskPatch.title = updates.title;
    if (updates.priority !== undefined) taskPatch.priority = updates.priority;
    if (updates.assigneeId !== undefined) taskPatch.assignedTo = updates.assigneeId;
    if (updates.assigneeName !== undefined) taskPatch.assignedToName = updates.assigneeName;
    if (updates.dueDate !== undefined) taskPatch.dueDate = updates.dueDate;
    if (updates.parentGoalId !== undefined) taskPatch.parentGoalId = updates.parentGoalId;
    if (updates.status !== undefined) taskPatch.status = COMMON_TO_SALES[updates.status];

    await fetch(`/api/admin/authorities/${item.sourceRef.docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateTask: taskPatch }),
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `PATCH failed: ${res.status}`);
      }
    });
    return;
  }

  throw new Error(`Write-back not yet implemented for domain: ${item.domain}`);
}
