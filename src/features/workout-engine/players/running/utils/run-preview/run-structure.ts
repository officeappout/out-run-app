/**
 * "מבנה האימון" — the structure steps behind the run overview's axis legs
 * (run-overview-legs.ts). Pure.
 *
 * Built on groupBlocksIntoSections (the legacy drawer's grouping):
 *   1 חימום   — the warm-up section + strides ("4 × 20 שנ׳ סטריידס")
 *   2 העיקר   — each middle section, with its repeat count ("6 ×") and
 *               the work row + recovery row
 *   3 שחרור   — the cool-down section
 */

import type { RunBlock } from '../../types/run-block.type';
import type { RunZoneType } from '../../../../core/types/running.types';
import { fmtBand, fmtClock, isRestBlock, isShortLeg } from '../../lib/planned-rep-results';
import { groupBlocksIntoSections, isStrideBlock, type BriefingSection } from './run-sections';
import { blockTargetBand, repTarget, type RunPaceContext } from './run-estimates';
import { blockSizeLabel, cleanBlockLabel, isGenericLabel } from './run-title';
import { stripColor } from './run-strip';

export interface StructureRow {
  key: string;
  /** "400 מ׳ מהיר · ~1:56" / "90 שנ׳ התאוששות". */
  text: string;
  /** Right side: "4:45–4:55" (pace), "מאמץ גבוה" (effort), "מנוחה" (rest) or ''. */
  side: string;
  sideIsPace: boolean;
  color: string;
  isRest: boolean;
  /** Index into the workout's blocks (for a drill tap). */
  blockIndex: number;
  hasDrill: boolean;
}

export interface StructureStep {
  key: string;
  phase: 'warmup' | 'main' | 'cooldown';
  title: string;
  /** Numbered circle / rail colour. */
  color: string;
  /** "6 ×" badge. */
  repeat?: number;
  rows: StructureRow[];
}

const ZONE_WORDS: Partial<Record<RunZoneType, string>> = {
  walk: 'הליכה',
  jogging: 'ריצה קלה',
  recovery: 'ריצת התאוששות',
  easy: 'ריצה קלה',
  long_run: 'ריצה ארוכה',
  tempo: 'טמפו רצוף',
  fartlek_medium: 'פארטלק',
  fartlek_fast: 'מהיר',
  interval_long: 'מהיר',
  interval_short: 'מהיר',
  sprint: 'ספרינט',
};

const EFFORT_LABELS: Record<string, string> = { moderate: 'מאמץ בינוני', hard: 'מאמץ גבוה', max: 'מאמץ מקסימלי' };

/** Words for a row: the zone's plain words for generic labels ("חימום", "ריצה"), else the template label. */
function rowWords(b: RunBlock): string {
  const label = cleanBlockLabel(b.label);
  // Generic or size-only labels ("ריצה", "400 מ׳", "3 דק׳") read better as the zone's words.
  const generic = !label || isGenericLabel(label) || /^\d/.test(label);
  if (isStrideBlock(b)) return 'סטריידס';
  if (isRestBlock(b)) return label || 'התאוששות';
  if (generic && b.zoneType && ZONE_WORDS[b.zoneType]) return ZONE_WORDS[b.zoneType]!;
  return label || 'ריצה';
}

function buildRow(
  b: RunBlock,
  blockIndex: number,
  ctx: RunPaceContext,
  showPaceNumbers: boolean,
  laps?: number,
): StructureRow {
  const rest = isRestBlock(b);
  const size = blockSizeLabel(b);
  const sizeText = laps && laps > 1 && isStrideBlock(b) ? `${laps} × ${size}` : size;
  let text = [sizeText, rowWords(b)].filter(Boolean).join(' ');

  let side = '';
  let sideIsPace = false;
  if (rest) {
    side = 'מנוחה';
  } else if ((b.blockMode ?? 'pace') === 'effort') {
    side = b.effortConfig ? EFFORT_LABELS[b.effortConfig.effortLevel] ?? '' : '';
  } else if (showPaceNumbers && !isShortLeg(b)) {
    const band = blockTargetBand(b, ctx);
    if (band) {
      side = fmtBand(band.min, band.max);
      sideIsPace = true;
    }
  }

  // A distance rep also says how long one rep should take: "400 מ׳ מהיר · ~1:56".
  if (!rest && showPaceNumbers && b.type !== 'warmup' && b.type !== 'cooldown' && b.distanceMeters && !b.durationSeconds) {
    const t = repTarget(b, ctx);
    if (t.repSeconds) text += ` · ~${fmtClock(t.repSeconds)}`;
  }

  return { key: b.id || String(blockIndex), text, side, sideIsPace, color: stripColor(b), isRest: rest, blockIndex, hasDrill: !!b.drillRef };
}

function rowsOf(section: BriefingSection, ctx: RunPaceContext, showPaceNumbers: boolean): StructureRow[] {
  return section.blocks.map(({ block, originalIndex }) => buildRow(block, originalIndex, ctx, showPaceNumbers, section.laps));
}

const WRAPPER_STEP_COLOR = '#84cc16';

export function buildRunStructure(
  blocks: readonly RunBlock[],
  ctx: RunPaceContext,
  { showPaceNumbers = true }: { showPaceNumbers?: boolean } = {},
): StructureStep[] {
  const sections = groupBlocksIntoSections({ blocks: [...blocks] });
  const warmRows: StructureRow[] = [];
  const coolRows: StructureRow[] = [];
  const main: StructureStep[] = [];

  for (const s of sections) {
    const first = s.blocks[0]?.block;
    if (!first) continue;
    if (s.title === 'חימום' && (first.type === 'warmup' || first._isDynamicWrapper)) {
      warmRows.push(...rowsOf(s, ctx, showPaceNumbers));
    } else if (isStrideBlock(first)) {
      // Strides are part of the warm-up on the boards: one "4 × 20 שנ׳ סטריידס" row (its rest is implied).
      warmRows.push(buildRow(first, s.blocks[0].originalIndex, ctx, showPaceNumbers, s.laps));
    } else if (first.type === 'cooldown') {
      coolRows.push(...rowsOf(s, ctx, showPaceNumbers));
    } else {
      main.push({
        key: `main-${main.length}`,
        phase: 'main',
        title: '',
        color: stripColor(first),
        repeat: s.laps && s.laps > 1 ? s.laps : undefined,
        rows: rowsOf(s, ctx, showPaceNumbers),
      });
    }
  }

  // One middle section → "העיקר"; several (pyramids…) → each keeps its own label.
  main.forEach((st, i) => {
    const firstBlock = blocks[st.rows[0]?.blockIndex ?? -1];
    st.title = main.length === 1 ? 'העיקר' : cleanBlockLabel(firstBlock?.label) || `חלק ${i + 1}`;
  });

  const steps: StructureStep[] = [];
  if (warmRows.length) steps.push({ key: 'warmup', phase: 'warmup', title: 'חימום', color: WRAPPER_STEP_COLOR, rows: warmRows });
  steps.push(...main);
  if (coolRows.length) steps.push({ key: 'cooldown', phase: 'cooldown', title: 'שחרור', color: WRAPPER_STEP_COLOR, rows: coolRows });
  return steps;
}
