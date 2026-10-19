/**
 * Run blocks → JourneyStrip items (pure) — the same horizontal strip the
 * route+stops hybrid overview shows: warm-up › 6 × 400 מ׳ (repeat glyph) ›
 * cool-down; tempo: warm-up › 20 דק׳ › cool-down; easy/long: one leg.
 *
 * Warm-up (incl. strides) and cool-down are one leg each, with their total
 * minutes. The main set collapses into ONE repeat item when every work block
 * has the main rep's shape (6 × 400, beginners' 6 × 2 דק׳ run/walk); a mixed
 * main set (pyramids) gets one item per section instead.
 */

import type { JourneyStripItem } from '@/components/ui/v2/journey-strip';
import type { RunBlock } from '../../types/run-block.type';
import { isRestBlock } from '../../lib/planned-rep-results';
import { coreWorkBlocks, estimateBlockSeconds, findMainRep, type RunPaceContext } from './run-estimates';
import { blockPhase } from './run-strip';
import { groupBlocksIntoSections, isStrideBlock } from './run-sections';
import { blockSizeLabel } from './run-title';

const RUN = 'running';

function sumSeconds(blocks: readonly RunBlock[], ctx: RunPaceContext): number {
  return blocks.reduce((s, b) => s + (estimateBlockSeconds(b, ctx) ?? 0), 0);
}

function sameShape(a: RunBlock, b: RunBlock): boolean {
  return (
    a.type === b.type &&
    a.zoneType === b.zoneType &&
    (a.distanceMeters ?? 0) === (b.distanceMeters ?? 0) &&
    (a.durationSeconds ?? 0) === (b.durationSeconds ?? 0)
  );
}

export function buildRunJourney(blocks: readonly RunBlock[], ctx: RunPaceContext): JourneyStripItem[] {
  const warm = blocks.filter((b) => blockPhase(b) === 'warmup');
  const main = blocks.filter((b) => blockPhase(b) === 'main');
  const cool = blocks.filter((b) => blockPhase(b) === 'cooldown');
  const items: JourneyStripItem[] = [];

  const warmSec = sumSeconds(warm, ctx);
  if (warmSec > 0) items.push({ key: 'warmup', kind: 'aerobic', subtype: RUN, seconds: warmSec });

  const rep = findMainRep(main);
  const work = coreWorkBlocks(main);
  if (rep && rep.count >= 2 && work.every((b) => sameShape(b, rep.block))) {
    items.push({ key: 'main', kind: 'repeat', subtype: RUN, label: `${rep.count} × ${blockSizeLabel(rep.block)}` });
  } else if (main.length > 0) {
    const sections = groupBlocksIntoSections({ blocks: [...main] }).filter((s) => !isStrideBlock(s.blocks[0]?.block));
    sections.forEach((s, i) => {
      const first = s.blocks[0]?.block;
      if (!first || isRestBlock(first)) return;
      if (s.laps && s.laps > 1) {
        items.push({ key: `main${i}`, kind: 'repeat', subtype: RUN, label: `${s.laps} × ${blockSizeLabel(first)}` });
      } else {
        items.push({ key: `main${i}`, kind: 'aerobic', subtype: first.type === 'walk' ? 'walking' : RUN, seconds: estimateBlockSeconds(first, ctx) ?? 0 });
      }
    });
  }

  const coolSec = sumSeconds(cool, ctx);
  if (coolSec > 0) items.push({ key: 'cooldown', kind: 'aerobic', subtype: RUN, seconds: coolSec });
  return items;
}
