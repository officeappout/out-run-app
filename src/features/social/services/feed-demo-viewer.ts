/**
 * The demo viewer's feed (demo-users-design.md PR 5, owner 21.10.2026).
 *
 * A registered viewer reads the demo world as a resident of a demo city, so
 * their home feed carries the demo cities' newest posts and a demo author's
 * 'partners' post counts as visible to them. 'private' stays private.
 * Only ever called for a viewer (resolveDemoViewerWorld non-null) — no real
 * caller's feed changes, and a real author's post is never affected.
 *
 * Load-safety: one query, `authorityId in <demo city ids>` (≤ 10, index
 * feed_posts authorityId ASC + createdAt DESC), limit max ≤ 50.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { isDemoUid, isStrictDemoTenant } from '@/lib/demo';
import type { DemoViewerWorld } from '@/lib/demo-viewer-world.server';

/** A demo author's non-private post — visible to a viewer. Pure. */
export function viewerSeesDemoPost(data: Record<string, unknown>): boolean {
  return isDemoUid(data.authorUid) && data.audience !== 'private';
}

export async function demoWorldFeedDocs(
  db: Firestore,
  world: DemoViewerWorld,
  max: number,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  // The world's ids are already strict demo ids; the filter is a belt-and-braces guard.
  const cityIds = world.cities.map((c) => c.id).filter((id) => isStrictDemoTenant({ isDemo: true }, id)).slice(0, 10);
  if (!cityIds.length) return [];
  try {
    const snap = await db
      .collection('feed_posts')
      .where('authorityId', 'in', cityIds)
      .orderBy('createdAt', 'desc')
      .limit(Math.min(50, Math.max(1, max)))
      .get();
    // Only demo authors' posts — a real post can never ride in on a demo city id.
    return snap.docs.map((d) => ({ id: d.id, data: d.data() })).filter((d) => isDemoUid(d.data.authorUid));
  } catch (err) {
    console.warn('[feed] demo viewer world read failed', err);
    return [];
  }
}
