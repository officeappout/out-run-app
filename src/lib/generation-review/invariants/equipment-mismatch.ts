import { isBodyweightOnly } from './helpers';
import type { ExerciseSummary } from '../types';
import type { Finding, InvariantRule } from './types';

function missing(ex: ExerciseSummary, have: string[]): string[] {
  if (isBodyweightOnly(ex.equipment)) return [];
  const set = new Set(have);
  return (ex.equipment ?? []).filter((e) => e !== 'none' && e !== 'bodyweight' && e !== 'floor' && !set.has(e));
}

export const equipmentMismatch: InvariantRule = {
  id: 'EQUIPMENT_MISMATCH',
  titleHe: 'חסר ציוד לתרגיל',
  descriptionHe: 'תרגיל שדורש ציוד שאין בפארק של התחנה, או אימון בבית עם ציוד שהמשתמש לא סימן שיש לו.',
  severity: 3,
  check({ input, output }) {
    const out: Finding[] = [];
    // Park stations: each strength leg's exercises against that park's equipment.
    const parkEq = new Map((output.stations ?? []).map((s) => [s.parkId, s.equipment ?? null]));
    (output.legs ?? []).forEach((leg, i) => {
      const have = leg.parkId ? parkEq.get(leg.parkId) : null;
      if (!have) return;
      for (const ex of leg.exercises ?? []) {
        const miss = missing(ex, have);
        if (miss.length) {
          out.push({
            ruleId: 'EQUIPMENT_MISMATCH',
            severity: 3,
            messageHe: `בתחנה ${i + 1} (${leg.parkId}) אין ${miss.join(', ')} ל-${ex.id}`,
            data: { exerciseId: ex.id, parkId: leg.parkId ?? null, missing: miss.join(',') },
          });
        }
      }
    });
    // Home: top-level exercises against the user's home equipment.
    if (input.location === 'home' && Array.isArray(input.equipment)) {
      for (const ex of output.exercises ?? []) {
        const miss = missing(ex, input.equipment);
        if (miss.length) {
          out.push({
            ruleId: 'EQUIPMENT_MISMATCH',
            severity: 3,
            messageHe: `בבית אין ${miss.join(', ')} ל-${ex.id}`,
            data: { exerciseId: ex.id, missing: miss.join(','), where: 'home' },
          });
        }
      }
    }
    return out;
  },
};
