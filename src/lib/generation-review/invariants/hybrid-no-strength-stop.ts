import { HYBRID_TYPES } from '../types';
import type { InvariantRule } from './types';

export const hybridNoStrengthStop: InvariantRule = {
  id: 'HYBRID_NO_STRENGTH_STOP',
  titleHe: 'אימון משולב בלי עצירת כוח',
  descriptionHe: 'אימון משולב (הליכה/ריצה + כוח, מסלול + עצירות, אימון מלא בפארק) שאין בו אף עצירת כוח עם תרגילים.',
  severity: 3,
  check({ type, output }) {
    if (!HYBRID_TYPES.has(type)) return [];
    const strengthLegs = (output.legs ?? []).filter((l) => l.activity === 'strength');
    const withExercises = strengthLegs.filter((l) => (l.exercises?.length ?? 0) > 0);
    // A full-park session may carry its exercises at the top level instead of in a leg.
    if (withExercises.length > 0 || (type === 'hybrid_full_park' && (output.exercises?.length ?? 0) > 0)) return [];
    return [{
      ruleId: 'HYBRID_NO_STRENGTH_STOP',
      severity: 3,
      messageHe: strengthLegs.length
        ? `יש ${strengthLegs.length} עצירות כוח אבל אין בהן תרגילים`
        : 'אין אף עצירת כוח באימון',
      data: { strengthLegs: strengthLegs.length, stations: output.stations?.length ?? 0 },
    }];
  },
};
