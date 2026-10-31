/**
 * Camera scan visual index (owner 31.10, brand-aware recognition): one short look line per
 * (equipment, brand), written from each gym_equipment brands[].imageUrl by the fast model, into
 * src/lib/ai/scan/equipment-visual-index.json (keyed `${equipmentId}::${brandName}`). The scan
 * prompt shows those lines next to each brand, so Ludus and Ornix versions read apart.
 *
 * READ-ONLY on PRODUCTION Firestore (gym_equipment). Costs one Haiku call per (equipment, brand)
 * with a photo, roughly $0.0005 each. Writes only the local JSON, and only with --write.
 * Lines already in the JSON are kept unless --refresh; --only=<equipmentId> limits the run.
 *
 *   FIREBASE_SERVICE_ACCOUNT_KEY='…' ANTHROPIC_API_KEY='…' npx tsx scripts/scan/build-visual-index.ts            (dry run)
 *   FIREBASE_SERVICE_ACCOUNT_KEY='…' ANTHROPIC_API_KEY='…' npx tsx scripts/scan/build-visual-index.ts --write
 */
import fs from 'node:fs';
import path from 'node:path';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

const OUT = path.resolve(__dirname, '../../src/lib/ai/scan/equipment-visual-index.json');
const MODEL = process.env.AI_MODEL_FAST?.trim() || 'claude-haiku-5-5';
const WRITE = process.argv.includes('--write');
const REFRESH = process.argv.includes('--refresh');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
if (!key?.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });

const PROMPT = (name: string, brand: string) =>
  `This is the catalog photo of the outdoor fitness machine "${name}" made by ${brand}. ` +
  'In at most 18 English words, describe what makes THIS version recognizable in a street photo: ' +
  'frame shape, tube profile, colors, joints, seats or handles. No brand name, no marketing words.';

async function main() {
  const index: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const client = new Anthropic();
  const snap = await admin.firestore().collection('gym_equipment').get();
  let made = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    if (ONLY && doc.id !== ONLY) continue;
    const d = doc.data();
    const locs = d.availableInLocations;
    if (Array.isArray(locs) && locs.length && !locs.includes('park')) continue;
    const name = typeof d.name === 'string' ? d.name : d.name?.en ?? d.name?.he ?? doc.id;
    for (const b of Array.isArray(d.brands) ? d.brands : []) {
      const brand = typeof b?.brandName === 'string' ? b.brandName.trim() : '';
      const url = typeof b?.imageUrl === 'string' && b.imageUrl.startsWith('https://') ? b.imageUrl : '';
      const k = `${doc.id}::${brand}`;
      if (!brand || !url) continue;
      if (index[k] && !REFRESH) { skipped++; continue; }
      try {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: 80,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url } }, { type: 'text', text: PROMPT(name, brand) }] }],
        });
        const text = msg.content.find((c) => c.type === 'text');
        const line = text && text.type === 'text' ? text.text.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
        if (line) { index[k] = line; made++; console.log(`${k}: ${line}`); }
      } catch (err) {
        console.warn(`skip ${k}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  console.log(`\n${made} new, ${skipped} kept, ${Object.keys(sorted).length} total.`);
  if (WRITE) { fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n'); console.log(`written ${OUT}`); }
  else console.log('dry run: pass --write to save.');
}

main().catch((e) => { console.error(e); process.exit(1); });
