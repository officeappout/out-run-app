/**
 * Briefing section grouping — moved verbatim out of RunBriefingDrawer.tsx
 * (19.10.2026) so the v2 preview can reuse it. Behaviour unchanged: the
 * legacy drawer imports it from here.
 *
 * Groups a materialized workout into:
 *   - one "חימום" section (warm-up + non-run dynamic wrappers),
 *   - middle sections (strides "מתגברות", interval/rep groups with a lap
 *     count, standalone blocks),
 *   - one "מתיחות" section (cool-down).
 * Each section lists its UNIQUE blocks only (one work block + its first
 * rest), with `laps` holding the repeat count.
 */

import type { RunBlock } from '../../types/run-block.type';

export interface BriefingSection {
  title: string;
  laps?: number;
  blocks: { block: RunBlock; originalIndex: number }[];
}

export function isStrideBlock(block: RunBlock): boolean {
  return !!block._isDynamicWrapper && block.type === 'run' && block.blockMode === 'effort' && block.label.includes('סטריידס');
}

export function groupBlocksIntoSections(workout: { blocks: RunBlock[] }): BriefingSection[] {
  const warmupSection: BriefingSection = { title: 'חימום', blocks: [] };
  const cooldownSection: BriefingSection = { title: 'מתיחות', blocks: [] };
  const middleSections: BriefingSection[] = [];
  const { blocks } = workout;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    // 1. Cooldown — always last, check BEFORE _isDynamicWrapper
    if (block.type === 'cooldown') {
      cooldownSection.blocks.push({ block, originalIndex: i });
      i++;
      continue;
    }

    // 2. Strides — group like intervals (work+rest with lap count)
    if (isStrideBlock(block)) {
      const workBlock = block;
      let lapCount = 1;
      let j = i + 1;

      while (j < blocks.length) {
        const next = blocks[j];
        if (next._isSynthesizedRest || next.type === 'walk' || next.type === 'recovery') {
          j++;
          if (j < blocks.length && isStrideBlock(blocks[j])) {
            lapCount++;
            j++;
            continue;
          }
          break;
        }
        if (isStrideBlock(next)) {
          lapCount++;
          j++;
          continue;
        }
        break;
      }

      const uniqueBlocks: { block: RunBlock; originalIndex: number }[] = [{ block: workBlock, originalIndex: i }];
      const firstRest = blocks.slice(i + 1, j).find(b => b._isSynthesizedRest || b.type === 'walk' || b.type === 'recovery');
      if (firstRest) {
        const restIdx = blocks.indexOf(firstRest);
        uniqueBlocks.push({ block: firstRest, originalIndex: restIdx });
      }

      middleSections.push({ title: 'מתגברות', laps: lapCount, blocks: uniqueBlocks });
      i = j;
      continue;
    }

    // 3. Warmup (pure warmup or dynamic wrapper that ISN'T strides/cooldown)
    if (block.type === 'warmup' || (block._isDynamicWrapper && block.type !== 'run')) {
      warmupSection.blocks.push({ block, originalIndex: i });
      i++;
      continue;
    }

    // 4. Interval / run pattern grouping
    if (block.type === 'interval' || block.type === 'run') {
      const isIntervalZone = block.zoneType && ['interval_short', 'interval_long', 'sprint', 'fartlek_fast', 'fartlek_medium', 'tempo'].includes(block.zoneType);

      if (isIntervalZone || block.type === 'interval') {
        const workBlock = block;
        let lapCount = 1;
        let j = i + 1;

        while (j < blocks.length) {
          const nextBlock = blocks[j];
          if (nextBlock._isSynthesizedRest || nextBlock.type === 'recovery' || nextBlock.type === 'walk') {
            j++;
            if (j < blocks.length) {
              const afterRest = blocks[j];
              const sameWork =
                afterRest.type === workBlock.type &&
                afterRest.zoneType === workBlock.zoneType &&
                afterRest.durationSeconds === workBlock.durationSeconds &&
                afterRest.distanceMeters === workBlock.distanceMeters;
              if (sameWork) { lapCount++; j++; continue; }
            }
            break;
          }
          const sameWork =
            nextBlock.type === workBlock.type &&
            nextBlock.zoneType === workBlock.zoneType &&
            nextBlock.durationSeconds === workBlock.durationSeconds &&
            nextBlock.distanceMeters === workBlock.distanceMeters;
          if (sameWork) { lapCount++; j++; continue; }
          break;
        }

        const uniqueBlocks: { block: RunBlock; originalIndex: number }[] = [{ block: workBlock, originalIndex: i }];
        const restBlock = blocks.slice(i + 1, j).find(b => b._isSynthesizedRest || b.type === 'recovery' || b.type === 'walk');
        if (restBlock) {
          const restIdx = blocks.indexOf(restBlock);
          uniqueBlocks.push({ block: restBlock, originalIndex: restIdx });
        }

        middleSections.push({
          title: workBlock.label || 'אינטרוולים',
          laps: lapCount > 1 ? lapCount : undefined,
          blocks: uniqueBlocks,
        });
        i = j;
        continue;
      }
    }

    // 5. Default standalone
    middleSections.push({
      title: block.label,
      blocks: [{ block, originalIndex: i }],
    });
    i++;
  }

  const result: BriefingSection[] = [];
  if (warmupSection.blocks.length > 0) result.push(warmupSection);
  result.push(...middleSections);
  if (cooldownSection.blocks.length > 0) result.push(cooldownSection);
  return result;
}
