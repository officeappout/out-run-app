/**
 * v2 (enable_home_v2) skills step — which skills it shows and the 3-pick
 * cap. The selection itself still goes through the page's existing
 * toggleSkill reducer (master chip exclusive, tap order = priority), so the
 * persisted onboarding_skill_focus shape is unchanged.
 */
import { SKILL_MASTER_ID } from '../constants/program-path.constants';

/** Hidden in the v2 step for now (owner's request) — still in SKILL_PROGRAMS / the legacy UI. */
export const V2_HIDDEN_SKILLS: ReadonlySet<string> = new Set(['muscle_up', 'handstand']);

export const V2_SKILL_GROUPS: { key: 'pull' | 'push'; name: string; hint: string; items: { id: string; label: string }[] }[] = [
  {
    key: 'pull',
    name: 'משיכה',
    hint: 'מתח, טבעות',
    items: [
      { id: 'front_lever', label: 'פרונט לבר' },
      { id: 'one_arm_pullup', label: 'מתח יד אחת' },
    ],
  },
  {
    key: 'push',
    name: 'דחיפה',
    hint: 'מקבילים, רצפה',
    items: [
      { id: 'planche', label: 'פלאנץ׳' },
      { id: 'hspu', label: 'סמיכה בעמידת ידיים' },
    ],
  },
];

export const V2_MAX_SKILLS = 3;

/**
 * Whether a tap on `id` should be forwarded to toggleSkill. Deselecting and
 * the master chip always pass; adding a 4th individual skill is blocked.
 */
export function canToggleSkillV2(selected: string[], id: string, max = V2_MAX_SKILLS): boolean {
  if (id === SKILL_MASTER_ID || selected.includes(id)) return true;
  return selected.filter((s) => s !== SKILL_MASTER_ID).length < max;
}
