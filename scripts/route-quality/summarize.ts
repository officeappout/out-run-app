/** Aggregation + markdown for scripts/route-quality/measure.ts (pure). */
import type { RouteQualityMetrics } from '@/lib/route-quality';

/**
 * off = current, on = route quality v1, ours = v1 + loops prefer our routes;
 * gh-turns.ts adds its own GraphHopper variant names (any string is summarised).
 */
export type MeasureVariant = 'off' | 'on' | 'ours' | (string & {});

export interface RouteRow {
  start: string; targetKm: number; variant: MeasureVariant; run: number; rank: number;
  reads: number; ms: number; empty?: boolean;
  distanceKm?: number; metrics?: RouteQualityMetrics; pass?: boolean; reasons?: string[];
  features?: unknown; rating?: number;
  /** Share (0..1) on our mapped routes near the start + distinct routes used; absent when none were loaded. */
  oursShare?: number; oursRoutesUsed?: number;
}

export interface VariantSummary {
  variant: string;
  generations: number;
  emptyGenerations: number;
  routes: number;
  topRoutes: number;
  /** All rates below are over the TOP route of each generation (what the user sees first). */
  uturnOrSpurPct: number;
  retraceOver10Pct: number;
  retraceOver8Pct: number;
  meanRetracedPct: number;
  selfIntersectingPct: number;
  meanCompactness: number;
  /** Turns > 45° per km (length-weighted) and mean zigzag index (route-quality turns.ts). */
  turnsPerKm: number;
  meanZigzag: number;
  withinWindowPct: number;
  meanAbsDistErrPct: number;
  majorRoadPct: number;
  crossingsPerKm: number;
  unmarkedShare: number;
  unmarkedPerKm: number;
  passV1Pct: number;
  meanReads: number;
  meanMs: number;
  /** Mean % of length on our mapped routes (null when none were loaded for these rows). */
  oursPct: number | null;
  /** % of top routes running >= 100 m along at least one of our routes. */
  usingOursPct: number | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a: boolean[]) => (a.length ? (100 * a.filter(Boolean).length) / a.length : 0);

/** Distance window used for the "within window" rate: ±15 % of target (independent of the generator's own windows). */
export const WINDOW_FRAC = 0.15;

export function summarizeVariant(rows: RouteRow[], variant: string): VariantSummary {
  const vr = rows.filter(r => r.variant === variant);
  const gens = new Map<string, RouteRow[]>();
  for (const r of vr) { const k = `${r.start}|${r.targetKm}|${r.run}`; gens.set(k, [...(gens.get(k) ?? []), r]); }
  const top = vr.filter(r => r.rank === 0 && r.metrics);
  const m = top.map(r => r.metrics!);
  const totalKm = mean(m.map(x => x.lengthM / 1000)) * m.length;
  const crossings = m.reduce((a, x) => a + (x.crossings?.total ?? 0), 0);
  const unmarked = m.reduce((a, x) => a + (x.crossings?.unmarked ?? 0), 0);
  const genList = Array.from(gens.values());
  const firstOfGen = genList.map(g => g[0]);
  return {
    variant,
    generations: gens.size,
    emptyGenerations: genList.filter(g => g.some((r: RouteRow) => r.empty)).length,
    routes: vr.filter(r => r.metrics).length,
    topRoutes: top.length,
    uturnOrSpurPct: pct(m.map(x => x.uTurnCount + x.spurCount > 0)),
    retraceOver10Pct: pct(m.map(x => x.retracedPct > 0.1)),
    retraceOver8Pct: pct(m.map(x => x.retracedPct > 0.08)),
    meanRetracedPct: 100 * mean(m.map(x => x.retracedPct)),
    selfIntersectingPct: pct(m.map(x => x.selfIntersections > 0)),
    meanCompactness: mean(m.map(x => x.compactness)),
    turnsPerKm: totalKm ? m.reduce((a, x) => a + (x.turns ?? 0), 0) / totalKm : 0,
    meanZigzag: mean(m.map(x => x.zigzagIndex ?? 1)),
    withinWindowPct: pct(m.map(x => Math.abs(x.distanceErrorPct ?? 1) <= WINDOW_FRAC)),
    meanAbsDistErrPct: 100 * mean(m.map(x => Math.abs(x.distanceErrorPct ?? 0))),
    majorRoadPct: 100 * mean(m.map(x => x.majorRoadPct ?? 0)),
    crossingsPerKm: totalKm ? crossings / totalKm : 0,
    unmarkedShare: crossings ? (100 * unmarked) / crossings : 0,
    unmarkedPerKm: totalKm ? unmarked / totalKm : 0,
    passV1Pct: pct(top.map(r => !!r.pass)),
    meanReads: mean(firstOfGen.map(r => r.reads)),
    meanMs: mean(firstOfGen.map(r => r.ms)),
    oursPct: top.some(r => r.oursShare != null) ? 100 * mean(top.map(r => r.oursShare ?? 0)) : null,
    usingOursPct: top.some(r => r.oursShare != null) ? pct(top.map(r => (r.oursRoutesUsed ?? 0) > 0)) : null,
  };
}

export function summarize(rows: RouteRow[]) {
  const variants = Array.from(new Set(rows.map(r => r.variant)));
  const starts = Array.from(new Set(rows.map(r => r.start)));
  return {
    overall: variants.map(v => summarizeVariant(rows, v)),
    perStart: starts.flatMap(s => variants.map(v => ({ start: s, ...summarizeVariant(rows.filter(r => r.start === s), v) }))),
  };
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

export function toMarkdown(s: ReturnType<typeof summarize>): string {
  const label = (v: string) => (v === 'off' ? 'current (flags off)' : v === 'on' ? 'v1' : v === 'ours' ? 'v1 + our routes' : v);
  const pctOrDash = (n: number | null) => (n == null ? '—' : `${f1(n)}%`);
  const lines = [
    '| metric (top route per generation) | ' + s.overall.map(o => label(o.variant)).join(' | ') + ' |',
    '|---|' + s.overall.map(() => '---').join('|') + '|',
  ];
  const row = (name: string, fn: (o: VariantSummary) => string) => lines.push(`| ${name} | ${s.overall.map(fn).join(' | ')} |`);
  row('generations / empty', o => `${o.generations} / ${o.emptyGenerations}`);
  row('routes with U-turn or spur', o => `${f1(o.uturnOrSpurPct)}%`);
  row('routes retracing >10% / >8%', o => `${f1(o.retraceOver10Pct)}% / ${f1(o.retraceOver8Pct)}%`);
  row('mean retraced length', o => `${f1(o.meanRetracedPct)}%`);
  row('routes with a self-crossing', o => `${f1(o.selfIntersectingPct)}%`);
  row('mean compactness (circle=1)', o => f2(o.meanCompactness));
  row('turns > 45° / km', o => f2(o.turnsPerKm));
  row('mean zigzag index (1.0 = smooth)', o => f2(o.meanZigzag));
  row('within ±15% of target', o => `${f1(o.withinWindowPct)}%`);
  row('mean |distance error|', o => `${f1(o.meanAbsDistErrPct)}%`);
  row('length on tertiary+ roads', o => `${f1(o.majorRoadPct)}%`);
  row('tertiary+ crossings / km', o => f2(o.crossingsPerKm));
  row('… of which unmarked', o => `${f1(o.unmarkedShare)}% (${f2(o.unmarkedPerKm)}/km)`);
  row('passes all v1 bars', o => `${f1(o.passV1Pct)}%`);
  row('length on our routes', o => pctOrDash(o.oursPct));
  row('uses >= 1 of our routes (>= 100 m)', o => pctOrDash(o.usingOursPct));
  row('Firestore docs read / generation', o => f1(o.meanReads));
  row('wall time / generation', o => `${(o.meanMs / 1000).toFixed(1)} s`);
  lines.push('', '| start | variant | gens/empty | U-turn/spur | retrace>8% | compact | turns/km | zigzag | in ±15% | unmarked/km | passes v1 | on our routes | reads |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of s.perStart) {
    lines.push(`| ${p.start} | ${p.variant} | ${p.generations}/${p.emptyGenerations} | ${f1(p.uturnOrSpurPct)}% | ${f1(p.retraceOver8Pct)}% | ${f2(p.meanCompactness)} | ${f2(p.turnsPerKm)} | ${f2(p.meanZigzag)} | ${f1(p.withinWindowPct)}% | ${f2(p.unmarkedPerKm)} | ${f1(p.passV1Pct)}% | ${pctOrDash(p.oursPct)} | ${f1(p.meanReads)} |`);
  }
  return lines.join('\n');
}
