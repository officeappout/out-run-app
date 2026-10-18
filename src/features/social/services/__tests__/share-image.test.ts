import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn() }));

import {
  SHARE_TEMPLATES,
  buildShareTemplateData,
  coverRect,
  formatDurationMin,
  shareFileName,
  shareInputFromPost,
  shareKindFor,
  type ShareImageInput,
} from '../share-image';
import { feedPhotoPath, fitWithin } from '../feed-photo';

const strength: ShareImageInput = {
  kind: 'strength',
  durationMinutes: 42,
  programName: 'פלג גוף עליון',
  levelIndex: 4,
  levelCount: 12,
  topExercises: [
    { name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' },
    { name: 'מקבילים', sets: 3, setsDone: 2, value: 10, unit: 'reps' },
    { name: 'פלאנק', sets: 2, setsDone: 2, value: 30, unit: 'seconds' },
  ],
  moreExercises: 4,
  personalBest: '8 חזרות מתח (+2 מהפעם הקודמת)',
};

const run: ShareImageInput = {
  kind: 'cardio',
  durationMinutes: 30,
  distanceKm: 5.2,
  paceSecPerKm: 348,
  routeShape: [0, 0, 500, 500, 1000, 200],
  streakDays: 6,
};

describe('templates', () => {
  it('2–3 per activity', () => {
    expect(SHARE_TEMPLATES.strength.length).toBeGreaterThanOrEqual(2);
    expect(SHARE_TEMPLATES.cardio.length).toBeGreaterThanOrEqual(2);
  });

  it('strength list: program, level, bar, exercises, more, badge', () => {
    const d = buildShareTemplateData(strength, 'strength-list');
    expect(d.eyebrow).toBe('כוח · פלג גוף עליון');
    expect(d.headline).toBe('שלב 4 מתוך 12');
    expect(d.progress).toBeCloseTo(4 / 12);
    expect(d.rows.map((r) => r.detail)).toEqual(['3 × 8', '3 × 10', '2 × 30 שנ׳']);
    expect(d.footnote).toBe('ועוד 4 תרגילים');
    expect(d.badge).toContain('+2');
  });

  it('strength bold: duration headline + counts', () => {
    const d = buildShareTemplateData(strength, 'strength-bold');
    expect(d.headline).toBe('42 דקות');
    expect(d.stats).toEqual([
      { value: '7', unit: 'תרגילים' },
      { value: '4/12', unit: 'שלב' },
    ]);
    expect(d.rows).toHaveLength(2);
  });

  it('strength with nothing but the duration — no invented lines', () => {
    const d = buildShareTemplateData({ kind: 'strength', durationMinutes: 20 }, 'strength-list');
    expect(d.eyebrow).toBe('אימון כוח');
    expect(d.headline).toBe('20 דקות');
    expect(d.rows).toEqual([]);
    expect(d.progress).toBeUndefined();
    expect(d.badge).toBeUndefined();
  });

  it('run route: km headline, pace + time, hero route, streak badge', () => {
    const d = buildShareTemplateData(run, 'run-route');
    expect(d.headline).toBe('5.2 ק״מ');
    expect(d.stats).toEqual([
      { value: '5:48', unit: 'דק׳ לק״מ' },
      { value: '30', unit: 'דקות' },
    ]);
    expect(d.routeStyle).toBe('hero');
    expect(d.badge).toBe('רצף 6 ימים');
  });

  it('run stats: inset route; no route → none', () => {
    expect(buildShareTemplateData(run, 'run-stats').routeStyle).toBe('inset');
    const noRoute = buildShareTemplateData({ ...run, routeShape: undefined }, 'run-route');
    expect(noRoute.route).toBeUndefined();
    expect(noRoute.routeStyle).toBeUndefined();
  });

  it('an unknown template id → the first of the kind', () => {
    expect(buildShareTemplateData(run, 'strength-list').templateId).toBe('run-route');
  });
});

describe('mapping from a post', () => {
  it('pace from paceMinPerKm when seconds are missing; short shapes dropped', () => {
    const input = shareInputFromPost({ activityCategory: 'cardio', durationMinutes: 30, paceMinPerKm: 5.8, routeShape: [1, 2], distanceKm: 0 });
    expect(input).toMatchObject({ kind: 'cardio', paceSecPerKm: 348 });
    expect(input.routeShape).toBeUndefined();
    expect(input.distanceKm).toBeUndefined();
  });
  it('maintenance shares as the strength template', () => {
    expect(shareKindFor('maintenance')).toBe('strength');
    expect(shareKindFor('cardio')).toBe('cardio');
  });
});

describe('pure layout helpers', () => {
  it('coverRect crops the long side', () => {
    const r = coverRect(2000, 1000, 1080, 1080);
    expect([r.sx, r.sy, r.sw, r.sh].map((n) => Math.round(n))).toEqual([500, 0, 1000, 1000]);
    expect(coverRect(0, 0, 10, 10)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
  it('formatDurationMin', () => {
    expect(formatDurationMin(42)).toEqual({ value: '42', unit: 'דקות' });
    expect(formatDurationMin(75)).toEqual({ value: '1:15', unit: 'שעות' });
  });
  it('shareFileName', () => {
    expect(shareFileName('cardio', 'story', new Date(2026, 9, 18))).toBe('out-run-story-20261018.png');
  });
  it('fitWithin never upscales, keeps the ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 10)).toEqual({ width: 0, height: 0 });
  });
  it('feedPhotoPath is owner-scoped', () => {
    expect(feedPhotoPath('u1', 123)).toBe('feed-photos/u1/123.jpg');
  });
});
