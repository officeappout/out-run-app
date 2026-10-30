/**
 * Workout structure sheet model (enable_feature_info_sheets_v1, board TutStructureCard): the
 * "i" next to the strength preview's title explains the order of the workout's parts. PURE.
 * Built from the preview's own sections (groupExercisesIntoSections): warm-up, the main
 * blocks (straight / superset / pyramid / tabata / timed) and the stretches, in plan order.
 * A part the workout doesn't have is left out (its step and chip go with it). No main
 * block → no "i".
 */

export type StructurePartKind = 'warmup' | 'main' | 'cooldown';

/** The slice of a preview section the model reads. */
export interface StructureSectionInput {
  id: string;
  title: string;
  exerciseCount: number;
}

export interface StructurePart {
  kind: StructurePartKind;
  /** The part's sections, in order (main: every block). */
  sectionIds: string[];
  /** The first section's own title ("חימום", "סט רגיל", "מתיחות"). */
  title: string;
  exerciseCount: number;
}

export interface StructureInfoModel {
  parts: StructurePart[];
  /** How many blocks the main part has. */
  mainBlocks: number;
  hasWarmup: boolean;
  hasCooldown: boolean;
}

const kindOf = (id: string): StructurePartKind => (id === 'warmup' ? 'warmup' : id === 'cooldown' ? 'cooldown' : 'main');

export function buildStructureInfo(sections: readonly StructureSectionInput[]): StructureInfoModel | null {
  const live = sections.filter((s) => s.exerciseCount > 0);
  const parts: StructurePart[] = [];
  for (const kind of ['warmup', 'main', 'cooldown'] as const) {
    const of = live.filter((s) => kindOf(s.id) === kind);
    if (of.length === 0) continue;
    parts.push({
      kind,
      sectionIds: of.map((s) => s.id),
      title: of[0].title,
      exerciseCount: of.reduce((n, s) => n + s.exerciseCount, 0),
    });
  }
  const main = parts.find((p) => p.kind === 'main');
  if (!main) return null;
  return {
    parts,
    mainBlocks: main.sectionIds.length,
    hasWarmup: parts.some((p) => p.kind === 'warmup'),
    hasCooldown: parts.some((p) => p.kind === 'cooldown'),
  };
}

export type StructureChip = 'warmup' | 'swap' | 'cooldown' | 'rest';

/** Kelly chips: about the warm-up (or swapping) and the stretches (or rest). */
export function structureChips(m: StructureInfoModel): [StructureChip, StructureChip] {
  return [m.hasWarmup ? 'warmup' : 'swap', m.hasCooldown ? 'cooldown' : 'rest'];
}
