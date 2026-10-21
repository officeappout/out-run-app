/**
 * city-inventory/store.ts — write / read through an INJECTED db.
 *
 * No firebase imports and no default db: the caller (I1/I2 — a David-run
 * `--apply` script or a server route) passes the Admin Firestore instance
 * and `FieldValue.serverTimestamp()`. The summary doc and its history row
 * are written in one batch (CLAUDE.md law 4: all-or-nothing).
 *
 * The interfaces below are the subset of the Admin SDK this module uses —
 * `db.doc(path)`, `docRef.get()`, `db.batch().set().commit()`.
 */
import {
  buildCityInventoryDoc,
  buildCityInventoryRunDoc,
  cityInventoryDocPath,
  cityInventoryRunDocPath,
  readCityInventoryDoc,
  readCityInventoryRunDoc,
  type CityInventoryInput,
} from './doc';
import { CITY_INVENTORY_COLLECTION, CITY_INVENTORY_RUNS_SUBCOLLECTION, type CityInventory, type CityInventoryRun } from './types';

export interface InventoryDocSnapshot {
  exists: boolean;
  data(): unknown;
}

export interface InventoryDocRef {
  get(): Promise<InventoryDocSnapshot>;
}

export interface InventoryBatch {
  set(ref: InventoryDocRef, data: Record<string, unknown>): unknown;
  commit(): Promise<unknown>;
}

export interface InventoryDb {
  doc(path: string): InventoryDocRef;
  batch(): InventoryBatch;
}

/** Writes the summary doc and its run row atomically. */
export async function writeCityInventory(db: InventoryDb, inv: CityInventoryInput, serverTimestamp: unknown): Promise<void> {
  const summary = buildCityInventoryDoc(inv, serverTimestamp);
  const run = buildCityInventoryRunDoc(inv, serverTimestamp);
  const batch = db.batch();
  batch.set(db.doc(cityInventoryDocPath(inv.authorityId)), summary);
  batch.set(db.doc(cityInventoryRunDocPath(inv.authorityId, inv.snapshot.runId)), run);
  await batch.commit();
}

export async function readCityInventory(db: InventoryDb, authorityId: string): Promise<CityInventory | null> {
  if (!authorityId?.trim()) return null;
  const snap = await db.doc(cityInventoryDocPath(authorityId)).get();
  if (!snap.exists) return null;
  return readCityInventoryDoc(authorityId, snap.data());
}

export async function readCityInventoryRun(db: InventoryDb, authorityId: string, runId: string): Promise<CityInventoryRun | null> {
  if (!authorityId?.trim() || !runId?.trim()) return null;
  const snap = await db.doc(cityInventoryRunDocPath(authorityId, runId)).get();
  if (!snap.exists) return null;
  return readCityInventoryRunDoc(runId, snap.data());
}

/** Subset of the Admin SDK for the run-history query (server routes only — never a client query). */
export interface InventoryRunsQueryDb {
  collection(path: string): {
    orderBy(field: string, direction: 'asc' | 'desc'): {
      limit(n: number): { get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }> };
    };
  };
}

export const MAX_RECENT_RUNS = 20;

/** Newest first, by `createdAt` (server timestamp). Unreadable rows are skipped, never guessed. */
export async function readRecentCityInventoryRuns(db: InventoryRunsQueryDb, authorityId: string, limit = 5): Promise<CityInventoryRun[]> {
  if (!authorityId?.trim() || authorityId.includes('/')) return [];
  const n = Math.max(1, Math.min(MAX_RECENT_RUNS, Math.floor(Number.isFinite(limit) ? limit : 5)));
  const snap = await db
    .collection(`${CITY_INVENTORY_COLLECTION}/${authorityId}/${CITY_INVENTORY_RUNS_SUBCOLLECTION}`)
    .orderBy('createdAt', 'desc')
    .limit(n)
    .get();
  return snap.docs
    .map((d) => readCityInventoryRunDoc(d.id, d.data()))
    .filter((r): r is CityInventoryRun => r !== null);
}
