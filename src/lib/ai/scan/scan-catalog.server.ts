/**
 * Camera scan: the gym_equipment catalog for the candidate list, read with the Admin SDK and
 * cached per server instance (same TTL idea as round4/parks.server). Nothing is written.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import visualIndex from './equipment-visual-index.json';
import referencePhotos from './scan-reference-photos.json';
import type { RawCatalogDoc, ReferencePhoto, VisualIndex } from './scan-candidates';

const CATALOG_TTL_MS = 10 * 60_000;
let cache: { at: number; docs: RawCatalogDoc[] } | null = null;

export async function loadScanCatalog(db: Firestore, nowMs = Date.now()): Promise<RawCatalogDoc[]> {
  if (cache && nowMs - cache.at < CATALOG_TTL_MS) return cache.docs;
  const snap = await db
    .collection('gym_equipment')
    .select('name', 'nameLocalized', 'movementPattern', 'availableInLocations', 'isCardio', 'brands')
    .get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RawCatalogDoc, 'id'>) }));
  cache = { at: nowMs, docs };
  return docs;
}

/** The park's recorded equipment ids, or [] (unknown park, unpublished, bad id). */
export async function loadParkEquipmentIds(db: Firestore, parkId: string | undefined): Promise<string[]> {
  if (!parkId) return [];
  const snap = await db.collection('parks').doc(parkId).get();
  const eq = snap.exists ? snap.get('gymEquipment') : null;
  if (!Array.isArray(eq)) return [];
  return eq.map((e: { equipmentId?: unknown }) => (typeof e?.equipmentId === 'string' ? e.equipmentId : '')).filter(Boolean);
}

/** The (equipment, brand) look lines; {} until scripts/scan/build-visual-index.ts has been run. */
export function loadVisualIndex(): VisualIndex {
  return visualIndex as VisualIndex;
}

/**
 * The owner's reference photos (Drive "מתקנים", Ludus + Urbanix), thumbnails served from
 * public/scan-reference, as absolute URLs on this deployment's origin so the model can fetch them.
 */
export function loadReferencePhotos(origin: string): ReferencePhoto[] {
  return (referencePhotos as Array<{ equipmentId: string; brand: string; path: string }>).map((r) => ({
    equipmentId: r.equipmentId,
    brand: r.brand,
    url: `${origin}${r.path}`,
  }));
}
