/**
 * Week-structure types (owner decisions 26.10.2026). Pure data, no copy: user-facing text is
 * rendered by the caller from the reason / hint CODES below (translation-ready).
 */
export type WeekBand = 'beginner' | 'intermediate' | 'advanced';
export type Emphasis = 'push' | 'pull' | 'legs';
export type StrengthDayKind = 'full_body' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';
export type MovementKind = 'walk' | 'mobility' | 'core_short';
export type SkillId = 'front_lever' | 'planche' | 'one_arm_pullup' | 'handstand' | 'hspu' | 'muscle_up';
export type SkillFamily = 'push' | 'pull';
export type StyleId = 'strength' | 'emom' | 'amrap' | 'circuit';

export interface GroupLevels {
  push: number;
  pull: number;
  legs: number;
}

export interface SkillChoice {
  id: SkillId;
  /** Lower = more important. Defaults to the array order. */
  priority?: number;
}

export interface StructureInput {
  /** Training days the user chose (1..7, clamped). */
  days: number;
  levels: GroupLevels;
  /** Skills the user consciously chose. Locked ones are reported, never scheduled. */
  skills?: SkillChoice[];
  /** Minutes per session, when known (drives skill share and style priority). */
  sessionMinutes?: number;
  intensity?: 'low' | 'medium' | 'high';
  /** hspu prerequisite: handstand chest-to-wall achieved. */
  handstandChestToWall?: boolean;
}

export interface SkillFocus {
  lead: SkillId;
  /** Second skill of the same family: a small part only (decision 6). */
  minor?: SkillId;
  /** Share of the session for the lead (0..1), or fixed minutes for short sessions. */
  leadShare: number;
  leadMinutes?: number;
  minorShare?: number;
  /**
   * R28 (owner 27.10.2026): on an upper / full-body host the focus day still trains a little of
   * the other side (push on a pull-skill day and the reverse), so every muscle works twice a week.
   */
  otherSide?: SkillFamily;
}

export interface StyleChoice {
  primary: StyleId;
  finisher: Exclude<StyleId, 'strength'> | null;
}

export interface StrengthDay {
  type: 'strength';
  kind: StrengthDayKind;
  /** Full-body days only: the muscle group that gets extra volume. */
  emphasis?: Emphasis;
  skill?: SkillFocus;
  style?: StyleChoice;
  /** R27: an upper day is push + pull together; in a short session they run as supersets. */
  pairing?: 'push_pull_supersets';
}

/** R31: core 5-10 minutes at the end of every strength day, gated by the weekly core set target. */
export interface CoreFinisher {
  minMinutes: number;
  maxMinutes: number;
  /** The slot is skipped once the week's core set target is met (workout-engine core-weekly-target). */
  gate: 'weekly_target';
}

export interface MovementDay {
  type: 'movement';
  kind: MovementKind;
}

export type StructureDay = StrengthDay | MovementDay;

export type StructureNoteCode =
  | 'beginner_extra_days_are_movement'
  | 'seventh_day_movement'
  | 'single_day_covers_each_muscle_once'
  | 'skill_locked'
  | 'skill_pending_owner'
  | 'skill_leads_despite_week_band'
  | 'skill_hint_add_day_or_pick_focus'
  | 'second_skill_small_part'
  | 'advanced_varied_styles';

export interface StructureNote {
  code: StructureNoteCode;
  skill?: SkillId;
  /** Unlock requirement for skill_locked. */
  requires?: { group: Emphasis; level: number } | { prerequisite: 'handstand_chest_to_wall' };
}

export interface StructurePlan {
  weekLevel: number;
  band: WeekBand;
  /** Days actually used (clamped 1..7). */
  days: number;
  /** Ordered week sequence (abstract slots; the engine places them on real days). */
  sequence: StructureDay[];
  strengthDays: number;
  movementDays: number;
  unlockedSkills: SkillId[];
  lockedSkills: SkillId[];
  notes: StructureNote[];
  /** R31: every strength day ends with a short core block (skipped once the weekly target is met). */
  coreFinisher: CoreFinisher;
}
