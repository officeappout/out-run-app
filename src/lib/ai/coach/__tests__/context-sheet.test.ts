import { describe, it, expect } from 'vitest';
import { ageBandOf, buildUserContextSheet, daysBetween, summarizeProgress, weekKeys } from '../context-sheet';

const NOW = new Date('2026-10-18T09:00:00Z');

/** Synthetic profile stuffed with fields that must NEVER reach the model. */
const PROFILE = {
  id: 'uid_secret_123',
  core: {
    name: 'דנה ישראלי-כהן',
    email: 'dana@example.com',
    phone: '+972501234567',
    photoURL: 'https://example.com/p.jpg',
    gender: 'female',
    birthDate: new Date('1990-05-01T00:00:00Z'),
    anchorLat: 31.52,
    anchorLng: 34.59,
    authorityId: 'auth_sderot_secret',
    tenantId: 'tenant_secret',
    unitId: 'unit_secret',
    mainGoal: 'healthy_lifestyle',
    ageGroup: 'adult',
  },
  selectedGoals: ['glutes_abs'],
  progression: {
    currentStreak: 4,
    tracks: { legs: { currentLevel: 5, percent: 40 }, core: { currentLevel: 3, percent: 10 }, empty: { currentLevel: 0 } },
  },
  lifestyle: {
    trainingTime: '18:30',
    primaryTrack: 'strength',
    commute: { method: 'car', workLocation: { lat: 32.1, lng: 34.8 } },
  },
  equipment: { home: ['dumbbells', 'mat'], office: [], outdoor: ['pullup_bar'] },
  health: { injuries: ['knee'] },
  fcmTokens: ['token_secret'],
};

describe('buildUserContextSheet', () => {
  const sheet = buildUserContextSheet({
    profile: PROFILE,
    workouts: [
      { date: new Date('2026-10-17T16:00:00Z'), workoutType: 'strength', durationSec: 1500 },
      { date: null, workoutType: 'running', durationSec: 60 },
    ],
    weekSchedule: [
      { date: '2026-10-18', type: 'training', programIds: ['legs'], startTime: '18:30', completed: false },
      { date: '2026-10-20', type: 'rest' },
    ],
    todayKey: '2026-10-18',
    areaName: 'שדרות',
    now: NOW,
  });
  const json = JSON.stringify(sheet);

  it('carries the useful facts', () => {
    expect(sheet.firstName).toBe('דנה');
    expect(sheet.gender).toBe('female');
    expect(sheet.ageBand).toBe('30-44');
    expect(sheet.programs).toEqual([
      { id: 'core', name: 'ליבה', level: 3, percentToNext: 10 },
      { id: 'legs', name: 'רגליים', level: 5, percentToNext: 40 },
    ]);
    expect(sheet.lastWorkouts).toEqual([{ date: '2026-10-17', type: 'strength', minutes: 25 }]);
    expect(sheet.today).toHaveLength(1);
    expect(sheet.today[0].programs).toEqual(['רגליים']);
    expect(sheet.thisWeek).toHaveLength(2);
    expect(sheet.equipment.home).toEqual(['dumbbells', 'mat']);
    expect(sheet.area).toBe('שדרות');
    expect(sheet.injuries).toEqual(['knee']);
    expect(sheet.preferredTrainingTime).toBe('18:30');
  });

  it('contains no PII beyond the first name', () => {
    for (const secret of [
      'ישראלי',
      'dana@example.com',
      '+972',
      'https://',
      '1990',
      '31.52',
      '34.59',
      '32.1',
      'auth_sderot_secret',
      'tenant_secret',
      'unit_secret',
      'uid_secret_123',
      'token_secret',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('unknown gender → other', () => {
    const s = buildUserContextSheet({ profile: { core: { name: 'Sam' } }, workouts: [], weekSchedule: [], todayKey: '', areaName: null, now: NOW });
    expect(s.gender).toBe('other');
    expect(s.ageBand).toBeNull();
  });
});

describe('helpers', () => {
  it('age band never echoes a minor', () => {
    expect(ageBandOf(new Date('2012-01-01T00:00:00Z'), NOW)).toBeNull();
    expect(ageBandOf({ toDate: () => new Date('1960-01-01T00:00:00Z') }, NOW)).toBe('60+');
  });
  it('weekKeys is Sunday-anchored', () => {
    expect(weekKeys('2026-10-20', 2)).toEqual([
      '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
    ]);
  });
  it('daysBetween is inclusive', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('summarizeProgress counts only real rows', () => {
    const p = summarizeProgress(
      'week',
      [
        { date: new Date('2026-10-17T10:00:00Z'), workoutType: 'strength', durationSec: 1200 },
        { date: new Date('2026-10-17T18:00:00Z'), workoutType: 'running', durationSec: 1800 },
        { date: new Date('2026-10-15T10:00:00Z'), workoutType: 'strength', durationSec: 600 },
      ],
      PROFILE,
      NOW,
    );
    expect(p).toMatchObject({ workouts: 3, totalMinutes: 60, activeDays: 2, streakDays: 4 });
    expect(p.byType.strength).toEqual({ workouts: 2, minutes: 30 });
  });
});
