// Read-only investigation script (SPEC-07 stage 0). No writes.
// Builds the proposed lean catalog shape from real production park data and
// measures its actual gzipped size — not an estimate.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { gzipSync } from 'zlib';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function resolveImage(d: any): string | null {
  return d.imageUrl || d.image || (Array.isArray(d.images) ? d.images[0] : null) || null;
}

// Mirrors route.ts's computeIsPrimaryFitness/computeHasUsableEquipment exactly.
const FITNESS_RELEVANT_SPORT_TYPES = new Set(['calisthenics', 'functional', 'crossfit']);
function computeIsPrimaryFitness(d: any): boolean {
  const sportTypes: unknown[] = Array.isArray(d.sportTypes) ? d.sportTypes : [];
  return sportTypes.some((t) => FITNESS_RELEVANT_SPORT_TYPES.has(String(t))) || d.facilityType === 'gym_park';
}
function computeHasUsableEquipment(d: any): boolean {
  const gymEquipment: unknown[] = Array.isArray(d.gymEquipment) ? d.gymEquipment : [];
  return gymEquipment.some(
    (e: any) => e && typeof e.equipmentId === 'string' && e.equipmentId.trim().length > 0,
  );
}

async function main() {
  const snap = await db.collection('parks').get();

  const catalog = snap.docs
    .map((doc) => {
      const d = doc.data();
      const published = d.published ?? (d.contentStatus === 'published');
      if (!published) return null;
      const lat = Number(d.location?.lat);
      const lng = Number(d.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: doc.id,
        name: d.name || '',
        lat,
        lng,
        facilityType: d.facilityType || 'gym_park',
        isFunctional: d.isFunctional === true,
        urbanType: d.urbanType || null,
        imageUrl: resolveImage(d),
        hasUsableEquipment: computeHasUsableEquipment(d),
        isPrimaryFitness: computeIsPrimaryFitness(d),
      };
    })
    .filter(Boolean);

  const json = JSON.stringify(catalog);
  const uncompressed = Buffer.byteLength(json, 'utf-8');
  const gzipped = gzipSync(json, { level: 9 }).length;

  console.log(JSON.stringify({
    parkCount: catalog.length,
    uncompressedBytes: uncompressed,
    uncompressedKB: (uncompressed / 1024).toFixed(1),
    gzippedBytes: gzipped,
    gzippedKB: (gzipped / 1024).toFixed(1),
    avgBytesPerParkUncompressed: (uncompressed / catalog.length).toFixed(1),
    sampleRecord: catalog[0],
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
