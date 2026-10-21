/**
 * scripts/city-inventory/lib/output.node.ts — local dry-run output of the
 * inventory (RC4 I1): `scripts/output/city-inventory/<date>/<authorityId>.json`
 * (+ `.md` table), and the peer rows read back from earlier runs.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { CityInventoryInput, InventoryExtras, PeerRow } from '../../../src/lib/city-inventory';

export const OUTPUT_ROOT = path.join('scripts', 'output', 'city-inventory');

export interface InventorySummaryFile {
  kind: 'city-inventory-dry-run';
  generatedAt: string;
  apply: boolean;
  inventory: CityInventoryInput;
  extras: InventoryExtras;
  approvedRoutes: { approved: number; byAuthorityId: number; byCityName: number; pending: number; noStatus: number };
  timingsMs: Record<string, number>;
}

export function writeSummary(summary: InventorySummaryFile, table: string, root = OUTPUT_ROOT): { json: string; md: string } {
  const dir = path.join(root, summary.generatedAt.slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, summary.inventory.authorityId);
  fs.writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2));
  fs.writeFileSync(`${base}.md`, `${table}\n`);
  return { json: `${base}.json`, md: `${base}.md` };
}

/** Latest earlier run per authority, as peer rows for the density median. */
export function readPeerRows(root = OUTPUT_ROOT): PeerRow[] {
  if (!fs.existsSync(root)) return [];
  const latest = new Map<string, { at: string; row: PeerRow }>();
  for (const day of fs.readdirSync(root)) {
    const dir = path.join(root, day);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Partial<InventorySummaryFile>;
        const inv = s.inventory;
        if (s.kind !== 'city-inventory-dry-run' || !inv?.authorityId || !s.extras?.densities || !s.generatedAt) continue;
        const prev = latest.get(inv.authorityId);
        if (prev && prev.at >= s.generatedAt) continue;
        latest.set(inv.authorityId, { at: s.generatedAt, row: { authorityId: inv.authorityId, authorityType: inv.authorityType, densities: s.extras.densities } });
      } catch {
        // an unreadable file is not a peer — skipped, never guessed
      }
    }
  }
  return Array.from(latest.values()).map((v) => v.row);
}
