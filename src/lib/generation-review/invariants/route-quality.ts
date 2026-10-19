import { LOOP_QUALITY_THRESHOLDS } from '@/lib/route-quality/acceptance';
import type { Finding, InvariantRule } from './types';

export const ROUTE_DISTANCE_TOLERANCE = 0.25;
/** Unmarked crossings per km above this are flagged (the v1 acceptance bar). */
const MAX_UNMARKED_PER_KM = LOOP_QUALITY_THRESHOLDS.maxUnmarkedCrossingsPerKm;

export const routeQuality: InvariantRule = {
  id: 'ROUTE_QUALITY',
  titleHe: 'איכות מסלול',
  descriptionHe: 'מדדי route-quality על הקו שנוצר: ענפים מתים, חזרה על אותו רחוב, מסלול צר מדי, חציות לא מסומנות של כבישים ראשיים, ומרחק רחוק מהמבוקש.',
  severity: 2,
  check({ output }) {
    const r = output.route;
    if (!r) return [];
    const m = r.metrics;
    const out: Finding[] = [];
    const add = (sub: string, severity: 1 | 2 | 3, messageHe: string, value: number) =>
      out.push({ ruleId: 'ROUTE_QUALITY', severity, messageHe, data: { sub, value } });
    if (m.spurCount > 0) add('spur', 2, `${m.spurCount} ענפים מתים (הלוך-חזור באותו רחוב)`, m.spurCount);
    if (m.uTurnCount > 0) add('uturn', 1, `${m.uTurnCount} פרסות`, m.uTurnCount);
    if (m.retracedPct > LOOP_QUALITY_THRESHOLDS.maxRetracedPct) add('retrace', 2, `${Math.round(m.retracedPct * 100)}% מהמסלול חוזר על עצמו`, m.retracedPct);
    if (r.loop && m.compactness < LOOP_QUALITY_THRESHOLDS.minCompactness) add('compactness', 2, `מסלול מעגלי צר מדי (קומפקטיות ${m.compactness})`, m.compactness);
    if (typeof m.unmarkedCrossings === 'number' && m.unmarkedCrossings > 0) {
      const perKm = m.lengthM > 0 ? m.unmarkedCrossings / (m.lengthM / 1000) : 0;
      if (perKm > MAX_UNMARKED_PER_KM) add('unmarked_crossings', 3, `${m.unmarkedCrossings} חציות לא מסומנות של כבישים ראשיים`, m.unmarkedCrossings);
    }
    if (typeof m.distanceErrorPct === 'number' && Math.abs(m.distanceErrorPct) > ROUTE_DISTANCE_TOLERANCE) {
      add('distance', 2, `המרחק ${m.distanceErrorPct > 0 ? 'ארוך' : 'קצר'} ב-${Math.round(Math.abs(m.distanceErrorPct) * 100)}% מהמבוקש`, m.distanceErrorPct);
    }
    return out;
  },
};
