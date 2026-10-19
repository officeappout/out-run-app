/**
 * Firestore access for the costs dashboard (Admin SDK). Reads are field-guarded; writes go
 * only through the super-admin API routes.
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ADMIN_COSTS_COLLECTION, ADMIN_COST_ITEMS_COLLECTION, type CostItem, type FxRates, type MonthDoc } from './cost-types';
import { parseCostItem, type CostItemInput } from './item-schema';
import { isSaneRate } from './fx';
import { AI_USAGE_GLOBAL } from './connectors/ai-ledger';

const MAX_ITEMS = 300;

export async function loadItems(db: Firestore): Promise<CostItem[]> {
  const snap = await db.collection(ADMIN_COST_ITEMS_COLLECTION).limit(MAX_ITEMS).get();
  return snap.docs
    .map((d) => parseCostItem(d.id, d.data()))
    .filter((x): x is CostItem => x !== null)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'he'));
}

export async function loadMonths(db: Firestore, months: string[]): Promise<Record<string, MonthDoc | null>> {
  const col = db.collection(ADMIN_COSTS_COLLECTION);
  const snaps = await db.getAll(...months.map((m) => col.doc(m)));
  const out: Record<string, MonthDoc | null> = {};
  snaps.forEach((s, i) => {
    out[months[i]] = s.exists ? ({ month: months[i], ...(s.data() as Omit<MonthDoc, 'month'>) }) : null;
  });
  return out;
}

export async function loadTodayAiUsd(db: Firestore, dayKey: string): Promise<number | null> {
  const snap = await db.collection(AI_USAGE_GLOBAL).doc(dayKey).get();
  const v = snap.data()?.costUsd;
  return typeof v === 'number' && Number.isFinite(v) ? v : snap.exists ? 0 : null;
}

export async function createItem(db: Firestore, input: CostItemInput): Promise<string> {
  const ref = db.collection(ADMIN_COST_ITEMS_COLLECTION).doc();
  await ref.set({
    ...input,
    vendorKey: input.vendorKey ?? null,
    renewalDate: input.renewalDate ?? null,
    endDate: null,
    notes: input.notes ?? '',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Returns false when the item does not exist. Deactivating stamps endDate (history stays). */
export async function patchItem(
  db: Firestore,
  id: string,
  patch: Partial<CostItemInput> & { active?: boolean },
  todayKey: string,
): Promise<boolean> {
  const ref = db.collection(ADMIN_COST_ITEMS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const update: Record<string, unknown> = { ...patch, updatedAt: FieldValue.serverTimestamp() };
    if (patch.active === false && snap.data()?.active !== false) update.endDate = todayKey;
    if (patch.active === true) update.endDate = null;
    tx.update(ref, update);
    return true;
  });
}

/** Manual FX for a month (null clears it — the next refresh fetches again). */
export async function setMonthFx(db: Firestore, month: string, rates: FxRates | null, nowMs: number): Promise<void> {
  const ref = db.collection(ADMIN_COSTS_COLLECTION).doc(month);
  if (rates && (!isSaneRate(rates.USD) || !isSaneRate(rates.EUR))) throw new Error('bad_rate');
  await ref.set(
    {
      month,
      fx: rates ? { USD: rates.USD, EUR: rates.EUR, source: 'manual', updatedAtMs: nowMs } : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
