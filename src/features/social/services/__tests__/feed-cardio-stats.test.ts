import { describe, expect, it } from 'vitest';
import { cardioPostStats, formatPaceMin, isRidePost, rideSpeedKmh } from '../feed-cardio-stats';

describe('isRidePost', () => {
  it('a post stamped cycling is a ride', () => {
    expect(isRidePost({ durationMinutes: 40, activityType: 'cycling' })).toBe(true);
  });
  it('a ride posted before the stamp (title רכיבה, no pace) is a ride', () => {
    expect(isRidePost({ durationMinutes: 40, title: 'רכיבה', distanceKm: 12, paceMinPerKm: null, paceSecPerKm: null })).toBe(true);
  });
  it('runs / walks are not rides', () => {
    expect(isRidePost({ durationMinutes: 30, distanceKm: 5, paceMinPerKm: 6 })).toBe(false);
    expect(isRidePost({ durationMinutes: 30, title: 'רכיבה', paceMinPerKm: 6 })).toBe(false);
    expect(isRidePost({ durationMinutes: 30, title: 'ריצה' })).toBe(false);
  });
});

describe('rideSpeedKmh', () => {
  it('distance over hours', () => {
    expect(rideSpeedKmh(20, 60)).toBe(20);
    expect(rideSpeedKmh(15, 45)).toBe(20);
  });
  it('null when unknown', () => {
    expect(rideSpeedKmh(undefined, 30)).toBeNull();
    expect(rideSpeedKmh(0, 30)).toBeNull();
    expect(rideSpeedKmh(10, 0)).toBeNull();
    expect(rideSpeedKmh(Number.NaN, 30)).toBeNull();
  });
});

describe('cardioPostStats', () => {
  it('a ride: distance · km/h · minutes', () => {
    expect(cardioPostStats({ durationMinutes: 45, distanceKm: 18.4, activityType: 'cycling' })).toEqual([
      { value: '18.4', unit: 'ק״מ' },
      { value: '24.5', unit: 'קמ״ש' },
      { value: '45', unit: 'דקות' },
    ]);
  });
  it('a ride without distance shows dashes, not a pace', () => {
    const [d, sp] = cardioPostStats({ durationMinutes: 20, activityType: 'cycling' });
    expect(d.value).toBe('—');
    expect(sp).toEqual({ value: '—', unit: 'קמ״ש' });
  });
  it('a run: unchanged — distance · pace · minutes', () => {
    expect(cardioPostStats({ durationMinutes: 30, distanceKm: 5, paceMinPerKm: 6.5 })).toEqual([
      { value: '5.0', unit: 'ק״מ' },
      { value: '6:30', unit: 'דק׳ לק״מ' },
      { value: '30', unit: 'דקות' },
    ]);
  });
  it('a run without pace → dash', () => {
    expect(cardioPostStats({ durationMinutes: 30 })[1]).toEqual({ value: '—', unit: 'דק׳ לק״מ' });
  });
});

describe('formatPaceMin', () => {
  it('rounds seconds, carries 60', () => {
    expect(formatPaceMin(5.5)).toBe('5:30');
    expect(formatPaceMin(4.999)).toBe('5:00');
  });
});
