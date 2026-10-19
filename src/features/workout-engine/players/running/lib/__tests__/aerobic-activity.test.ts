import { describe, expect, it } from 'vitest';
import {
  BIKE_GPS_THRESHOLDS,
  aerobicLabel,
  autoLapDistanceRange,
  cyclingCalories,
  cyclingMet,
  effectiveAutoLapKm,
  fmtSpeed,
  gpsFilterThresholds,
  isCycling,
  paceMinToKmh,
  paceSecToKmh,
  rateLabels,
  rateMetricFor,
  savedWorkoutLabels,
  speedKmh,
} from '../aerobic-activity';
import { lapRows } from '../continuous-run';

describe('activity basics', () => {
  it('only cycling is a ride; unknown reads as a run', () => {
    expect(isCycling('cycling')).toBe(true);
    expect(isCycling('running')).toBe(false);
    expect(isCycling(undefined)).toBe(false);
    expect(rateMetricFor('cycling')).toBe('speed');
    expect(rateMetricFor('walking')).toBe('pace');
    expect(rateMetricFor(null)).toBe('pace');
    expect(aerobicLabel('cycling')).toBe('רכיבה');
    expect(aerobicLabel('walking')).toBe('הליכה');
    expect(aerobicLabel('workout')).toBe('ריצה');
  });
});

describe('GPS filter thresholds', () => {
  // The player's own on-foot constants (useRunningPlayer).
  const RUN = { distanceThresholdM: 5, maxJumpM: 80, maxRealisticSpeedMs: 12, minSpeedMs: 0.3, maxPaceMinKm: 30 };
  const WALK = { ...RUN, distanceThresholdM: 4 };

  it('walking / running keep the caller\'s own gates, untouched', () => {
    expect(gpsFilterThresholds('running', RUN)).toBe(RUN);
    expect(gpsFilterThresholds('walking', WALK)).toBe(WALK);
    expect(gpsFilterThresholds(undefined, RUN)).toBe(RUN);
  });

  it('a ride keeps fast but real fixes that the run gates would drop', () => {
    const bike = gpsFilterThresholds('cycling', RUN);
    expect(bike).toBe(BIKE_GPS_THRESHOLDS);
    // 35 km/h ≈ 9.7 m/s; a fix 10 s late is ~97 m from the anchor.
    const late = 97;
    expect(late > RUN.maxJumpM).toBe(true);
    expect(late > bike.maxJumpM).toBe(false);
    // 50 km/h descent ≈ 13.9 m/s: impossible on foot, fine on a bike.
    expect(13.9 > RUN.maxRealisticSpeedMs).toBe(true);
    expect(13.9 > bike.maxRealisticSpeedMs).toBe(false);
    // Still rejects car-speed glitches (~100 km/h).
    expect(27.8 > bike.maxRealisticSpeedMs).toBe(true);
    // Wider movement gate — fewer jittery steps at speed.
    expect(bike.distanceThresholdM).toBeGreaterThan(RUN.distanceThresholdM);
  });
});

describe('speed', () => {
  it('average speed in km/h', () => {
    expect(speedKmh(10, 1800)).toBe(20);
    expect(speedKmh(0.03, 60)).toBe(0); // under 50 m
    expect(speedKmh(5, 0)).toBe(0);
  });

  it('pace ↔ speed', () => {
    expect(paceSecToKmh(120)).toBe(30);
    expect(paceSecToKmh(0)).toBe(0);
    expect(paceSecToKmh(NaN)).toBe(0);
    expect(paceMinToKmh(3)).toBe(20);
    expect(paceMinToKmh(0)).toBe(0);
    expect(paceMinToKmh(undefined)).toBe(0);
  });

  it('formats one decimal, "--" for none', () => {
    expect(fmtSpeed(24.26)).toBe('24.3');
    expect(fmtSpeed(0)).toBe('--');
    expect(fmtSpeed(Infinity)).toBe('--');
  });

  it('labels follow the metric', () => {
    expect(rateLabels('speed').page).toBe('מהירות');
    expect(rateLabels('speed').average).toBe('מהירות ממוצעת');
    expect(rateLabels('pace')).toEqual({
      page: 'קצב', current: 'קצב נוכחי', average: 'קצב ממוצע', now: 'קצב עכשיו', unitLine: 'דק׳ לק״מ · ממוצע 15 שנ׳',
    });
  });
});

describe('cycling calories (MET by speed)', () => {
  it('MET bands', () => {
    expect(cyclingMet(0)).toBe(4);
    expect(cyclingMet(12)).toBe(4);
    expect(cyclingMet(17)).toBe(6.8);
    expect(cyclingMet(20)).toBe(8);
    expect(cyclingMet(24)).toBe(10);
    expect(cyclingMet(28)).toBe(12);
    expect(cyclingMet(35)).toBe(15.8);
  });

  it('kcal = MET × kg × hours', () => {
    // 20 km in 1 h (20 km/h → MET 8) at 70 kg = 560 kcal.
    expect(cyclingCalories(3600, 20, 70)).toBe(560);
    // 30 min leisure (8 km → 16 km/h → MET 6.8) at 80 kg = 272.
    expect(cyclingCalories(1800, 8, 80)).toBe(272);
    // Missing weight → 70 kg.
    expect(cyclingCalories(3600, 20, 0)).toBe(560);
    expect(cyclingCalories(0, 5, 70)).toBe(0);
  });

  it('a ride is billed far below the run factor for the same km', () => {
    const runKcal = Math.round(20 * 70 * 1.036);
    expect(cyclingCalories(3600, 20, 70)).toBeLessThan(runKcal);
  });
});

describe('auto-lap', () => {
  it('running / walking keep today’s slider; a ride gets 1–10 km, default 5', () => {
    expect(autoLapDistanceRange('running')).toEqual({ minKm: 0.1, maxKm: 2.0, stepKm: 0.1, defaultKm: 1.0 });
    expect(autoLapDistanceRange('cycling')).toEqual({ minKm: 1, maxKm: 10, stepKm: 1, defaultKm: 5 });
  });

  it('a ride never laps under 1 km; runs are untouched', () => {
    expect(effectiveAutoLapKm('running', 0.4)).toBe(0.4);
    expect(effectiveAutoLapKm('walking', 0.2)).toBe(0.2);
    expect(effectiveAutoLapKm('cycling', 0.4)).toBe(1);
    expect(effectiveAutoLapKm('cycling', 5)).toBe(5);
  });
});

describe('saved workout labels', () => {
  it('cycling files as cycling with the bike icon; others unchanged', () => {
    expect(savedWorkoutLabels('cycling')).toEqual({ workoutType: 'cycling', displayIcon: 'bike' });
    expect(savedWorkoutLabels('walking')).toEqual({ workoutType: 'walking' });
    expect(savedWorkoutLabels('running')).toEqual({ workoutType: 'running' });
    expect(savedWorkoutLabels(undefined)).toEqual({ workoutType: 'running' });
  });
});

describe('lap rows with speed', () => {
  const laps = [
    { id: '1', lapNumber: 1, distanceMeters: 5000, durationSeconds: 600, isActive: false },
    { id: '2', lapNumber: 2, distanceMeters: 300, durationSeconds: 40, isActive: true },
  ];
  it('km/h per lap, none under 400 m', () => {
    const rows = lapRows(laps, 'speed');
    expect(rows[0].paceText).toBe('30.0');
    expect(rows[1].paceText).toBeNull();
  });
  it('pace is still the default', () => {
    expect(lapRows(laps)[0].paceText).toBe(lapRows(laps, 'pace')[0].paceText);
    expect(lapRows(laps)[0].paceText).toContain(':');
  });
});
