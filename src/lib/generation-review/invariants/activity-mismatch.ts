import { ACTIVITY_LABEL_HE, AEROBIC, activityFromLabel } from './helpers';
import type { Finding, InvariantRule } from './types';

export const activityMismatch: InvariantRule = {
  id: 'ACTIVITY_MISMATCH',
  titleHe: 'סוג הפעילות לא תואם לבקשה',
  descriptionHe: 'המשתמש ביקש רכיבה/הליכה/ריצה, והתוכנית (הכותרת או המקטעים) מציגה פעילות אחרת — למשל "ריצה + כוח" לרכיבה.',
  severity: 3,
  check({ input, output }) {
    const req = input.requestedActivity;
    if (!req || !AEROBIC.has(req)) return [];
    const out: Finding[] = [];
    const shown = output.planActivity ?? activityFromLabel(output.planLabel ?? output.title);
    if (shown && AEROBIC.has(shown) && shown !== req) {
      out.push({
        ruleId: 'ACTIVITY_MISMATCH',
        severity: 3,
        messageHe: `התבקשה ${ACTIVITY_LABEL_HE[req]} והתוכנית מוצגת כ${ACTIVITY_LABEL_HE[shown]}`,
        data: { requested: req, shown, where: 'plan' },
      });
    }
    const wrongLegs = (output.legs ?? []).filter((l) => AEROBIC.has(l.activity) && l.activity !== req);
    if (wrongLegs.length) {
      out.push({
        ruleId: 'ACTIVITY_MISMATCH',
        severity: 3,
        messageHe: `${wrongLegs.length} מקטעים הם ${ACTIVITY_LABEL_HE[wrongLegs[0].activity]} במקום ${ACTIVITY_LABEL_HE[req]}`,
        data: { requested: req, shown: wrongLegs[0].activity, where: 'legs', count: wrongLegs.length },
      });
    }
    return out;
  },
};
