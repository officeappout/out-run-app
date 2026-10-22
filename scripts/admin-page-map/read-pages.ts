/** Reads every src/app/admin/**\/page.tsx under `repoRoot` as { route, source }, sorted. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { PageSource } from './build-page-map';

export function readAdminPages(repoRoot: string): PageSource[] {
  const appDir = join(repoRoot, 'src', 'app');
  const adminDir = join(appDir, 'admin');
  const out: PageSource[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'page.tsx') {
        const rel = relative(appDir, dir).split(sep).join('/');
        // route groups "(x)" don't appear in the URL
        const route = `/${rel.split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/')}`;
        out.push({ route, source: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(adminDir);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}
