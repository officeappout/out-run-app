/** The week structure: level -> band -> table -> beginner cap -> skill focus -> styles. Pure. */
import { applySkillFocus } from './skillFocus';
import { splitSkills } from './skills';
import { applyStyles } from './styles';
import { BEGINNER_STRENGTH_DAYS, MAX_WEEK_DAYS, MOVEMENT_ROTATION, SKILL_HINT_MAX_DAYS } from './config';
import { strengthTemplate } from './table';
import { weekLevelOf } from './weekLevel';
import { bandOf } from './config';
import type { MovementDay, StrengthDay, StructureDay, StructureInput, StructureNote, StructurePlan } from './types';

const movement = (i: number): MovementDay => ({ type: 'movement', kind: MOVEMENT_ROTATION[i % MOVEMENT_ROTATION.length] });
const strength = (t: { kind: StrengthDay['kind']; emphasis?: StrengthDay['emphasis'] }): StrengthDay => ({
  type: 'strength', kind: t.kind, ...(t.emphasis ? { emphasis: t.emphasis } : {}),
});

/** Spreads `m` movement days evenly between the strength days (never two strength days forced adjacent when avoidable). */
function interleave(s: StructureDay[], m: number): StructureDay[] {
  if (m <= 0) return s;
  const total = s.length + m;
  const moveAt = new Set<number>();
  for (let j = 0; j < m; j++) moveAt.add(Math.floor(((j + 1) * total) / (m + 1)));
  const out: StructureDay[] = [];
  let si = 0, mi = 0;
  for (let p = 0; p < total; p++) out.push(moveAt.has(p) && mi < m ? movement(mi++) : s[si++] ?? movement(mi++));
  return out;
}

export function planStructure(input: StructureInput): StructurePlan {
  const days = Math.min(MAX_WEEK_DAYS, Math.max(1, Math.round(input.days || 1)));
  const weekLevel = weekLevelOf(input.levels);
  const band = bandOf(weekLevel);
  const notes: StructureNote[] = [];

  let template = strengthTemplate(days);
  let moveCount = days >= MAX_WEEK_DAYS ? 1 : 0;
  if (band === 'beginner' && days > BEGINNER_STRENGTH_DAYS) {
    template = strengthTemplate(BEGINNER_STRENGTH_DAYS);
    moveCount = days - BEGINNER_STRENGTH_DAYS;
    notes.push({ code: 'beginner_extra_days_are_movement' });
  } else if (days >= MAX_WEEK_DAYS) {
    notes.push({ code: 'seventh_day_movement' });
  }
  if (days === 1) notes.push({ code: 'single_day_covers_each_muscle_once' });

  const sk = splitSkills(input);
  notes.push(...sk.notes);
  let strengthDays = template.map(strength);
  strengthDays = applySkillFocus(strengthDays, sk.unlocked, input.sessionMinutes);

  const led = strengthDays.some((d) => d.skill);
  if (led && band !== 'advanced' && sk.unlocked.length) {
    // Edge case (approved): an unlocked, chosen skill leads even when the average says beginner/intermediate.
    notes.push({ code: 'skill_leads_despite_week_band', skill: sk.unlocked[0].id });
  }
  if (led && days <= SKILL_HINT_MAX_DAYS) notes.push({ code: 'skill_hint_add_day_or_pick_focus' });
  if (strengthDays.some((d) => d.skill?.minor)) notes.push({ code: 'second_skill_small_part' });

  if (band === 'advanced' && !sk.unlocked.length) {
    strengthDays = applyStyles(strengthDays, input);
    notes.push({ code: 'advanced_varied_styles' });
  }

  const sequence = interleave(strengthDays, moveCount);
  return {
    weekLevel, band, days, sequence,
    strengthDays: strengthDays.length,
    movementDays: moveCount,
    unlockedSkills: sk.unlocked.map((s) => s.id),
    lockedSkills: sk.locked.map((s) => s.id),
    notes,
  };
}
