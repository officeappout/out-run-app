/**
 * One view model for every v2 pre-run surface (the run overview drawer,
 * the weekly list card) — so they show the same title, numbers and
 * strip. Pure: callers pass the zones (computeZones) and the context.
 */

import type { RunBlock } from '../../types/run-block.type';
import type { WorkoutCategory } from '../../../../core/types/running.types';
import { fmtClock, fmtPace } from '../../lib/planned-rep-results';
import { inferRunKind, resolveRunCategory, runTypeLabel, RUN_KIND_STYLE, type RunKind } from './run-kind';
import { estimateRunTotals, findMainRep, repTarget, type RepTarget, type RunPaceContext } from './run-estimates';
import { buildRunDisplayTitle } from './run-title';
import { buildIntensityStrip, stripPhaseLabels, type StripSegment } from './run-strip';
import { buildZoneLadder, mainZone, type ZoneLadderItem } from './run-zone-ladder';
import { runWeekContextLabel, type RunWeekContext } from './run-week';
import { surfaceTilesFor, type SurfaceTile } from './run-surfaces';
import { buildRunJourney } from './run-journey';
import type { JourneyStripItem } from '@/components/ui/v2/journey-strip';

export interface RunPreviewInput {
  title: string;
  blocks: RunBlock[];
  category?: string | null;
  logicCue?: string;
  description?: string;
}

export interface RunPreviewOptions extends RunPaceContext {
  templateCategory?: string | null;
  week?: RunWeekContext | null;
  /** Beginners (profile 3) see no pace numbers — the legacy drawer's rule. */
  showPaceNumbers?: boolean;
}

export interface RunPreviewModel {
  kind: RunKind;
  category: WorkoutCategory | null;
  color: string;
  textColor: string;
  tint: string;
  typeLabel: string;
  /** Human title, falls back to the template name. */
  title: string;
  weekLabel: string;
  minutes: number | null;
  /** Estimated km, one decimal; null when unknown. */
  km: number | null;
  reps: number;
  rep: RepTarget | null;
  /** Header meta (WorkoutOverviewHeader): "41 דק׳" · "~6.4 ק״מ" · "6 חזרות @ 4:50". */
  meta: string[];
  /** The horizontal journey strip: warm-up › 6 × 400 מ׳ › cool-down. */
  journey: JourneyStripItem[];
  strip: StripSegment[];
  stripLabels: string[];
  ladder: ZoneLadderItem[];
  tip: string | null;
  surfaces: SurfaceTile[];
}

export function buildRunPreviewModel(w: RunPreviewInput, opts: RunPreviewOptions): RunPreviewModel {
  const ctx: RunPaceContext = { basePace: opts.basePace, zones: opts.zones };
  const showPaceNumbers = opts.showPaceNumbers ?? true;
  const category = resolveRunCategory(w.category, opts.templateCategory);
  const kind = inferRunKind(category, w.blocks);
  const style = RUN_KIND_STYLE[kind];
  const totals = estimateRunTotals(w.blocks, ctx);
  const main = findMainRep(w.blocks);
  const reps = main && main.count >= 2 ? main.count : 0;
  const rep = main ? repTarget(main.block, ctx) : null;

  const minutes = totals.seconds ? Math.max(1, Math.round(totals.seconds / 60)) : null;
  const km = totals.meters ? Math.round(totals.meters / 100) / 10 : null;

  const meta: string[] = [];
  if (minutes) meta.push(`${minutes} דק׳`);
  if (km) meta.push(`~${km} ק״מ`);
  if (showPaceNumbers && rep?.paceSec) meta.push(reps ? `${reps} חזרות @ ${fmtPace(rep.paceSec)}` : `${fmtPace(rep.band?.min)}–${fmtPace(rep.band?.max)}`);
  else if (showPaceNumbers && reps && rep?.repSeconds) meta.push(`${reps} חזרות · ~${fmtClock(rep.repSeconds)}`);
  else if (reps) meta.push(`${reps} חזרות`);

  return {
    kind,
    category,
    color: style.color,
    textColor: style.text,
    tint: style.tint,
    typeLabel: runTypeLabel(category, kind),
    title: buildRunDisplayTitle(w.blocks, kind, totals) ?? w.title,
    weekLabel: runWeekContextLabel(opts.week),
    minutes,
    km,
    reps,
    rep,
    meta,
    journey: buildRunJourney(w.blocks, ctx),
    strip: buildIntensityStrip(w.blocks, ctx),
    stripLabels: stripPhaseLabels(w.blocks, ctx, { reps, mainLabel: kind === 'tempo' ? 'טמפו' : undefined }),
    ladder: showPaceNumbers ? buildZoneLadder(opts.zones, mainZone(w.blocks)) : [],
    tip: (w.logicCue || w.description || '').trim() || null,
    surfaces: surfaceTilesFor(kind),
  };
}
