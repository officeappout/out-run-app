/**
 * Demo world — is this authority / tenant a demo one? (client SDK; admin
 * panel services). Same rule as resolveTenantIsDemo in
 * src/lib/demo-world.server.ts: `demo-` id prefix (checked first, so a real
 * id never costs a read) AND isDemo:true on the doc. Cached per session;
 * fails closed (read error ⇒ not demo ⇒ demo residents stay excluded).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isDemoTenantId, isStrictDemoTenant } from '@/lib/demo';

const cache = new Map<string, Promise<boolean>>();

export function isDemoTenantClient(collectionName: 'authorities' | 'tenants', id: string | null | undefined): Promise<boolean> {
  if (!isDemoTenantId(id)) return Promise.resolve(false);
  const key = `${collectionName}/${id}`;
  let p = cache.get(key);
  if (!p) {
    p = getDoc(doc(db, collectionName, id as string))
      .then((snap) => isStrictDemoTenant(snap.data(), id))
      .catch(() => false);
    cache.set(key, p);
  }
  return p;
}
