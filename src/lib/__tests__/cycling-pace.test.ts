import { describe, expect, it } from 'vitest';
import {
  CYCLING_KCAL_PER_KM, CYCLING_MIN_PER_KM, CYCLING_SPEED_KMH, LEGACY_CYCLING_M_PER_MIN,
  cyclingKcalForKm, cyclingMetersPerMin, cyclingMinutesForMeters,
} from '../cycling-pace';
import { KCAL_PER_KM, SPEED_KMH } from '@/features/parks/core/services/route-request.utils';
import { ACTIVITY_MIN_PER_KM } from '@/features/parks/core/components/overview/route/route-overview';

describe('cycling-pace — one shared bike speed', () => {
  it('keeps the values existing users already see (20 km/h, 25 kcal/km, 3 min/km)', () => {
    expect(CYCLING_SPEED_KMH).toBe(20);
    expect(CYCLING_KCAL_PER_KM).toBe(25);
    expect(CYCLING_MIN_PER_KM).toBe(3);
    expect(SPEED_KMH.cycling).toBe(20);
    expect(KCAL_PER_KM.cycling).toBe(25);
    expect(ACTIVITY_MIN_PER_KM.cycling).toBe(3);
  });

  it('flag off keeps the legacy 250 m/min, flag on uses the shared 20 km/h', () => {
    expect(cyclingMetersPerMin(false)).toBe(LEGACY_CYCLING_M_PER_MIN);
    expect(cyclingMetersPerMin(false)).toBe(250);
    expect(cyclingMetersPerMin(true)).toBeCloseTo(333.33, 2);
  });

  it('10 km takes 30 minutes at the shared pace (it took 40 at 250 m/min, 63 at running pace)', () => {
    expect(cyclingMinutesForMeters(10_000)).toBe(30);
    expect(cyclingMinutesForMeters(0)).toBe(1);
    expect(cyclingKcalForKm(10)).toBe(250);
  });
});
