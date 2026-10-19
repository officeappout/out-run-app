/**
 * scripts/trails/backfill-elevation-profile.ts — one-off backfill of
 * `elevationProfile: { stepM, elevationsM[64] }` onto EXISTING
 * official_routes docs (owner-approved 19.10.2026). New routes get it from
 * import-named-routes.ts (#464); this covers the ones created before.
 *
 * For every route WITHOUT a valid elevationProfile: sample the route's OWN
 * stored `path` through Copernicus GLO-30 (computeElevationProfileSamples —
 * same resample + median filter as the pipeline, 64 equally spaced samples).
 * Any sample outside DEM coverage → the route is skipped (never a guessed or
 * partial profile).
 *
 * Writes (only with --apply): a FIELD-LEVEL update of `elevationProfile`
 * alone, through scripts/trails/lib/trails-apply.node.ts
 * (updateElevationProfiles → buildValidatedDoc update mode, payload asserted
 * to be exactly {elevationProfile}, precondition = the doc's read-time
 * updateTime, so a doc edited meanwhile is skipped, not clobbered). Nothing
 * else on any doc changes; nothing is created or deleted.
 *
 * DEFAULT = DRY-RUN: reads only, prints the count + one line per route, and
 * writes the plan to .trails-out/elevation-backfill/<project>/plan.json.
 *
 * Bounded + resumable + rate-limited + idempotent:
 *   - pages of --page-size (default 100) in document-id order, at most
 *     --max-routes (default 5000) per run;
 *   - --apply records a checkpoint after every page
 *     (.trails-out/elevation-backfill/<project>/checkpoint.json) and resumes
 *     from it; --reset starts over;
 *   - batches of --batch-size (default 100) with --pause-ms (default 1000)
 *     between them;
 *   - routes that already have a valid profile are skipped, so a re-run
 *     writes 0.
 *
 * Usage:
 *   npx tsx scripts/trails/backfill-elevation-profile.ts --project appout-1                 # dry-run
 *   npx tsx scripts/trails/backfill-elevation-profile.ts --project appout-1 --apply         # write (typed YES)
 *   options: --authority <authorityId>  --max-routes N  --page-size N  --batch-size N  --pause-ms N  --reset
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeElevationProfileSamples, type StoredElevationProfile } from '../../src/lib/dem-tile-cache/elevation-profile';
import { createCopernicusTileLru } from '../../src/lib/dem-tile-cache/copernicus-glo30-cache.node';
import {
  addCounts, bboxOfPath, EMPTY_COUNTS, freshCheckpoint, hasValidElevationProfile, parseLimits, pathToLngLat, planRouteBackfill, resumeFrom,
  type BackfillCheckpoint, type BackfillCounts, type BackfillEntry, type BackfillLimits,
} from '../../src/lib/trail-graph/elevation-backfill';
import type { LngLat } from '../../src/lib/trail-graph/types';
import {
  confirmTypedYes, describeTarget, flagValue, listOfficialRoutesPage, openTarget, PRODUCTION_PROJECT, updateElevationProfiles,
  type ElevationUpdate, type Target,
} from './lib/trails-apply.node';

export type SamplerFor = (path: LngLat[]) => Promise<(p: LngLat[]) => StoredElevationProfile | null>;

export interface BackfillRunOptions {
  target: Target;
  apply: boolean;
  authorityId: string | null;
  limits: BackfillLimits;
  samplerFor: SamplerFor;
  /** Checkpoint storage (apply only). */
  readCheckpoint: () => unknown;
  writeCheckpoint: (cp: BackfillCheckpoint) => void;
  confirm: (question: string) => Promise<boolean>;
  log?: (s: string) => void;
}

export interface BackfillRunResult {
  entries: BackfillEntry[];
  counts: BackfillCounts;
  written: number;
  conflicts: string[];
  aborted: boolean;
  done: boolean;
  checkpoint: BackfillCheckpoint | null;
}

function fmt(e: BackfillEntry): string {
  const ele = e.status === 'write' ? `  ${e.minEleM}–${e.maxEleM} m` : '';
  return `  ${e.status.padEnd(11)} ${e.id}  ${e.name ?? '(no name)'}  · ${e.pathPoints} pts${ele}`;
}

export async function runElevationBackfill(o: BackfillRunOptions): Promise<BackfillRunResult> {
  const log = o.log ?? console.log;
  const { db, projectId } = o.target;
  log(`\nTARGET: ${describeTarget(o.target)} — ${o.apply ? 'APPLY (field-level elevationProfile only)' : 'DRY-RUN (read-only)'}`);
  log(`filter: ${o.authorityId ? `authorityId == ${o.authorityId}` : 'all official_routes'}; page ${o.limits.pageSize}, max ${o.limits.maxRoutes} routes this run`);

  let cp: BackfillCheckpoint = o.apply ? resumeFrom(o.readCheckpoint(), projectId, o.authorityId) : freshCheckpoint(projectId, o.authorityId);
  const empty = { entries: [], counts: { ...EMPTY_COUNTS }, written: 0, conflicts: [] };
  if (o.apply && cp.done) {
    log('Checkpoint says this target is already fully done — nothing to do (use --reset to rescan).');
    return { ...empty, aborted: false, done: true, checkpoint: cp };
  }
  if (o.apply) {
    if (cp.lastDocId) log(`resuming after doc ${cp.lastDocId} (${cp.counts.scanned} scanned, ${cp.written} written so far)`);
    const ok = await o.confirm(`\nType YES to write official_routes.elevationProfile (field-level, nothing else) to ${describeTarget(o.target)}: `);
    if (!ok) {
      log('Not confirmed — nothing was written.');
      return { ...empty, aborted: true, done: false, checkpoint: cp };
    }
  }

  const entries: BackfillEntry[] = [];
  let counts: BackfillCounts = { ...EMPTY_COUNTS };
  let written = 0;
  const conflicts: string[] = [];
  let after = cp.lastDocId;
  let done = false;
  while (counts.scanned < o.limits.maxRoutes) {
    const pageSize = Math.min(o.limits.pageSize, o.limits.maxRoutes - counts.scanned);
    const page = await listOfficialRoutesPage(db, { afterId: after, pageSize, authorityId: o.authorityId });
    if (page.length === 0) { done = true; break; }
    const pageEntries: BackfillEntry[] = [];
    const updates: ElevationUpdate[] = [];
    for (const d of page) {
      const p = pathToLngLat(d.data.path);
      const sample = p && !hasValidElevationProfile(d.data) ? await o.samplerFor(p) : () => null;
      const e = planRouteBackfill(d.id, d.data, sample);
      pageEntries.push(e);
      log(fmt(e));
      if (e.status === 'write' && e.profile) updates.push({ id: d.id, profile: e.profile, updateTime: d.updateTime });
    }
    let pageWritten = 0;
    if (o.apply && updates.length) {
      const res = await updateElevationProfiles(db, updates, { batchSize: o.limits.batchSize, pauseMs: o.limits.pauseMs, log });
      pageWritten = res.written;
      written += res.written;
      conflicts.push(...res.conflicts);
      for (const id of res.conflicts) log(`  ⚠ ${id} changed since it was read — skipped, not overwritten (a --reset re-scan picks it up)`);
    }
    entries.push(...pageEntries);
    counts = addCounts(counts, pageEntries);
    after = page[page.length - 1].id;
    if (o.apply) {
      // Only after the page's writes committed — a crash mid-page re-does that page (idempotent).
      cp = { ...cp, lastDocId: after, counts: addCounts(cp.counts, pageEntries), written: cp.written + pageWritten, updatedAt: new Date().toISOString() };
      o.writeCheckpoint(cp);
    }
    if (page.length < pageSize) { done = true; break; }
  }
  if (o.apply) {
    cp = { ...cp, done, updatedAt: new Date().toISOString() };
    o.writeCheckpoint(cp);
  }

  log(`\n── ${o.apply ? 'RESULT' : 'DRY-RUN SUMMARY (nothing written)'} ──`);
  log(`  scanned ${counts.scanned}: would write/wrote ${counts.write}, already have a profile ${counts.has_profile}, DEM gap (skipped) ${counts.dem_gap}, unusable path (skipped) ${counts.bad_path}`);
  if (o.apply) log(`  written ${written}, conflicts ${conflicts.length}${done ? ' — reached the end of the collection' : ` — stopped at --max-routes; re-run to continue after ${after}`}`);
  else if (!done) log(`  (stopped at --max-routes ${o.limits.maxRoutes}; the full collection may hold more)`);
  return { entries, counts, written, conflicts, aborted: false, done, checkpoint: o.apply ? cp : null };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function validateBackfillFlags(project: string | null, env: Record<string, string | undefined> = process.env): string[] {
  const errs: string[] = [];
  if (!project) errs.push(`missing --project <projectId> (production: --project ${PRODUCTION_PROJECT})`);
  else if (!env.FIRESTORE_EMULATOR_HOST && project !== PRODUCTION_PROJECT) errs.push(`--project ${project}: without FIRESTORE_EMULATOR_HOST the only allowed target is ${PRODUCTION_PROJECT}`);
  return errs;
}

/** Copernicus sampler with a bounded tile cache (≤ 6 decoded 1° tiles). */
export function copernicusSamplerFor(): SamplerFor {
  const lru = createCopernicusTileLru(6);
  return async (p) => {
    const provider = await lru.providerFor(bboxOfPath(p));
    return (q) => computeElevationProfileSamples(q, provider);
  };
}

async function cli() {
  const argv = process.argv.slice(2);
  const project = flagValue(argv, 'project');
  const apply = argv.includes('--apply');
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
  const errs = validateBackfillFlags(project);
  let limits: BackfillLimits | null = null;
  try { limits = parseLimits((n) => flagValue(argv, n)); } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
  if (errs.length || !limits) {
    console.error(`Refusing:\n  - ${errs.join('\n  - ')}\nNothing was read or written.`);
    process.exit(2);
  }
  const dir = path.resolve(process.cwd(), '.trails-out', 'elevation-backfill', project!);
  fs.mkdirSync(dir, { recursive: true });
  const cpFile = path.join(dir, 'checkpoint.json');
  if (argv.includes('--reset') && fs.existsSync(cpFile)) fs.renameSync(cpFile, `${cpFile}.${Date.now()}.bak`);
  const res = await runElevationBackfill({
    target: await openTarget(project!),
    apply,
    authorityId: flagValue(argv, 'authority'),
    limits,
    samplerFor: copernicusSamplerFor(),
    readCheckpoint: () => (fs.existsSync(cpFile) ? JSON.parse(fs.readFileSync(cpFile, 'utf8')) : null),
    writeCheckpoint: (cp) => fs.writeFileSync(cpFile, JSON.stringify(cp, null, 2)),
    confirm: confirmTypedYes,
  });
  const planFile = path.join(dir, apply ? `apply-${Date.now()}.json` : 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({
    generatedAt: new Date().toISOString(), project, apply, authorityId: flagValue(argv, 'authority'), limits,
    counts: res.counts, written: res.written, conflicts: res.conflicts, done: res.done,
    routes: res.entries.map(({ profile, ...e }) => ({ ...e, ...(profile ? { stepM: profile.stepM, samples: profile.elevationsM.length } : {}) })),
  }, null, 2));
  console.log(`plan/report: ${planFile}`);
  if (res.aborted) process.exit(3);
}

if (process.argv[1] && /backfill-elevation-profile\.ts$/.test(process.argv[1])) {
  cli().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
