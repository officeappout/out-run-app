/**
 * Planned run → the ONE overview drawer's legs (boards M-6a / 6d / 6e / 6f,
 * enable_home_v2). Pure.
 *
 *   warm-up   → one aerobic leg ("חימום" · km · min · pace)
 *   main set  → a GROUP leg per repeated section ("העיקר", "6 ×", the
 *               work / recovery rows with their paces — F-1b), or an aerobic
 *               leg for a continuous block (tempo 20′)
 *   cool-down → one aerobic leg ("שחרור")
 * Easy / long runs are ONE steady leg. With a chosen route the walk to the
 * route and back are transport legs around them.
 *
 * Built on buildRunStructure (the #462 briefing's grouping), so the axis
 * says exactly what the old "מבנה האימון" list said.
 */

import type { AerobicLeg, AerobicMetaItem, GroupLeg, OverviewLeg } from '@/features/parks/core/components/overview/overview-legs';
import type { RunBlock } from '../../types/run-block.type';
import { fmtBand, isRestBlock } from '../../lib/planned-rep-results';
import type { RunKind } from '../run-preview/run-kind';
import { blockTargetBand, estimateBlockMeters, estimateBlockSeconds, estimatePaceFor, type RunPaceContext } from '../run-preview/run-estimates';
import { blockPhase, type RunPhase } from '../run-preview/run-strip';
import { buildRunStructure, type StructureStep } from '../run-preview/run-structure';
import { blockSizeLabel, roundMinutes } from '../run-preview/run-title';

const RUN = 'running';

export interface RunOverviewLegsOptions {
  kind: RunKind;
  /** Beginners (profile 3) see no pace numbers — the briefing's rule. */
  showPaceNumbers?: boolean;
  /** Walk to the chosen route / back from it (minutes); null = free run from here. */
  walk?: { thereMin: number; backMin: number } | null;
}

interface Totals { seconds: number; meters: number }

function sumBlocks(blocks: readonly RunBlock[], ctx: RunPaceContext): Totals {
  let seconds = 0;
  let meters = 0;
  for (const b of blocks) {
    seconds += estimateBlockSeconds(b, ctx) ?? 0;
    meters += estimateBlockMeters(b, ctx) ?? 0;
  }
  return { seconds, meters };
}

function metas(t: Totals, approx: boolean): AerobicMetaItem[] {
  const out: AerobicMetaItem[] = [];
  const pre = approx ? '~' : '';
  if (t.meters > 0) out.push({ key: 'km', icon: 'distance', text: `${pre}${(t.meters / 1000).toFixed(1)} ק״מ` });
  if (t.seconds > 0) out.push({ key: 'min', icon: 'time', text: `${pre}${roundMinutes(t.seconds)} דק׳` });
  return out;
}

/** One pace for an easy leg (warm-up / cool-down): the block's target, else the easy zone. */
function easyPace(blocks: readonly RunBlock[], ctx: RunPaceContext, show: boolean): number | undefined {
  if (!show) return undefined;
  const b = blocks.find((x) => !isRestBlock(x));
  const p = b ? estimatePaceFor(b, ctx) : null;
  return p && ctx.basePace > 0 ? Math.round(p) : undefined;
}

function phaseLeg(key: RunPhase, title: string, blocks: readonly RunBlock[], ctx: RunPaceContext, show: boolean): AerobicLeg | null {
  const t = sumBlocks(blocks, ctx);
  if (t.seconds <= 0 && t.meters <= 0) return null;
  return {
    kind: 'aerobic', key, activity: RUN, durationSec: t.seconds, distanceKm: t.meters / 1000,
    layout: 'standard', title, badge: 'ריצה קלה', meta: metas(t, false), paceSecPerKm: easyPace(blocks, ctx, show),
  };
}

function groupLeg(step: StructureStep, blocks: readonly RunBlock[], ctx: RunPaceContext, sectionTotals: Totals): GroupLeg {
  const work = blocks[step.rows.find((r) => !r.isRest)?.blockIndex ?? step.rows[0]?.blockIndex ?? -1];
  return {
    kind: 'group',
    key: step.key,
    title: step.title,
    repeat: step.repeat,
    activity: RUN,
    durationSec: sectionTotals.seconds,
    stripLabel: work && step.repeat ? `${step.repeat} × ${blockSizeLabel(work)}` : undefined,
    rows: step.rows.map((r) => ({
      key: r.key, tone: r.isRest ? 'recovery' : 'work', label: r.text, paceText: r.side || undefined, color: r.color,
    })),
    meta: metas(sectionTotals, true),
    color: step.color,
  };
}

function steadyLeg(key: string, title: string, badge: string, blocks: readonly RunBlock[], ctx: RunPaceContext, show: boolean, approx: boolean): AerobicLeg {
  const t = sumBlocks(blocks, ctx);
  const main = blocks.find((b) => blockPhase(b) === 'main' && !isRestBlock(b)) ?? blocks[0];
  const band = show && main ? blockTargetBand(main, ctx) : null;
  return {
    kind: 'aerobic', key, activity: RUN, durationSec: t.seconds, distanceKm: t.meters / 1000,
    layout: 'standard', title, badge, meta: metas(t, approx),
    paceText: band ? fmtBand(band.min, band.max) : undefined,
  };
}

/** Seconds / metres of one main step: its rows × the repeat (no rest after the last rep). */
function stepTotals(step: StructureStep, blocks: readonly RunBlock[], ctx: RunPaceContext): Totals {
  const reps = step.repeat ?? 1;
  let seconds = 0;
  let meters = 0;
  for (const r of step.rows) {
    const b = blocks[r.blockIndex];
    if (!b) continue;
    const n = r.isRest ? Math.max(0, reps - 1) : reps;
    seconds += (estimateBlockSeconds(b, ctx) ?? 0) * n;
    meters += (estimateBlockMeters(b, ctx) ?? 0) * n;
  }
  return { seconds, meters };
}

export function buildRunOverviewLegs(
  blocks: readonly RunBlock[],
  ctx: RunPaceContext,
  opts: RunOverviewLegsOptions,
): OverviewLeg[] {
  const show = opts.showPaceNumbers ?? true;
  const legs: OverviewLeg[] = [];
  const walk = opts.walk ?? null;
  if (walk && walk.thereMin > 0) legs.push({ kind: 'transport', key: 'walk-there', phase: 'there', label: 'הליכה אל המסלול', minutes: walk.thereMin });

  if (opts.kind === 'easy' || opts.kind === 'long') {
    if (blocks.length) {
      const title = opts.kind === 'long' ? 'ריצה ארוכה' : 'ריצה קלה';
      legs.push(steadyLeg('run', title, 'קצב שיחה', blocks, ctx, show, false));
    }
  } else {
    const steps = buildRunStructure(blocks, ctx, { showPaceNumbers: show });
    const warm = blocks.filter((b) => blockPhase(b) === 'warmup');
    const cool = blocks.filter((b) => blockPhase(b) === 'cooldown');
    const mainBlocks = blocks.filter((b) => blockPhase(b) === 'main');
    const mainSteps = steps.filter((s) => s.phase === 'main');

    const w = phaseLeg('warmup', 'חימום', warm, ctx, show);
    if (w) legs.push(w);
    for (const st of mainSteps) {
      const totals = mainSteps.length === 1 ? sumBlocks(mainBlocks, ctx) : stepTotals(st, blocks, ctx);
      if (st.repeat && st.repeat > 1) {
        legs.push(groupLeg(st, blocks, ctx, totals));
      } else {
        const own = st.rows.map((r) => blocks[r.blockIndex]).filter((b): b is RunBlock => !!b);
        const badge = opts.kind === 'tempo' ? 'טמפו' : 'ריצה';
        legs.push(steadyLeg(st.key, st.title, badge, mainSteps.length === 1 ? mainBlocks : own, ctx, show, true));
      }
    }
    const c = phaseLeg('cooldown', 'שחרור', cool, ctx, show);
    if (c) legs.push(c);
  }

  if (walk && walk.backMin > 0) legs.push({ kind: 'transport', key: 'walk-back', phase: 'back', label: 'הליכה חזרה', minutes: walk.backMin });
  return legs;
}

/** Walk there / back for a chosen route: straight-line access at ~80 m/min; only a loop brings you back to the same point. */
export function routeWalkMinutes(accessKm: number | null | undefined, endsAtStart: boolean): { thereMin: number; backMin: number } | null {
  if (accessKm == null || !Number.isFinite(accessKm) || accessKm <= 0.15) return null;
  const m = Math.max(1, Math.round((accessKm * 1000) / 80));
  return { thereMin: m, backMin: endsAtStart ? m : 0 };
}
