import { SKILL_RULES } from './config';
import type { GroupLevels, SkillChoice, SkillId, StructureInput, StructureNote } from './types';

export interface SkillSplit {
  unlocked: SkillChoice[];
  locked: SkillChoice[];
  notes: StructureNote[];
}

export function isSkillUnlocked(id: SkillId, levels: GroupLevels, handstandChestToWall = false): boolean {
  const r = SKILL_RULES[id];
  if (r.pendingOwner) return false;
  if (levels[r.group] < r.minLevel) return false;
  return r.needs === 'handstand_chest_to_wall' ? handstandChestToWall : true;
}

/** Splits the user's chosen skills by unlock; priority = explicit priority, else array order. */
export function splitSkills(input: Pick<StructureInput, 'skills' | 'levels' | 'handstandChestToWall'>): SkillSplit {
  const ordered = (input.skills ?? [])
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.priority ?? a.i) - (b.s.priority ?? b.i) || a.i - b.i)
    .map((x) => x.s);
  const unlocked: SkillChoice[] = [];
  const locked: SkillChoice[] = [];
  const notes: StructureNote[] = [];
  for (const s of ordered) {
    if (isSkillUnlocked(s.id, input.levels, input.handstandChestToWall)) {
      unlocked.push(s);
      continue;
    }
    locked.push(s);
    const r = SKILL_RULES[s.id];
    if (r.pendingOwner) {
      notes.push({ code: 'skill_pending_owner', skill: s.id });
      continue;
    }
    const levelOk = input.levels[r.group] >= r.minLevel;
    notes.push({
      code: 'skill_locked',
      skill: s.id,
      requires: !levelOk || !r.needs ? { group: r.group, level: r.minLevel } : { prerequisite: r.needs },
    });
  }
  return { unlocked, locked, notes };
}
