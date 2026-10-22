/**
 * gen-admin-page-map — writes src/generated/admin-page-map.json (the admin AI assistant's map of
 * every admin page: title, section, who may open it, synonyms). Committed to git; the test
 * src/features/admin/config/__tests__/admin-page-map-fresh.test.ts fails in CI when it is stale.
 *
 * Run after adding/renaming an admin page, a sidebar link, or a synonym:
 *   npx tsx scripts/gen-admin-page-map.ts
 * Writes only on change; no Firestore, no network.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAdminPageMap, serializeAdminPageMap } from './admin-page-map/build-page-map';
import { readAdminPages } from './admin-page-map/read-pages';

const root = process.cwd();
const out = join(root, 'src', 'generated', 'admin-page-map.json');
const text = serializeAdminPageMap(buildAdminPageMap(readAdminPages(root)));
const prev = existsSync(out) ? readFileSync(out, 'utf8') : '';
if (prev === text) {
  console.log('[gen-admin-page-map] up to date');
} else {
  writeFileSync(out, text);
  const n = (JSON.parse(text) as { pages: unknown[] }).pages.length;
  console.log(`[gen-admin-page-map] wrote ${n} pages → src/generated/admin-page-map.json`);
}
