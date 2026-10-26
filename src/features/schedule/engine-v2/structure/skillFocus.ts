/**
 * Skill = a focus inside a push / pull-capable day, never its own day.
 * Hosts: push / pull / upper / full_body days (never lower, legs, movement).
 * The lead skill gets most of the session (or a fixed block in a short one); a second skill
 * of the SAME family gets a small part; leads rotate between sessions.
 */
import { SKILL_LEAD_SHARE, SKILL_MINOR_SHARE, SKILL_RULES, SKILL_SHORT_SESSION_MINUTES, SHORT_SESSION_MINUTES } from './config';
import type { SkillChoice, SkillFocus, SkillId, StrengthDay } from './types';

const hosts = (d: StrengthDay, skill: SkillId): boolean => {
  const fam = SKILL_RULES[skill].family;
  switch (d.kind) {
    case 'push': return fam === 'push';
    case 'pull': return fam === 'pull';
    case 'upper': return true;
    case 'full_body': return true; // every full-body day can lead a skill (3-day weeks, decision 7)
    default: return false;
  }
};

export function applySkillFocus(days: StrengthDay[], unlocked: SkillChoice[], sessionMinutes?: number): StrengthDay[] {
  if (!unlocked.length) return days;
  const ids = unlocked.map((s) => s.id);
  const leadCount = new Map<SkillId, number>(ids.map((id) => [id, 0]));
  const short = sessionMinutes != null && sessionMinutes <= SHORT_SESSION_MINUTES;
  const plain = days.every((d) => d.kind === 'full_body');

  return days.map((d) => {
    let cands = ids.filter((id) => hosts(d, id));
    // Full-body days with an emphasis prefer a skill of that family.
    if (plain && d.emphasis && d.emphasis !== 'legs') {
      const fam = cands.filter((id) => SKILL_RULES[id].family === d.emphasis);
      if (fam.length) cands = fam;
    }
    if (!cands.length) return d;
    const lead = [...cands].sort((a, b) => leadCount.get(a)! - leadCount.get(b)! || ids.indexOf(a) - ids.indexOf(b))[0];
    leadCount.set(lead, leadCount.get(lead)! + 1);
    const family = SKILL_RULES[lead].family;
    const minor = ids.find((id) => id !== lead && SKILL_RULES[id].family === family && hosts(d, id));
    const skill: SkillFocus = {
      lead,
      leadShare: SKILL_LEAD_SHARE,
      ...(short ? { leadMinutes: SKILL_SHORT_SESSION_MINUTES } : {}),
      ...(minor ? { minor, minorShare: SKILL_MINOR_SHARE } : {}),
    };
    // Full-body host: emphasis follows the lead skill's family.
    const emphasis = d.kind === 'full_body' ? family : d.emphasis;
    return { ...d, ...(emphasis ? { emphasis } : {}), skill };
  });
}
