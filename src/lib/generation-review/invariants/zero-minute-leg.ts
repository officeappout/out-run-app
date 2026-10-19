import { ACTIVITY_LABEL_HE, AEROBIC } from './helpers';
import type { Finding, InvariantRule } from './types';

export const zeroMinuteLeg: InvariantRule = {
  id: 'ZERO_MINUTE_LEG',
  titleHe: 'מקטע של 0 דקות',
  descriptionHe: 'מקטע באימון (אירובי או כוח) שאורכו 0 דקות או 0 מטר — המשתמש רואה שלב ריק.',
  severity: 3,
  check({ output }) {
    const out: Finding[] = [];
    (output.legs ?? []).forEach((leg, i) => {
      const zeroMin = typeof leg.minutes === 'number' && leg.minutes < 0.5;
      const zeroDist = AEROBIC.has(leg.activity) && typeof leg.distanceM === 'number' && leg.distanceM < 1;
      if (zeroMin || zeroDist) {
        out.push({
          ruleId: 'ZERO_MINUTE_LEG',
          severity: 3,
          messageHe: `מקטע ${i + 1} (${ACTIVITY_LABEL_HE[leg.activity]}) הוא ${zeroMin ? '0 דקות' : '0 מטר'}`,
          data: { leg: i, activity: leg.activity, minutes: leg.minutes ?? null, distanceM: leg.distanceM ?? null },
        });
      }
    });
    return out;
  },
};
