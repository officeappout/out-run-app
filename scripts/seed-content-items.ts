#!/usr/bin/env npx tsx
/**
 * seed-content-items — fills site_content (the shared FAQ / articles / help source) from:
 *   • the website FAQ        <website>/content/faq.ts       (he + en, both audiences)
 *   • the website articles   <website>/content/articles.ts  (draft flags kept → status 'draft')
 *   • the app-help entries   src/lib/ai/coach/app-help/entries.ts + src/lib/app-help/round4-entries.ts
 *
 *   npx tsx --env-file=.env.local scripts/seed-content-items.ts                 # DRY RUN (default): reads only
 *   npx tsx --env-file=.env.local scripts/seed-content-items.ts --write         # apply
 *   … --website=/path/to/appout-website   (default: ../appout-website next to this repo)
 *
 * Idempotent by stable ids (src/lib/content-items/seed-plan.ts). An item someone edited in
 * /admin/content (updatedBy ≠ 'seed-content-items') is NEVER overwritten — it is listed as
 * "skipped (edited in admin)". Each write is conditioned on the doc's updateTime from the read,
 * so an admin edit that lands between the read and the write is skipped too.
 *
 * Auth: FIREBASE_SERVICE_ACCOUNT_KEY (JSON) from .env.local, like the other seed scripts.
 */
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import * as admin from 'firebase-admin';
import { APP_HELP_ENTRIES } from '../src/lib/ai/coach/app-help/entries';
import { ROUND4_HELP_ENTRIES } from '../src/lib/app-help/round4-entries';
import { HELP_CHAPTERS } from '../src/lib/app-help/chapters';
import { CONTENT_ITEMS_COLLECTION, SEED_ACTOR } from '../src/lib/content-items/types';
import { ContentInputSchema } from '../src/lib/content-items/schema';
import {
  articlesToSeedDocs,
  faqToSeedDocs,
  helpToSeedDocs,
  planSeed,
  type ExistingMarker,
  type SeedDoc,
  type WebsiteArticle,
  type WebsiteFaqGroup,
} from '../src/lib/content-items/seed-plan';

const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(__dirname, '..');
const websiteArg = process.argv.find((a) => a.startsWith('--website='));
const WEBSITE = path.resolve(websiteArg ? websiteArg.slice('--website='.length) : path.join(ROOT, '..', 'appout-website'));

async function loadWebsite(): Promise<{ faq: Record<'he' | 'en', WebsiteFaqGroup[]>; articles: WebsiteArticle[] }> {
  const faqFile = path.join(WEBSITE, 'content', 'faq.ts');
  const articlesFile = path.join(WEBSITE, 'content', 'articles.ts');
  for (const f of [faqFile, articlesFile]) {
    if (!fs.existsSync(f)) throw new Error(`missing ${f} — pass --website=<path to appout-website>`);
  }
  const faqMod = (await import(pathToFileURL(faqFile).href)) as { FAQ?: Record<'he' | 'en', WebsiteFaqGroup[]> };
  const artMod = (await import(pathToFileURL(articlesFile).href)) as { ARTICLES?: WebsiteArticle[] };
  if (!faqMod.FAQ || !artMod.ARTICLES) throw new Error('website content files changed shape (FAQ / ARTICLES exports not found)');
  return { faq: faqMod.FAQ, articles: artMod.ARTICLES };
}

function topicOf(id: string): string {
  return HELP_CHAPTERS.find((c) => c.entryIds.includes(id))?.id ?? 'settings';
}

async function main(): Promise<void> {
  const { faq, articles } = await loadWebsite();
  const desired: SeedDoc[] = [
    ...faqToSeedDocs(faq),
    ...articlesToSeedDocs(articles, 'he'),
    ...helpToSeedDocs([...APP_HELP_ENTRIES, ...ROUND4_HELP_ENTRIES], topicOf),
  ];
  // Validate every doc with the same schema the admin editor uses.
  for (const d of desired) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, seedHash, ...input } = d;
    const v = ContentInputSchema.safeParse(input);
    if (!v.success) throw new Error(`invalid seed doc ${id}: ${v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set (run with --env-file=.env.local).');
    process.exit(1);
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawKey) as admin.ServiceAccount) });
  const db = admin.firestore();
  const col = db.collection(CONTENT_ITEMS_COLLECTION);

  const snap = await col.get();
  const existing = new Map<string, ExistingMarker>();
  const updateTimes = new Map<string, admin.firestore.Timestamp>();
  for (const d of snap.docs) {
    const x = d.data() ?? {};
    existing.set(d.id, { updatedBy: typeof x.updatedBy === 'string' ? x.updatedBy : undefined, seedHash: typeof x.seedHash === 'string' ? x.seedHash : undefined });
    updateTimes.set(d.id, d.updateTime);
  }

  const plan = planSeed(desired, existing);
  const count = (t: string, list: SeedDoc[]) => list.filter((d) => d.type === t).length;
  console.log(`\nsite_content seed — ${WRITE ? 'WRITE' : 'DRY RUN'} · website: ${WEBSITE}`);
  console.log(`  source: ${desired.length} docs (faq ${count('faq', desired)}, article ${count('article', desired)}, help ${count('help', desired)}) · existing in Firestore: ${snap.size}`);
  console.log(`  create: ${plan.create.length}  update (seed-owned, source changed): ${plan.update.length}  unchanged: ${plan.unchanged.length}  skipped (edited in admin): ${plan.skippedEdited.length}`);
  for (const d of plan.create) console.log(`    + ${d.id}  [${d.status}]`);
  for (const d of plan.update) console.log(`    ~ ${d.id}`);
  for (const id of plan.skippedEdited) console.log(`    = ${id}  (edited in admin — not touched)`);

  if (!WRITE) {
    console.log('\nDry run — nothing written. Re-run with --write to apply.');
    return;
  }

  let written = 0;
  let raced = 0;
  for (const d of [...plan.create, ...plan.update]) {
    const { id, ...data } = d;
    const doc = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: SEED_ACTOR };
    try {
      if (plan.create.includes(d)) await col.doc(id).create(doc);
      else {
        // precondition: the doc is still exactly what we read (an admin save in between → skip)
        const at = updateTimes.get(id);
        await col.doc(id).update(doc, ...(at ? [{ lastUpdateTime: at }] : []));
      }
      written++;
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 6 || code === 9) { raced++; console.warn(`    ! ${id} changed since the read — skipped`); }
      else throw err;
    }
  }
  console.log(`\nWritten: ${written} · skipped (changed meanwhile): ${raced}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
