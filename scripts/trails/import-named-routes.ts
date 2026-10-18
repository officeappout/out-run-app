/**
 * scripts/trails/import-named-routes.ts — national trails pipeline, step 2:
 * stitch OSM route relations (hiking/foot/walking/mtb/bicycle — incl.
 * operator=itc/kkl/rtg) over the segment graph into NAMED routes, then
 * generate candidate loops / out-and-backs from each יישוב.
 *
 * Default = DRY-RUN. Reads `.trails-out/<area>/segments.json` (run
 * build-segment-graph.ts first) and writes local JSON next to it:
 *   named-routes.json · generated-routes.json · summary.json · apply-plan.json
 * `--apply` (owner-approved 18.10.2026) additionally CREATES the routes in
 * `official_routes` (create-only, status:'pending', published:false) via
 * scripts/trails/lib/trails-apply.node.ts — see its header for the guard rails.
 *
 * Usage:
 *   npx tsx scripts/trails/import-named-routes.ts [--relation=1473954 --area=shaar-hanegev]
 *   npx tsx scripts/trails/import-named-routes.ts --apply --project appout-1 --authority <authorityId>
 */
import * as fs from 'fs';
import * as path from 'path';
import { COPERNICUS_DEM_ATTRIBUTION } from '../../src/lib/dem-tile-cache/copernicus-glo30';
import { isOfficialOperator, rateDifficulty, starPrior, type StarInput } from '../../src/lib/trail-graph/difficulty';
import { distM, midpointAlong } from '../../src/lib/trail-graph/geo';
import { disambiguateDuplicateNames, endpointNames, generatedRouteName, nameRoute, nearestFeature, officialName } from '../../src/lib/trail-graph/naming';
import { classifyShape, dedupBySegments, generateFromStart, orderSegments, SegmentGraph, stepsGeometry } from '../../src/lib/trail-graph/route-assembly';
import { routeStats } from '../../src/lib/trail-graph/route-stats';
import { isTrailRouteRelation } from '../../src/lib/trail-graph/segment-graph';
import { trailColour } from '../../src/lib/trail-graph/tags';
import { OSM_ATTRIBUTION, OSM_LICENSE, type LngLat, type NameSource, type TrailRoute, type TrailSegment } from '../../src/lib/trail-graph/types';
import { loadPilot, readSegmentsFile } from './build-segment-graph';
import { applyTrailRoutes, confirmTypedYes, openTarget, parseApplyFlags, validateApplyFlags } from './lib/trails-apply.node';
import { SHAAR_HANEGEV_RELATION_ID } from './lib/pilot-osm.node';
import type { PilotContext } from './lib/pilot-context';

const ATTRIBUTION = `${OSM_ATTRIBUTION}; elevation ${COPERNICUS_DEM_ATTRIBUTION}`;

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a?.split('=').slice(1).join('=');
}

const NAME_RANK: Record<NameSource, number> = {
  osm_name: 0, itc_colour_ref_toponym: 1, urban_park_or_promenade: 2, endpoints: 3, generated_descriptive: 4, placeholder: 5,
};

function scoreInputs(ctx: PilotContext, segs: TrailSegment[], geometry: LngLat[], provenance: StarInput['provenance']): StarInput {
  const total = segs.reduce((a, s) => a + s.lengthM, 0) || 1;
  const len = (p: (s: TrailSegment) => boolean) => segs.filter(p).reduce((a, s) => a + s.lengthM, 0) / total;
  return {
    provenance,
    offBuiltUpShare: len((s) => !s.inBuiltUp),
    nearNamedNature: ctx.nearNamedNature(geometry),
    greenShare: ctx.greenShare(geometry),
    amenityTypes: ctx.amenityTypesNear(geometry).length,
    offroadShare: len((s) => ['path', 'track', 'bridleway'].includes(s.highwayClass)),
    residentialShare: len((s) => s.highwayClass === 'residential' || s.highwayClass === 'service'),
  };
}

export async function runImportNamedRoutes(opts: { relationId: number; area: string; outRoot: string }) {
  const outDir = path.join(opts.outRoot, opts.area);
  const segFile = path.join(outDir, 'segments.json');
  if (!fs.existsSync(segFile)) throw new Error(`Missing ${segFile} — run scripts/trails/build-segment-graph.ts first.`);
  const { segments } = JSON.parse(fs.readFileSync(segFile, 'utf8')) as { segments: TrailSegment[] };
  const segById = new Map(segments.map((s) => [s.id, s]));
  const { ex, ctx, osmTimestamp } = await loadPilot(opts);

  const placeholderN = new Map<string, number>();
  const nextPlaceholderIndex = (s: string) => {
    const n = (placeholderN.get(s) ?? 0) + 1;
    placeholderN.set(s, n);
    return n;
  };

  // ── 1. OSM route relations → named routes ────────────────────────────
  const relSegs = new Map<number, TrailSegment[]>();
  for (const s of segments) for (const r of s.routeRelationIds) {
    const a = relSegs.get(r) ?? [];
    a.push(s);
    relSegs.set(r, a);
  }
  const named: TrailRoute[] = [];
  const skipped: Array<{ relationId: number; reason: string }> = [];
  for (const [rid, segs] of Array.from(relSegs.entries()).sort((a, b) => a[0] - b[0])) {
    const rel = ex.data.relations.get(rid);
    if (!rel || !isTrailRouteRelation(rel)) continue;
    const ord = orderSegments(segs);
    if (ord.lengthM < 300) { skipped.push({ relationId: rid, reason: `only ${Math.round(ord.lengthM)} m inside the pilot area` }); continue; }
    const ordered = ord.segmentIds.map((id) => segById.get(id)!);
    const stats = routeStats(ordered, ord.forward);
    const shape = classifyShape(ord.geometry, ord.lengthM);
    const memberWays = rel.members.filter((m) => m.type === 'w').map((m) => m.ref);
    const covered = new Set(segs.flatMap((s) => s.osmWayIds));
    const clipped = memberWays.some((w) => !covered.has(w));
    const colour = trailColour(rel.tags) ?? ordered.find((s) => s.colour)?.colour ?? null;
    const ref = rel.tags.ref ?? null;
    const mid = midpointAlong(ord.geometry);
    const settlement = ctx.nearestSettlement(mid)?.name ?? null;
    const nm = nameRoute({
      relationTags: rel.tags,
      colour,
      ref,
      shape,
      geometry: ord.geometry,
      namedWayLengths: ordered.filter((s) => s.name).map((s) => ({ name: s.name!, lengthM: s.lengthM })),
      builtUpShare: stats.builtUpPct / 100,
      parkName: ctx.parkFor(ord.geometry),
      toponyms: ctx.toponyms,
      places: ctx.places,
      settlement,
      nextPlaceholderIndex,
    });
    const official = isOfficialOperator(rel.tags.operator);
    const off = officialName(rel.tags);
    const difficulty = rateDifficulty({ gainM: stats.gainM, distM: stats.lengthM, builtUpShare: stats.builtUpPct / 100, maxGrade50mPct: stats.maxGrade50mOpenPct, segments: ordered });
    const stars = starPrior(scoreInputs(ctx, ordered, ord.geometry, official ? (off ? 'official_named' : 'official_unnamed') : 'osm_relation'));
    named.push({
      id: `osm_rel_${rid}`,
      kind: 'osm_relation',
      name: nm.name,
      nameSource: nm.nameSource,
      needsName: nm.needsName,
      activity: ['mtb', 'bicycle'].includes(rel.tags.route) ? 'cycling' : 'walking',
      shape,
      segmentIds: ord.segmentIds,
      segmentForward: ord.forward,
      geometry: ord.geometry,
      stats,
      difficulty,
      stars,
      settlement,
      osm: {
        relationId: rid,
        route: rel.tags.route,
        operator: rel.tags.operator ?? null,
        network: rel.tags.network ?? null,
        ref,
        colour,
        officialName: off,
        clippedToPilotArea: clipped,
        continuity: ord.continuity,
      },
      ...(shape === 'linear' ? { endpoints: endpointNames(ord.geometry, ctx.places) } : {}),
      license: OSM_LICENSE,
      attribution: ATTRIBUTION,
    });
  }
  const namedDedup = dedupBySegments(named, (r) => NAME_RANK[r.nameSource] * 10 - r.stars.total - r.stats.lengthM / 1e6);
  for (const m of namedDedup.merged) {
    const k = namedDedup.kept.find((r) => r.id === m.into)!;
    (k.dedupedRelationIds ??= []).push(Number(m.id.replace('osm_rel_', '')));
  }

  // ── 2. Generated loops / out-and-backs from each יישוב ────────────────
  const footSegs = segments.filter((s) => s.foot);
  const graph = new SegmentGraph(footSegs, (s) => {
    const seg = s as TrailSegment;
    return seg.lengthM * (seg.highwayClass === 'steps' ? 3 : seg.highwayClass === 'residential' || seg.highwayClass === 'service' ? 1.15 : 1);
  });
  const nodeCoord = new Map<number, LngLat>();
  for (const s of footSegs) {
    nodeCoord.set(s.startNode, s.geometry[0]);
    nodeCoord.set(s.endNode, s.geometry[s.geometry.length - 1]);
  }
  const generated: TrailRoute[] = [];
  const noStart: string[] = [];
  for (const st of ctx.settlements) {
    // start = nearest graph node to the settlement's place node, ≤ 500 m, preferring built-up segments
    let start: number | null = null;
    let bd = 500;
    for (const s of footSegs) {
      for (const [n, p] of [[s.startNode, s.geometry[0]], [s.endNode, s.geometry[s.geometry.length - 1]]] as const) {
        const d = distM(p, st.point) * (s.inBuiltUp ? 1 : 1.5);
        if (d < bd) { bd = d; start = n; }
      }
    }
    if (start == null) { noStart.push(st.name); continue; }
    const cands = generateFromStart(graph, segById, start, (n) => nodeCoord.get(n)!);
    cands.forEach((c, i) => {
      const ids = c.steps.map((s) => s.segId);
      const segs = c.steps.map((s) => segById.get(s.segId)!);
      const geometry = stepsGeometry(c.steps, segById);
      const stats = routeStats(segs, c.steps.map((s) => s.forward));
      const via = nearestFeature(geometry, ctx.toponyms.filter((t) => t.name !== st.name), 300)?.name ?? null;
      const difficulty = rateDifficulty({ gainM: stats.gainM, distM: stats.lengthM, builtUpShare: stats.builtUpPct / 100, maxGrade50mPct: stats.maxGrade50mOpenPct, segments: segs });
      generated.push({
        id: `gen_${st.osmNodeId}_${i + 1}`,
        kind: 'generated',
        name: generatedRouteName({ settlement: st.name, shape: c.shape, lengthM: stats.lengthM, via }),
        nameSource: 'generated_descriptive',
        needsName: false,
        activity: 'walking',
        shape: c.shape,
        segmentIds: ids,
        segmentForward: c.steps.map((s) => s.forward),
        geometry,
        stats,
        difficulty,
        stars: starPrior(scoreInputs(ctx, segs, geometry, 'generated')),
        settlement: st.name,
        license: OSM_LICENSE,
        attribution: ATTRIBUTION,
      });
    });
  }
  // drop generated routes that duplicate a named one or each other
  const all = dedupBySegments([...namedDedup.kept, ...generated], (r) => (r.kind === 'osm_relation' ? 0 : 1) * 100 + NAME_RANK[r.nameSource] - r.stars.total / 10);
  const keptIds = new Set(all.kept.map((r) => r.id));
  const genKept = generated.filter((r) => keptIds.has(r.id));

  // ── 3. Duplicate names → disambiguate (naming.ts rule: ref, else next distinct toponym) ──
  const finalRoutes = [...namedDedup.kept, ...genKept];
  const renamed = disambiguateDuplicateNames(
    finalRoutes.map((r) => ({ id: r.id, name: r.name, ref: r.osm?.ref ?? null, geometry: r.geometry })),
    [...ctx.toponyms, ...ctx.places],
  );
  for (const r of finalRoutes) {
    const n = renamed.get(r.id);
    if (n) { r.nameDisambiguatedFrom = r.name; r.name = n; }
  }

  fs.writeFileSync(path.join(outDir, 'named-routes.json'), JSON.stringify({ meta: meta(), routes: namedDedup.kept, merged: namedDedup.merged, skipped }));
  fs.writeFileSync(path.join(outDir, 'generated-routes.json'), JSON.stringify({ meta: meta(), routes: genKept, droppedAsDuplicates: all.merged.filter((m) => m.id.startsWith('gen_')), settlementsWithoutStart: noStart }));

  const summary = summarize(segments, namedDedup.kept, genKept, namedDedup.merged.length, skipped.length, ctx);
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'apply-plan.json'), JSON.stringify(applyPlan(segments.length, namedDedup.kept.length, genKept.length), null, 2));
  return summary;

  function meta() {
    return { generatedAt: new Date().toISOString(), dryRun: true, osmTimestamp, license: OSM_LICENSE, attribution: ATTRIBUTION, relationId: opts.relationId };
  }
}

function summarize(segments: TrailSegment[], named: TrailRoute[], gen: TrailRoute[], dedupMerged: number, skipped: number, ctx: PilotContext) {
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const by = <T extends string>(rs: TrailRoute[], k: (r: TrailRoute) => T) => rs.reduce<Record<string, number>>((a, r) => ((a[k(r)] = (a[k(r)] ?? 0) + 1), a), {});
  const sample = (r: TrailRoute) => ({
    id: r.id, name: r.name, nameSource: r.nameSource, needsName: r.needsName, activity: r.activity, shape: r.shape,
    km: Math.round(r.stats.lengthM / 100) / 10, gainM: r.stats.gainM, maxGrade50mPct: r.stats.maxGrade50mPct, maxGrade50mOpenPct: r.stats.maxGrade50mOpenPct,
    difficulty: r.difficulty.final, nps: r.difficulty.npsScore, technical: r.difficulty.technicalReasons, stars: r.stars.total,
    trailPct: r.stats.trailPct, builtUpPct: r.stats.builtUpPct, operator: r.osm?.operator ?? null, clipped: r.osm?.clippedToPilotArea ?? false,
  });
  return {
    segments: segments.length,
    segmentKm: Math.round(segments.reduce((a, s) => a + s.lengthM, 0) / 100) / 10,
    namedRoutes: named.length,
    namedRoutesDedupMerged: dedupMerged,
    relationsSkippedTooLittleInArea: skipped,
    namedByActivity: by(named, (r) => r.activity),
    namedByOperator: by(named, (r) => r.osm?.operator ?? '(none)'),
    namedByNameSource: by(named, (r) => r.nameSource),
    pctNamedOfficially: pct(named.filter((r) => r.nameSource === 'osm_name').length, named.length),
    pctNeedsName: pct(named.filter((r) => r.needsName).length, named.length),
    generatedRoutes: gen.length,
    generatedByShape: by(gen, (r) => r.shape),
    settlements: ctx.settlements.length,
    difficultyNamed: by(named, (r) => r.difficulty.final),
    difficultyGenerated: by(gen, (r) => r.difficulty.final),
    sampleNamed: named.slice().sort((a, b) => b.stars.total - a.stars.total || b.stats.lengthM - a.stats.lengthM).slice(0, 10).map(sample),
    sampleGenerated: gen.slice(0, 5).map(sample),
  };
}

/** Exactly what an approved `--apply` would write. Nothing here is executed. */
export function applyPlan(segments: number, named: number, generated: number) {
  return {
    status: 'dry-run plan — the owner runs --apply (see docs/TRAILS-PILOT-SHAAR-HANEGEV.md §6)',
    writes: [
      {
        collection: 'trail_segments',
        docId: 'segment.id (deterministic: seg_<firstWayId>_<startNode>_<endNode>)',
        mode: 'upsert — skipped when contentHash unchanged; never deleted',
        count: segments,
        fields: ['geometry ({lng,lat}[])', 'startNode', 'endNode', 'lengthM', 'elevation{provider,gainFwdM,gainRevM,maxGrade50mFwdPct,maxGrade50mRevPct,minEleM,maxEleM}', 'highwayClass', 'surface', 'surfaceRaw', 'surfaceConfidence', 'lit', 'litSource', 'sacScale', 'mtbScale', 'tracktype', 'colour', 'itcRef', 'name', 'inBuiltUp', 'osmWayIds', 'routeRelationIds', 'foot', 'bicycle', 'license', 'authorityId', 'source:"osm_geofabrik_v1"', 'osmTimestamp', 'contentHash', 'createdAt', 'updatedAt'],
      },
      {
        collection: 'official_routes',
        docId: 'osm_rel_<relationId> | gen_<placeNodeId>_<n>',
        mode: 'create-only — an existing id is skipped, never overwritten',
        count: named + generated,
        fields: ['name', 'distance (km)', 'duration (min, from activity pace)', "difficulty ('easy'|'medium'|'hard')", "type ('walking'|'cycling')", 'path ({lng,lat}[])', "routeShape ('loop'|'out_and_back'|'point_to_point' — linear OSM trails are point_to_point, one-way distance)", 'surfaceType (dominant)', 'elevationGain', 'maxGrade', 'authorityId', 'city', "status:'pending'", 'published:false', "origin:'osm_import'", 'source{type,name,externalId,externalLink}', 'provenance{pipeline,osm{license,snapshot,extract},elevation{provider}}', 'attribution{osm,elevation}', 'trail{kind,nameSource,needsName,nameDisambiguatedFrom?,endpoints?,settlement,segmentIds,segmentForward,stars,starBreakdown,difficultyBreakdown,stats,osm,license,attribution}', 'importBatchId', 'createdAt', 'updatedAt'],
      },
    ],
    neverWritten: ['any existing official_routes doc (create-only, skip if id exists)', 'published:true', 'any delete'],
  };
}

async function cli() {
  const argv = process.argv.slice(2);
  const relationId = Number(arg('relation') ?? SHAAR_HANEGEV_RELATION_ID);
  const area = arg('area') ?? 'shaar-hanegev';
  const outRoot = path.resolve(process.cwd(), '.trails-out');
  const flags = parseApplyFlags(argv);
  if (flags.apply) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
    const errs = validateApplyFlags(flags);
    if (errs.length) {
      console.error(`Refusing:\n  - ${errs.join('\n  - ')}\nNothing was written.`);
      process.exit(2);
    }
  }
  const summary = await runImportNamedRoutes({ relationId, area, outRoot });
  console.log(JSON.stringify(summary, null, 2));
  if (!flags.apply) return;
  const { meta } = readSegmentsFile(outRoot, area);
  const named = JSON.parse(fs.readFileSync(path.join(outRoot, area, 'named-routes.json'), 'utf8')).routes as TrailRoute[];
  const gen = JSON.parse(fs.readFileSync(path.join(outRoot, area, 'generated-routes.json'), 'utf8')).routes as TrailRoute[];
  const res = await applyTrailRoutes([...named, ...gen], {
    target: await openTarget(flags.project!),
    authorityId: flags.authority!,
    areaName: meta.areaName ?? area,
    osmTimestamp: meta.osmTimestamp,
    importBatchId: `trails_${area}_${(meta.osmTimestamp ?? 'unknown').slice(0, 10)}`,
    confirm: confirmTypedYes,
  });
  if (res.aborted) process.exit(3);
}

if (process.argv[1] && /import-named-routes\.ts$/.test(process.argv[1])) {
  cli().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
