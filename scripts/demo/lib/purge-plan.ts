/**
 * Purge = plan (read-only, the dry run prints it doc by doc) + execute.
 *
 * Safety (design §2.2, the 19.09 lesson):
 *   - uids come from TWO sources that must agree: demo_registry/personas and the `demo_`
 *     id range of users/. Any difference stops the purge.
 *   - a user is deleted only with BOTH markers (uid prefix + core.demo); an authority /
 *     tenant / group only with BOTH (id prefix `demo-` + isDemo:true). Otherwise: stop.
 *   - a chat that holds anyone who is not demo or a registered viewer stops the purge
 *     (that would be a leak — the owner must look at it, not a script).
 *   - viewers' own docs are never deleted: only the demo ids are removed from their
 *     groupIds / follows, and demo kudos in their inbox are deleted.
 */
import { FieldPath, FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { isDemoTenantId, isDemoUid } from '@/lib/demo';
import { DEMO_TENANT_PREFIX, DEMO_UID_PREFIX, REGISTRY_COLLECTION, REGISTRY_DOCS } from './config';
import {
  CHATS_COLLECTION,
  PER_USER_DOCS,
  PER_USER_ID_PREFIX,
  PER_USER_QUERIES,
  SCOPE_AUTHORITY_COLLECTIONS,
  SCOPE_ID_PREFIX_COLLECTIONS,
} from './purge-targets';

export interface PurgeUpdate {
  path: string;
  describe: string;
  patch: Record<string, unknown>;
}

export interface PurgePlan {
  uids: string[];
  viewers: string[];
  deletes: string[];
  updates: PurgeUpdate[];
  problems: string[];
}

const END = '';

function idRange(db: Firestore, collection: string, prefix: string) {
  return db.collection(collection).where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', prefix + END);
}

const chunk = <T,>(a: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

class Collector {
  readonly deletes = new Set<string>();
  constructor(private readonly db: Firestore) {}

  /** The doc (if it exists) and every doc under it. */
  async addRecursive(ref: DocumentReference): Promise<void> {
    if ((await ref.get()).exists) this.deletes.add(ref.path);
    for (const col of await ref.listCollections()) {
      for (const child of await col.listDocuments()) await this.addRecursive(child);
    }
  }

  async addDoc(ref: DocumentReference, recursive: boolean): Promise<void> {
    if (recursive) return this.addRecursive(ref);
    if ((await ref.get()).exists) this.deletes.add(ref.path);
  }
}

async function readRegistry(db: Firestore) {
  const [personas, tenants, viewers] = await db.getAll(
    db.collection(REGISTRY_COLLECTION).doc(REGISTRY_DOCS.personas),
    db.collection(REGISTRY_COLLECTION).doc(REGISTRY_DOCS.tenants),
    db.collection(REGISTRY_COLLECTION).doc(REGISTRY_DOCS.viewers),
  );
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
  const t = tenants.data() ?? {};
  return {
    uids: arr(personas.data()?.uids),
    authorityIds: arr(t.authorityIds),
    unitTenantIds: arr(t.unitTenantIds),
    groupIds: arr(t.groupIds),
    chatIds: arr(t.chatIds),
    viewers: arr(viewers.data()?.uids),
  };
}

export async function planPurge(db: Firestore): Promise<PurgePlan> {
  const problems: string[] = [];
  const c = new Collector(db);
  const reg = await readRegistry(db);
  const viewers = new Set(reg.viewers);

  // ── Who: registry ∩ users range, both markers ───────────────────────────
  const usersSnap = await idRange(db, 'users', DEMO_UID_PREFIX).get();
  const rangeUids = usersSnap.docs.map((d) => d.id);
  const regSet = new Set(reg.uids);
  const missingInRange = reg.uids.filter((u) => !rangeUids.includes(u));
  const missingInReg = rangeUids.filter((u) => !regSet.has(u));
  // A registry uid without a users doc is fine (partial seed / earlier purge) — but an
  // unregistered demo_ user is not something this script created: stop.
  if (missingInReg.length) problems.push(`משתמשי demo_ שאינם ב-demo_registry: ${missingInReg.join(', ')}`);
  for (const d of usersSnap.docs) {
    if (typeof (d.data().core as { demo?: unknown } | undefined)?.demo !== 'object') problems.push(`users/${d.id}: אין core.demo — לא נמחק`);
  }
  if (missingInRange.length) {
    // informational only — they may have been purged before
  }
  const uids = Array.from(new Set([...reg.uids, ...rangeUids])).filter(isDemoUid);

  // ── Per-user (mirror of purgeUserData + the rest) ────────────────────────
  for (const uid of uids) {
    for (const t of PER_USER_DOCS) await c.addDoc(db.collection(t.collection).doc(uid), t.recursive);
    for (const t of PER_USER_ID_PREFIX) {
      const snap = await idRange(db, t.collection, `${uid}_`).get();
      for (const d of snap.docs) await c.addRecursive(d.ref);
    }
    for (const t of PER_USER_QUERIES) {
      const snap = await db.collection(t.collection).where(t.field, '==', uid).get();
      for (const d of snap.docs) await c.addDoc(d.ref, t.recursive);
    }
    const chats = await db.collection(CHATS_COLLECTION).where('participants', 'array-contains', uid).get();
    for (const d of chats.docs) {
      const others = ((d.data().participants as unknown[]) ?? []).filter((p) => !isDemoUid(p) && !viewers.has(String(p)));
      if (others.length) problems.push(`chats/${d.id} כולל משתתף שאינו דמו/צופה (${others.join(', ')}) — לא נמחק`);
      else await c.addRecursive(d.ref);
    }
  }

  // ── Tenants: both markers ────────────────────────────────────────────────
  const cityIds = reg.authorityIds;
  for (const id of Array.from(new Set([...reg.authorityIds, ...reg.unitTenantIds]))) {
    for (const col of ['authorities', 'tenants'] as const) {
      const ref = db.collection(col).doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        if (col === 'tenants') await c.addRecursive(ref); // orphaned units under a missing doc
        continue;
      }
      if (!isDemoTenantId(id) || snap.data()?.isDemo !== true) problems.push(`${col}/${id}: חסר isDemo:true או קידומת demo- — לא נמחק`);
      else await c.addRecursive(ref);
    }
  }
  for (const ids of chunk(cityIds, 30)) {
    if (!ids.length) continue;
    const kids = await db.collection('authorities').where('parentAuthorityId', 'in', ids).get();
    for (const d of kids.docs) {
      if (!isDemoTenantId(d.id) || d.data().isDemo !== true) problems.push(`authorities/${d.id}: ילד של רשות דמו שאינו דמו — לא נמחק`);
      else c.deletes.add(d.ref.path);
    }
  }

  // ── Groups + chats from the registry ─────────────────────────────────────
  for (const g of reg.groupIds) {
    const ref = db.collection('community_groups').doc(g);
    const snap = await ref.get();
    if (snap.exists && (!isDemoTenantId(g) || snap.data()?.isDemo !== true)) problems.push(`community_groups/${g}: לא מסומן דמו — לא נמחק`);
    else await c.addRecursive(ref);
  }
  for (const id of reg.chatIds) {
    const ref = db.collection(CHATS_COLLECTION).doc(id);
    const snap = await ref.get();
    const others = ((snap.data()?.participants as unknown[]) ?? []).filter((p) => !isDemoUid(p) && !viewers.has(String(p)));
    if (others.length) problems.push(`chats/${id} כולל משתתף שאינו דמו/צופה — לא נמחק`);
    else await c.addRecursive(ref);
  }

  // ── Aggregates owned by demo scopes ──────────────────────────────────────
  const scopeIds = Array.from(new Set([...reg.authorityIds, ...reg.unitTenantIds, ...reg.groupIds])).filter(isDemoTenantId);
  for (const ids of chunk(scopeIds, 30)) {
    if (!ids.length) continue;
    const stats = await db.collection('league_scope_stats').where('scopeId', 'in', ids).get();
    for (const d of stats.docs) await c.addRecursive(d.ref);
    for (const col of SCOPE_AUTHORITY_COLLECTIONS) {
      const snap = await db.collection(col).where('authorityId', 'in', ids).get();
      for (const d of snap.docs) await c.addRecursive(d.ref);
    }
  }
  for (const col of SCOPE_ID_PREFIX_COLLECTIONS) {
    const snap = await idRange(db, col, DEMO_TENANT_PREFIX).get();
    for (const d of snap.docs) await c.addRecursive(d.ref);
  }

  // ── Viewers: only remove the demo traces from their own docs ─────────────
  const updates: PurgeUpdate[] = [];
  const demoGroupIds = reg.groupIds.filter(isDemoTenantId);
  for (const v of reg.viewers) {
    const [user, mem, conn] = await db.getAll(db.doc(`users/${v}`), db.doc(`user_memberships/${v}`), db.doc(`connections/${v}`));
    const ug = ((user.data()?.social as { groupIds?: unknown[] } | undefined)?.groupIds ?? []).filter(isDemoTenantId) as string[];
    if (ug.length) updates.push({ path: `users/${v}`, describe: `social.groupIds −${ug.length}`, patch: { 'social.groupIds': FieldValue.arrayRemove(...ug) } });
    const mg = ((mem.data()?.groupIds as unknown[]) ?? []).filter(isDemoTenantId) as string[];
    if (mg.length) updates.push({ path: `user_memberships/${v}`, describe: `groupIds −${mg.length}`, patch: { groupIds: FieldValue.arrayRemove(...mg) } });
    const fw = ((conn.data()?.following as unknown[]) ?? []).filter(isDemoUid) as string[];
    const fr = ((conn.data()?.followers as unknown[]) ?? []).filter(isDemoUid) as string[];
    if (fw.length || fr.length) {
      updates.push({
        path: `connections/${v}`,
        describe: `following −${fw.length}, followers −${fr.length}`,
        patch: { ...(fw.length ? { following: FieldValue.arrayRemove(...fw) } : {}), ...(fr.length ? { followers: FieldValue.arrayRemove(...fr) } : {}) },
      });
    }
    const kudos = await db.collection(`kudos/${v}/inbox`).where('fromUid', '>=', DEMO_UID_PREFIX).where('fromUid', '<', DEMO_UID_PREFIX + END).get();
    kudos.docs.forEach((d) => c.deletes.add(d.ref.path));
    for (const g of demoGroupIds) {
      const m = await db.doc(`community_groups/${g}/members/${v}`).get();
      if (m.exists) c.deletes.add(m.ref.path);
    }
  }

  // ── Registry last ────────────────────────────────────────────────────────
  for (const d of await db.collection(REGISTRY_COLLECTION).listDocuments()) await c.addRecursive(d);

  // Never a viewer's own docs (only their membership rows in demo groups / demo kudos).
  const viewerOwn = new Set(reg.viewers.flatMap((v) => [`users/${v}`, `user_memberships/${v}`, `connections/${v}`, `streaks/${v}`]));
  const deletes = Array.from(c.deletes).filter((p) => !viewerOwn.has(p));
  return { uids, viewers: reg.viewers, deletes, updates, problems };
}

export function summarizePlan(plan: PurgePlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of plan.deletes) {
    const segs = p.split('/');
    const key = segs.length > 2 ? `${segs[0]}/*/${segs[segs.length - 2]}` : segs[0];
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export async function executePurge(db: Firestore, plan: PurgePlan, log: (s: string) => void = () => {}): Promise<Record<string, number>> {
  if (plan.problems.length) throw new Error(`עצירה — לא נמחק כלום:\n${plan.problems.join('\n')}`);
  for (const u of plan.updates) await db.doc(u.path).update(u.patch);
  const registry = plan.deletes.filter((p) => p.startsWith(`${REGISTRY_COLLECTION}/`));
  const rest = plan.deletes.filter((p) => !p.startsWith(`${REGISTRY_COLLECTION}/`));
  // Deepest first, so a subcollection doc never outlives its parent mid-run.
  rest.sort((a, b) => b.split('/').length - a.split('/').length);
  for (const part of [rest, registry]) {
    for (let i = 0; i < part.length; i += 400) {
      const batch = db.batch();
      part.slice(i, i + 400).forEach((p) => batch.delete(db.doc(p)));
      await batch.commit();
      log(`  נמחקו ${Math.min(i + 400, part.length)}/${part.length}`);
    }
  }
  const counts = summarizePlan(plan);
  await db.collection('audit_logs').add({
    adminId: 'system',
    adminName: 'scripts/demo/purge.ts',
    actionType: 'DELETE',
    targetEntity: 'DemoWorld',
    targetId: 'demo_registry',
    details: 'מחיקת עולם הדמו (סקריפט, ביטוי אישור)',
    oldValue: null,
    newValue: JSON.stringify({ users: plan.uids.length, docs: plan.deletes.length, updates: plan.updates.length, counts }).slice(0, 10_000),
    sourceIp: 'script',
    timestamp: FieldValue.serverTimestamp(),
  });
  return counts;
}
