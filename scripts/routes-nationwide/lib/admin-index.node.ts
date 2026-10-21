/**
 * admin_level 7/8 boundary relations from the local Geofabrik PBF → name
 * list, cached as JSON next to the run. One osmium pass for the whole country.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { AdminRelation } from '../../../src/lib/routes-nationwide/admin-match';

export function loadAdminRelations(pbf: string, cacheDir: string): AdminRelation[] {
  const cache = path.join(cacheDir, 'admin-relations.json');
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs >= fs.statSync(pbf).mtimeMs) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  fs.mkdirSync(cacheDir, { recursive: true });
  const filtered = path.join(cacheDir, 'admin-boundaries.osm.pbf');
  execFileSync('osmium', ['tags-filter', '-O', '-R', pbf, 'r/boundary=administrative', '-o', filtered], { stdio: ['ignore', 'ignore', 'inherit'] });
  const opl = execFileSync('osmium', ['cat', filtered, '-t', 'relation', '-f', 'opl,add_metadata=false'], { maxBuffer: 1 << 28 }).toString();
  const out: AdminRelation[] = [];
  for (const line of opl.split('\n')) {
    if (!line.startsWith('r')) continue;
    const id = Number(line.slice(1, line.indexOf(' ')));
    const tagsField = line.split(' ').find((f) => f.startsWith('T'));
    if (!tagsField) continue;
    const tags: Record<string, string> = {};
    for (const kv of tagsField.slice(1).split(',')) {
      const i = kv.indexOf('=');
      if (i > 0) tags[decodeOpl(kv.slice(0, i))] = decodeOpl(kv.slice(i + 1));
    }
    const level = tags.admin_level ?? null;
    if (level !== '8' && level !== '7') continue;
    const names = ['name:he', 'name', 'official_name', 'alt_name:he', 'name:en'].map((k) => tags[k]).filter((x): x is string => !!x);
    if (names.length) out.push({ relationId: id, names, adminLevel: level });
  }
  fs.writeFileSync(cache, JSON.stringify(out));
  return out;
}

/** OPL escapes non-trivial characters as %xxxx% (hex code point). */
function decodeOpl(s: string): string {
  return s.replace(/%([0-9a-fA-F]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}
