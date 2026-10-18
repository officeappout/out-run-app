/**
 * Program tags — which of the user's own programs each strength day of a woven week comes
 * from. Shared by adviseWeek (AdvisedDay.strengthProgramIds — multi-program weeks: an
 * upper-body program + a legs program + a running plan) and the builder's save planner.
 * Pure. The weaver relabels the user's content onto days; this maps each relabelled day
 * back to the STORED ids of a template day with the same content (a legs day keeps its own
 * program id / slug), never inventing a program.
 */
import { DAY_LETTERS, type ScheduleDay, type ScheduleItemId } from '../types/smartSchedule.types';
import { classifyStrengthId, isStrengthTemplateId, type ResolveSlug } from '../engine/strengthVocabulary';
import type { WeaverInputProfile } from '../engine/weaverInput';

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function scheduleIdsOf(ids: string[], resolveSlug?: ResolveSlug): ScheduleItemId[] {
  const out: ScheduleItemId[] = [];
  for (const id of ids) {
    const c = classifyStrengthId(id, resolveSlug).scheduleId;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * New strength day (in order) → the stored ids it should carry: the first unused existing
 * strength day whose content (schedule ids) matches; else the next existing day in order
 * (cycled); else the user's active program ids; else the schedule ids themselves (exactly
 * what the onboarding ScheduleStep writes).
 */
export function strengthIdsForNewDays(
  profile: WeaverInputProfile,
  newDays: ScheduleDay[],
  resolveSlug?: ResolveSlug,
): Map<number, string[]> {
  const template = profile.lifestyle?.recurringTemplate ?? {};
  const existing: Array<{ ids: string[]; content: ScheduleItemId[] }> = [];
  DAY_LETTERS.forEach((letter) => {
    const ids = (template[letter] ?? []).filter((id) => isStrengthTemplateId(id, resolveSlug));
    if (ids.length) existing.push({ ids, content: scheduleIdsOf(ids, resolveSlug) });
  });
  const fallbackProgramIds = (profile.progression?.activePrograms ?? [])
    .map((p) => p.templateId ?? p.id ?? '')
    .filter((id) => id && isStrengthTemplateId(id, resolveSlug));

  const used = new Set<number>();
  const out = new Map<number, string[]>();
  const training = [...newDays].sort((a, b) => a.dayOfWeek - b.dayOfWeek).filter((d) => d.sessions.length > 0);
  training.forEach((day, idx) => {
    const content = day.sessions.map((s) => s.skillId);
    const match = existing.findIndex((e, i) => !used.has(i) && sameSet(e.content, content));
    if (match >= 0) {
      used.add(match);
      out.set(day.dayOfWeek, existing[match].ids);
    } else if (existing.length) {
      out.set(day.dayOfWeek, existing[idx % existing.length].ids);
    } else if (fallbackProgramIds.length) {
      out.set(day.dayOfWeek, [fallbackProgramIds[idx % fallbackProgramIds.length]]);
    } else {
      out.set(day.dayOfWeek, content);
    }
  });
  return out;
}

