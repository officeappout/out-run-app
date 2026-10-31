/**
 * Camera scan visual index (owner 31.10, brand-aware recognition): one short look line per
 * (equipment, brand), written by the fast model from the owner's reference photos (Drive
 * "מתקנים" → public/scan-reference, listed in src/lib/ai/scan/scan-reference-photos.json), into
 * src/lib/ai/scan/equipment-visual-index.json, keyed `${equipmentId}::${brand}`. The scan prompt
 * shows those lines next to each brand, so the Ludus and Urbanix versions read apart.
 *
 * No Firestore. Costs one Haiku call per (equipment, brand), roughly $0.0005 each. Writes only
 * the local JSON, and only with --write. Lines already there are kept unless --refresh.
 *
 *   ANTHROPIC_API_KEY='…' npx tsx scripts/scan/build-visual-index.ts            (dry run)
 *   ANTHROPIC_API_KEY='…' npx tsx scripts/scan/build-visual-index.ts --write
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'src/lib/ai/scan/equipment-visual-index.json');
const REFS = path.join(ROOT, 'src/lib/ai/scan/scan-reference-photos.json');
const MODEL = process.env.AI_MODEL_FAST?.trim() || 'claude-haiku-5-5';
const WRITE = process.argv.includes('--write');
const REFRESH = process.argv.includes('--refresh');

if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1); }

const PROMPT = (brand: string) =>
  `This is a reference photo of an outdoor fitness machine made by ${brand} (a person may be using it; ignore them). ` +
  'In at most 18 English words, describe what makes THIS machine recognizable in a street photo: ' +
  'frame shape, tube profile, colors, joints, seats, pads or handles. No brand name, no people, no marketing words.';

async function main() {
  const refs = JSON.parse(fs.readFileSync(REFS, 'utf8')) as Array<{ equipmentId: string; brand: string; path: string }>;
  const index: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const client = new Anthropic();
  const firstPerKey = new Map<string, string>();
  for (const r of refs) {
    const k = `${r.equipmentId}::${r.brand}`;
    if (!firstPerKey.has(k)) firstPerKey.set(k, r.path);
  }
  let made = 0;
  console.log(`${firstPerKey.size} (equipment, brand) pairs`);
  for (const [k, rel] of Array.from(firstPerKey)) {
    if (index[k] && !REFRESH) continue;
    const brand = k.split('::')[1];
    const data = fs.readFileSync(path.join(ROOT, 'public', rel)).toString('base64');
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 80,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: PROMPT(brand) },
        ] }],
      });
      const text = msg.content.find((c) => c.type === 'text');
      if (!text) console.warn(`no text for ${k}: ${msg.stop_reason} ${JSON.stringify(msg.content).slice(0, 200)}`);
      const line = text && text.type === 'text' ? text.text.trim().replace(/\s+/g, ' ').replace(/\.$/, '').slice(0, 160) : '';
      if (line) { index[k] = line; made++; console.log(`${k}: ${line}`); }
    } catch (err) {
      console.warn(`skip ${k}:`, err instanceof Error ? err.message : err);
    }
  }
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  console.log(`\n${made} new, ${Object.keys(sorted).length} total.`);
  if (WRITE) { fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n'); console.log(`written ${OUT}`); }
  else console.log('dry run: pass --write to save.');
}

main().catch((e) => { console.error(e); process.exit(1); });
