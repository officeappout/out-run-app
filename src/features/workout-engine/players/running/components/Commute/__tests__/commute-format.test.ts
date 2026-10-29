import { describe, expect, it } from 'vitest';
import { commuteHeaderText } from '../commute-format';

// A minimal t stub: the he catalog's own values for the keys the header uses.
const HE: Record<string, string> = {
  'run.commute.destinationFallback': 'יעד',
  'run.commute.arrived': 'הגעת ליעד',
  'run.commute.waitingGps': 'ממתין לאיתור GPS…',
  'run.commute.arrival': 'הגעה משוערת',
};
const t = ((key: string, p?: Record<string, string>) =>
  key === 'run.commute.remainingKm' ? `${p?.km} ק״מ` : key === 'run.commute.remainingM' ? `${p?.m} מ׳` : HE[key] ?? key) as never;

const eta = (km: number | null, arrival: Date | null = null, hasArrived = false) => ({
  distanceRemainingKm: km, etaSeconds: null, etaArrival: arrival, hasArrived,
});

describe('commuteHeaderText (AA2: v2 player header when navigating to a park)', () => {
  it('destination over remaining + arrival', () => {
    expect(commuteHeaderText(eta(1.234, new Date(2026, 9, 28, 9, 5)), 'גן הפעמונים', t))
      .toEqual({ eyebrow: 'גן הפעמונים', title: '1.23 ק״מ · הגעה משוערת 09:05' });
  });
  it('metres under 1 km', () => {
    expect(commuteHeaderText(eta(0.42, new Date(2026, 9, 28, 18, 30)), 'פארק', t).title).toBe('420 מ׳ · הגעה משוערת 18:30');
  });
  it('arrived', () => {
    expect(commuteHeaderText(eta(0.01, null, true), 'פארק', t).title).toBe('הגעת ליעד');
  });
  it('no GPS yet, no label', () => {
    expect(commuteHeaderText(eta(null), undefined, t)).toEqual({ eyebrow: 'יעד', title: 'ממתין לאיתור GPS…' });
  });
});
