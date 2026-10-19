/** Static-markup checks for the v2 run-type summary blocks (lives here: the only .tsx test glob). */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RunTypeOverview from '@/features/workout-engine/summary/components/run-type/RunTypeOverview';
import RunTypeSegments from '@/features/workout-engine/summary/components/run-type/RunTypeSegments';
import { runTypeModel } from '@/features/workout-engine/summary/run-type/run-type.mapping';
import { repTableModel } from '@/features/workout-engine/summary/v2-summary.mapping';
import type { PlannedBlockRecord } from '@/features/workout-engine/core/services/storage.service';

const rep = (n: number, pace: number, inRange: boolean): PlannedBlockRecord => ({
  blockIndex: n * 2,
  rep: n,
  label: 'Rep',
  plannedDistanceMeters: 400,
  distanceMeters: 400,
  durationSeconds: 116,
  targetMinPaceSec: 285,
  targetMaxPaceSec: 295,
  avgPaceSec: pace,
  inRange,
  paceDeltaSec: inRange ? 0 : 3,
});

const intervals = {
  distance: 6.5,
  duration: 2538,
  pace: 6.5,
  blockResults: [rep(1, 288, true), rep(2, 298, false), rep(3, 291, true)],
  runMeta: { category: 'short_intervals', plannedReps: 3, warmup: { durationSeconds: 600, distanceMeters: 1600 } },
};

const easy = {
  distance: 2.5,
  duration: 950,
  pace: 6.3,
  runMeta: {
    category: 'easy_run',
    zones: [{ minPaceSec: 380, maxPaceSec: 410 }],
    plan: { week: 1, day: 1 },
    kmSplits: [{ km: 1, sec: 384 }, { km: 2, sec: 372 }, { km: 2.5, sec: 194 }],
  },
};

const schedule = [
  { week: 1, day: 1, workoutId: 'a', status: 'pending' as const, category: 'easy_run' as const },
  { week: 1, day: 2, workoutId: 'b', status: 'pending' as const, category: 'short_intervals' as const },
];

const noop = () => {};

describe('RunTypeOverview', () => {
  it('intervals: rings, the per-rep row and the course rail; no XP', () => {
    const out = renderToStaticMarkup(
      <RunTypeOverview model={runTypeModel(intervals)} activityType="running" repTable={repTableModel(intervals.blockResults)} lapCount={0} onOpenSegments={noop} />,
    );
    expect(out).toContain('3/3');
    expect(out).toContain('קצב בכל חזרה');
    expect(out).toContain('2/3 בטווח');
    expect(out).toContain('מהלך האימון');
    expect(out).toContain('חימום · 10 דק׳ · 1.6 ק״מ');
    expect(out).not.toContain('XP');
  });
  it('easy: program ring + next, km chart with the band', () => {
    const out = renderToStaticMarkup(
      <RunTypeOverview
        model={runTypeModel(easy, { program: { schedule }, programName: 'תוכנית 5 ק״מ' })}
        activityType="running"
        repTable={null}
        lapCount={0}
        onOpenSegments={noop}
      />,
    );
    expect(out).toContain('התקדמות בתוכניות שלי');
    expect(out).toContain('שבוע 1/1');
    expect(out).toContain('הבא: אינטרוולים קצרים');
    expect(out).toContain('קצב לכל ק״מ');
    expect(out).toContain('הכי מהיר: ק״מ 2');
    expect(out).toContain('טווח 6:20–6:50');
  });
});

describe('RunTypeSegments', () => {
  it('easy: per-km splits table', () => {
    const out = renderToStaticMarkup(<RunTypeSegments model={runTypeModel(easy)} repTable={null} />);
    expect(out).toContain('פיצולים לפי ק״מ');
    expect(out).toContain('(חלקי)');
  });
  it('nothing to add ⇒ empty', () => {
    expect(renderToStaticMarkup(<RunTypeSegments model={runTypeModel({ distance: 3, duration: 900, pace: 5 })} repTable={null} />)).toBe('');
  });
});
