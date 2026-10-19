import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ storage: {}, db: {} }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn() }));

import { shareInputFromPost, type ShareImageInput } from '../../services/share-image';
import { coverRectFocal, ellipsize, fitFontSize, rtlColumns, stackFromBottom, stackFromTop, stackHeight, wrapLines } from '../layout';
import { buildShareModel, durationStat, formatClock, setRows, shareDateLabel } from '../model';
import { paletteFor, toneFor } from '../palette';
import { fitRoutePoints, kmMarkFractions, pointAtFraction } from '../route-geometry';
import { shareTotalsFromPhases } from '../summary-totals';
import { SHARE_TEMPLATES_V2, defaultTemplateId, templateById, templatesFor } from '../templates/registry';
import { frameFor } from '../types';

/** 10 units per character. */
const measure = (s: string) => s.length * 10;

describe('stack layout (bottom-up)', () => {
  it('anchors the last block to the bottom and stacks upwards with gaps', () => {
    expect(stackFromBottom(100, [{ h: 10 }, { h: 20, gapAbove: 5 }, { h: 30, gapAbove: 4 }])).toEqual([31, 46, 70]);
  });

  it('a dropped (0-height) block leaves no hole', () => {
    const tops = stackFromBottom(100, [{ h: 10 }, { h: 0, gapAbove: 50 }, { h: 30, gapAbove: 4 }]);
    expect(tops[2]).toBe(70);
    expect(tops[0]).toBe(56);
  });

  it('top-down and total height agree', () => {
    const blocks = [{ h: 10 }, { h: 0, gapAbove: 9 }, { h: 20, gapAbove: 6 }];
    expect(stackFromTop(0, blocks)).toEqual([0, 10, 16]);
    expect(stackHeight(blocks)).toBe(36);
  });
});

describe('text fitting', () => {
  it('wraps a long name into 2 lines', () => {
    expect(wrapLines('פלג גוף עליון', 80, measure, 2)).toEqual(['פלג גוף', 'עליון']);
  });

  it('ellipsizes what does not fit in the last line', () => {
    const lines = wrapLines('אחת שתיים שלוש ארבע', 80, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines).toEqual(['אחת', 'שתיים…']);
  });

  it('keeps short text on one line, empty → none', () => {
    expect(wrapLines('מתח', 200, measure)).toEqual(['מתח']);
    expect(wrapLines('   ', 200, measure)).toEqual([]);
  });

  it('ellipsize leaves fitting text alone', () => {
    expect(ellipsize('abc', 30, measure)).toBe('abc');
    expect(ellipsize('abcdef', 40, measure)).toBe('abc…');
  });

  it('fitFontSize steps down until it fits, never below min', () => {
    expect(fitFontSize('12345', 300, 168, 72, (s) => s * 2.5)).toBe(120);
    expect(fitFontSize('12345', 10, 168, 72, (s) => s * 2.5)).toBe(72);
  });

  it('rtl columns run right → left', () => {
    expect(rtlColumns(0, 300, 3).map((c) => c.right)).toEqual([300, 200, 100]);
  });
});

describe('photo cover with focal point', () => {
  it('keeps the top 40% in view on a tall photo', () => {
    const r = coverRectFocal(1000, 3000, 1000, 1000);
    expect(r.sw).toBe(1000);
    expect(r.sh).toBe(1000);
    expect(r.sy).toBe(700); // 3000*0.4 - 500
  });

  it('clamps at the edges', () => {
    expect(coverRectFocal(1000, 3000, 1000, 1000, 0.5, 0).sy).toBe(0);
    expect(coverRectFocal(1000, 3000, 1000, 1000, 0.5, 1).sy).toBe(2000);
  });

  it('bad sizes → empty', () => {
    expect(coverRectFocal(0, 10, 10, 10).sw).toBe(0);
  });
});

describe('route geometry', () => {
  it('km marks: whole kms along the trimmed line', () => {
    const marks = kmMarkFractions(5.2);
    expect(marks.map((m) => m.km)).toEqual([1, 2, 3, 4]); // km 5 is the trimmed end
    expect(marks[0].f).toBeCloseTo(800 / 4800, 3);
  });

  it('short runs have no marks; long runs thin them out', () => {
    expect(kmMarkFractions(0.9)).toEqual([]);
    expect(kmMarkFractions(0)).toEqual([]);
    expect(kmMarkFractions(21.1).map((m) => m.km)).toEqual([5, 10, 15, 20]);
    expect(kmMarkFractions(15).map((m) => m.km)).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('fits the shape centred, aspect kept', () => {
    const pts = fitRoutePoints([0, 0, 100, 0, 100, 50], 200, 200, 0);
    expect(pts[0]).toEqual([0, 50]);
    expect(pts[2]).toEqual([200, 150]);
    expect(fitRoutePoints([1, 2, 3], 10, 10)).toEqual([]);
  });

  it('pointAtFraction walks the polyline', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    expect(pointAtFraction(pts, 0.5)).toEqual([10, 0]);
    expect(pointAtFraction(pts, 0.75)).toEqual([10, 5]);
    expect(pointAtFraction([[0, 0]], 0.5)).toBeNull();
  });
});

const strength: ShareImageInput = {
  kind: 'strength',
  durationMinutes: 42,
  programName: 'פלג גוף עליון',
  levelIndex: 4,
  levelCount: 12,
  topExercises: [
    { name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' },
    { name: 'שכיבות סמיכה', sets: 4, setsDone: 3, value: 15, unit: 'reps' },
    { name: 'פלאנק', sets: 7, setsDone: 7, value: 30, unit: 'seconds' },
  ],
  moreExercises: 4,
  totalSets: 18,
  totalReps: 156,
  parkName: 'גינת מאיר',
  streakDays: 6,
  dateMs: new Date(2026, 9, 19, 6, 40).getTime(),
};

describe('model — strength', () => {
  const m = buildShareModel(strength);
  it('name, chip, level, date', () => {
    expect(m.name).toBe('פלג גוף עליון');
    expect(m.chip).toBe('אימון כוח · גינת מאיר');
    expect(m.level).toEqual({ index: 4, count: 12, frac: 4 / 12 });
    expect(m.dateLabel).toBe('יום ב׳ · 19.10');
  });

  it('stats: minutes · sets · reps · exercises; hero = reps', () => {
    expect(m.stats.map((s) => `${s.value} ${s.unit}`)).toEqual(['42 דקות', '18 סטים', '156 חזרות', '7 תרגילים']);
    expect(m.hero).toEqual({ value: '156', unit: 'חזרות' });
  });

  it('set boxes: value per done set, null for missed, max 5', () => {
    expect(setRows(strength)[1].boxes).toEqual(['15', '15', '15', null]);
    expect(setRows(strength)[2].boxes).toHaveLength(5);
    expect(m.moreLine).toBe('ועוד 4 תרגילים');
    expect(m.exerciseNames).toBe('מתח · שכיבות סמיכה · פלאנק · …');
  });

  it('missing facts drop out and the rest fill in', () => {
    const bare = buildShareModel({ kind: 'strength', durationMinutes: 2 });
    expect(bare.name).toBe('אימון כוח');
    expect(bare.stats).toEqual([{ value: '2', unit: 'דקות' }]);
    expect(bare.hero).toEqual({ value: '2', unit: 'דקות' });
    expect(bare.level).toBeUndefined();
    expect(bare.dateLabel).toBeUndefined();
  });
});

describe('model — run', () => {
  const run: ShareImageInput = {
    kind: 'cardio',
    durationMinutes: 30,
    durationSeconds: 1810,
    distanceKm: 5.2,
    paceSecPerKm: 348,
    paceSplits: [362, 355, 350, 340, 331],
    routeShape: [0, 0, 500, 500, 1000, 200],
    title: 'ריצת בוקר',
    parkName: 'פארק הירקון',
    dateMs: new Date(2026, 9, 19, 6, 40).getTime(),
  };
  const m = buildShareModel(run);
  it('distance hero, pace · time · fastest lap', () => {
    expect(m.hero).toEqual({ value: '5.2', unit: 'ק״מ' });
    expect(m.stats.map((s) => s.value)).toEqual(['5:48', '30:10', '5:31']);
    expect(m.chip).toBe('ריצת בוקר · פארק הירקון');
    expect(m.dateLabel).toBe('יום ב׳ · 06:40');
  });

  it('splits: fastest lap highlighted; km marks from the track', () => {
    expect(m.splits?.fastestIndex).toBe(4);
    expect(m.splits?.heights[4]).toBe(1);
    expect(m.kmMarks?.map((k) => k.km)).toEqual([1, 2, 3, 4]);
  });

  it('no GPS: duration is the hero, no route, no marks', () => {
    const t = buildShareModel({ kind: 'cardio', durationMinutes: 25 });
    expect(t.hero).toEqual({ value: '25', unit: 'דקות' });
    expect(t.route).toBeUndefined();
    expect(t.kmMarks).toBeUndefined();
  });
});

describe('formatting', () => {
  it('clock and duration', () => {
    expect(formatClock(1810)).toBe('30:10');
    expect(formatClock(3910)).toBe('1:05:10');
    expect(durationStat({ durationMinutes: 75 }, false)).toEqual({ value: '1:15', unit: 'שעות' });
    expect(durationStat({ durationMinutes: 30, durationSeconds: 1810 }, true)).toEqual({ value: '30:10', unit: 'זמן' });
  });

  it('date label', () => {
    expect(shareDateLabel(undefined, false)).toBeUndefined();
    expect(shareDateLabel(new Date(2026, 9, 25, 9, 5).getTime(), true)).toBe('יום א׳ · 09:05');
  });
});

describe('summary totals', () => {
  it('sums done sets / reps; main exercises counted', () => {
    const ex = (unit: 'reps' | 'seconds', done: (number | null)[], status: 'done' | 'skipped' = 'done') => ({
      name: 'x',
      unit,
      plannedSets: done.length,
      doneSets: done.filter((d) => d).length,
      sets: done.map((d) => ({ done: d, target: null })),
      status,
      improvedBy: null,
    });
    const t = shareTotalsFromPhases([
      { phase: 'warmup', blocks: [{ exercises: [ex('reps', [10])] }] },
      { phase: 'main', blocks: [{ exercises: [ex('reps', [8, 8, null]), ex('seconds', [30, 30]), ex('reps', [5], 'skipped')] }] },
    ]);
    expect(t).toEqual({ totalSets: 5, totalReps: 26, exerciseCount: 2 });
    expect(shareTotalsFromPhases(null)).toEqual({});
  });
});

describe('palette — text flips with the background', () => {
  it('photo / night → white, cyan → deep ink, clean → dark', () => {
    expect(paletteFor(toneFor('photo', 'cyan'), 'strength').fg).toBe('#ffffff');
    expect(paletteFor(toneFor('brand', 'night'), 'cardio').fg).toBe('#ffffff');
    expect(paletteFor(toneFor('brand', 'cyan'), 'strength').fg).toBe('#04222b');
    expect(paletteFor(toneFor('plain', 'navy'), 'strength').fg).toBe('#0e1419');
  });
});

describe('registry', () => {
  it('3 templates per activity, all in story + square', () => {
    expect(SHARE_TEMPLATES_V2.strength.map((t) => t.id)).toEqual(['strength-photo', 'strength-card', 'strength-minimal']);
    expect(SHARE_TEMPLATES_V2.cardio.map((t) => t.id)).toEqual(['run-photo-route', 'run-dark-route', 'run-minimal']);
    expect(templatesFor('cardio', 'square')).toHaveLength(3);
  });

  it('starts on the photo template only when there is a photo', () => {
    expect(defaultTemplateId('strength', true)).toBe('strength-photo');
    expect(defaultTemplateId('strength', false)).toBe('strength-card');
    expect(templateById('cardio', 'nope').id).toBe('run-photo-route');
  });

  it('frames: 390 design units, 9:16 / 1:1', () => {
    expect(frameFor('story').h).toBeCloseTo(693.33, 1);
    expect(frameFor('square').h).toBe(390);
  });
});

describe('shareInputFromPost — v2 extras', () => {
  it('carries splits, park, date; total sets only when no exercise was left out', () => {
    const i = shareInputFromPost({
      activityCategory: 'strength',
      durationMinutes: 20,
      topExercises: [{ name: 'מתח', sets: 3, setsDone: 3, unit: 'reps' }],
      parkName: ' גינת מאיר ',
      createdAt: new Date(2026, 9, 19),
    });
    expect(i.totalSets).toBe(3);
    expect(i.exerciseCount).toBe(1);
    expect(i.parkName).toBe('גינת מאיר');
    expect(i.dateMs).toBe(new Date(2026, 9, 19).getTime());
    const more = shareInputFromPost({ activityCategory: 'strength', durationMinutes: 20, topExercises: [{ name: 'מתח', sets: 3, setsDone: 3, unit: 'reps' }], moreExercises: 2 });
    expect(more.totalSets).toBeUndefined();
    expect(more.exerciseCount).toBe(3);
  });
});
