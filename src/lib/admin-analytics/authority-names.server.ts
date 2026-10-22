import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

/** Authority display name: a string, or the he/en of a localized object; never throws. */
export function authorityNameOf(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['he', 'en']) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
  }
  return null;
}

/** id → name for up to 30 ids (one getAll). Unknown / unreadable → the id itself. */
export async function authorityNames(db: Firestore, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 30);
  const out = new Map<string, string>();
  if (!unique.length) return out;
  try {
    const snaps = await db.getAll(...unique.map((id) => db.collection('authorities').doc(id)));
    snaps.forEach((s, i) => out.set(unique[i], authorityNameOf(s.data()?.name) ?? unique[i]));
  } catch (err) {
    console.warn('[admin-analytics] authority names unavailable', err);
    unique.forEach((id) => out.set(id, id));
  }
  return out;
}
