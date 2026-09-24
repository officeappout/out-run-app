#!/usr/bin/env node
// Mirrors scripts/geo-discovery-routes.ts (and its full local dependency
// closure, walked transitively) into functions/src/_vendor/, preserving
// every file's exact repo-root-relative path — so the files' own existing
// relative imports ('../src/lib/...', './lib/...') resolve unchanged, with
// zero manual import rewriting. '@/...' alias imports resolve via the
// matching path mapping added to functions/tsconfig.json.
//
// Why this exists: functions/ builds via plain tsc scoped to functions/src
// only (no bundler, no rootDir override) — a Cloud Function cannot directly
// import scripts/geo-discovery-routes.ts, since that file (and its own
// dependency chain) reaches outside functions/. scripts/geo-discovery-routes.ts
// stays the single source of truth; this script re-copies it fresh on every
// functions build, so the two never manually drift apart. Never hand-edit
// anything under functions/src/_vendor/ — it's fully regenerated every build.
'use strict';
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VENDOR_DIR = path.resolve(__dirname, '..', 'src', '_vendor');

const ROOTS = ['scripts/geo-discovery-routes.ts', 'src/lib/route-collections/index.ts'];

// Deliberate, narrow exception to "mirror every file exactly" — NOT a general
// mechanism, just this one file. geoUtils.ts's only non-local import is
// `Route` from route.types.ts, used solely as a parameter type on 3 functions
// (isRouteNearby/isRouteInBounds/distanceToRouteStart) that nothing in this
// closure calls. But route.types.ts itself fans out (via further `import
// type`s) into ~40 unrelated files across the gear/programs/workout-engine
// domains, INCLUDING src/lib/firebase.ts — the browser/client Firebase SDK,
// actively wrong to vendor into a Cloud Function (confirmed empirically:
// the first unrestricted run of this script pulled in exactly that, all 48
// files, before this shim was added). The 6 functions below are verbatim,
// byte-for-byte copies of the real geoUtils.ts exports actually used by this
// closure (route-composition-classify.ts, route-adjacency.service.ts) — pure
// geometry math, no further imports. If either real caller ever starts using
// a geoUtils.ts export not listed here, tsc will fail loudly on the missing
// export — this is self-checking, not a silent risk.
const SHIMS = {
  'src/features/parks/core/services/geoUtils.ts': `// AUTO-GENERATED SHIM — see functions/scripts/vendor-copy-geo-discovery.js SHIMS
// for why this file is a narrow hand-maintained subset, not a mirror of the
// real src/features/parks/core/services/geoUtils.ts. Verbatim copies of the
// 6 pure functions this closure actually calls; no other exports exist here.

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingBetween(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function interpolatePath(
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
}

export function isSameCoord(
  a: [number, number],
  b: [number, number],
  toleranceMeters: number = 5,
): boolean {
  return haversineMeters(a[1], a[0], b[1], b[0]) <= toleranceMeters;
}

export function pathLengthMeters(path: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += haversineMeters(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
  }
  return total;
}

export function pointAtDistanceAlongPath(
  path: [number, number][],
  targetMeters: number,
): [number, number] | null {
  if (path.length < 2) return null;
  if (targetMeters <= 0) return path[0];
  let accumulated = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = haversineMeters(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
    if (accumulated + segLen >= targetMeters) {
      const t = segLen > 0 ? (targetMeters - accumulated) / segLen : 0;
      return interpolatePath(path[i], path[i + 1], t);
    }
    accumulated += segLen;
  }
  return path[path.length - 1]; // targetMeters >= total length (float slack)
}
`,
};

// Matches: from '...'/"...", require('...'), and dynamic import('...').
const IMPORT_RE = /(?:from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\))/g;

function resolveSpecifierToRelPathNoExt(spec, fromRelDir) {
  if (spec.startsWith('@/')) return path.posix.normalize(path.posix.join('src', spec.slice(2)));
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(fromRelDir, spec));
  return null; // bare npm specifier or Node builtin — resolved via node_modules, not vendored
}

function tryResolveFile(relPathNoExt) {
  for (const candidate of [relPathNoExt + '.ts', relPathNoExt + '.tsx', path.posix.join(relPathNoExt, 'index.ts')]) {
    if (fs.existsSync(path.join(REPO_ROOT, candidate))) return candidate;
  }
  return null;
}

const visited = new Set();
const queue = [...ROOTS];
let hadError = false;

fs.rmSync(VENDOR_DIR, { recursive: true, force: true });

while (queue.length) {
  const relPath = queue.shift();
  if (visited.has(relPath)) continue;
  visited.add(relPath);

  const isShimmed = Object.prototype.hasOwnProperty.call(SHIMS, relPath);
  let content;
  if (isShimmed) {
    content = SHIMS[relPath];
  } else {
    const absSrc = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(absSrc)) {
      console.error(`[vendor-copy] MISSING: ${relPath} (referenced but not found on disk)`);
      hadError = true;
      continue;
    }
    content = fs.readFileSync(absSrc, 'utf8');
  }

  const absDest = path.join(VENDOR_DIR, relPath);
  fs.mkdirSync(path.dirname(absDest), { recursive: true });
  fs.writeFileSync(absDest, content);

  if (isShimmed) continue; // shim's own imports (none) are complete as written — don't recurse into the real file

  const fromDir = path.posix.dirname(relPath);
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(content))) {
    const spec = m[1] || m[2] || m[3];
    const relPathNoExt = resolveSpecifierToRelPathNoExt(spec, fromDir);
    if (!relPathNoExt) continue;
    const resolved = tryResolveFile(relPathNoExt);
    if (!resolved) {
      console.error(`[vendor-copy] Could not resolve import "${spec}" from ${relPath} (tried ${relPathNoExt}.ts / .tsx / index.ts)`);
      hadError = true;
      continue;
    }
    if (!visited.has(resolved)) queue.push(resolved);
  }
}

if (hadError) {
  console.error(`[vendor-copy] FAILED — see errors above. Nothing left half-written was intentional; re-run after fixing the source repo.`);
  process.exit(1);
}

console.log(`[vendor-copy] mirrored ${visited.size} file(s) into functions/src/_vendor/:`);
for (const f of [...visited].sort()) console.log(`  ${f}${SHIMS[f] ? '  (SHIMMED — see SHIMS above)' : ''}`);
