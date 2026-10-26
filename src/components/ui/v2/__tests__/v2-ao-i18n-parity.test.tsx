/**
 * i18n wave 2 batch ao (namespace `common`, keys `ui.v2.*`): v2 primitives StreakDotsStrip, ExerciseSetsTable,
 * ProgramProgressRing, RecommendationCard, RepPaceTable.
 *
 * Snapshots recorded BEFORE the extraction; the extracted components must render the same Hebrew markup.
 * Static markup (react-dom/server, node env); `<!-- -->` is stripped before comparing (react-dom/server's separator
 * between adjacent text nodes; not rendered text).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import StreakDotsStrip from '../StreakDotsStrip';
import ExerciseSetsTable, { SetsLegend } from '../ExerciseSetsTable';
import ProgramProgressRing from '../ProgramProgressRing';
import RecommendationCard from '../RecommendationCard';
import RepPaceTable from '../RepPaceTable';
import type { WeekDot } from '../summary';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/v2-ao-i18n/${name}.html`;

const LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const days: WeekDot[] = LABELS.map((label, i) => ({
  date: `2026-10-${18 + i}`,
  label,
  state: i < 3 ? 'done' : i === 3 ? 'rest' : 'future',
  isToday: i === 3,
  chainToNext: i < 2,
}));

describe('StreakDotsStrip', () => {
  it('streak + best + bars', async () => {
    await expect(
      html(<StreakDotsStrip streak={4} best={9} days={days} bars={[{ label: 'אימונים', value: 3, max: 4 }, { label: 'דקות', value: 45 }]} />),
    ).toMatchFileSnapshot(snap('streak-full'));
  });
  it('no best, no days', async () => {
    await expect(html(<StreakDotsStrip streak={1} days={[]} />)).toMatchFileSnapshot(snap('streak-min'));
  });
});

describe('ExerciseSetsTable', () => {
  const rows = [
    { key: 'a', name: 'משיכות', subtitle: 'יעד 8 חזרות', tiles: [{ value: '8', tone: 'in' as const }, { value: '6', tone: 'below' as const }, { value: '–', tone: 'missed' as const }] },
    { key: 'b', name: 'מקבילים', subtitle: 'לא בוצע', tiles: [], muted: true },
  ];
  it('with title and legend', async () => {
    await expect(html(<ExerciseSetsTable title="סופרסט 1" rows={rows} />)).toMatchFileSnapshot(snap('sets-title'));
  });
  it('legend only, hidden legend, empty', async () => {
    await expect(html(<ExerciseSetsTable rows={rows} />)).toMatchFileSnapshot(snap('sets-legend'));
    await expect(html(<ExerciseSetsTable rows={rows} hideLegend />)).toMatchFileSnapshot(snap('sets-nolegend'));
    await expect(html(<SetsLegend tones={['in', 'below', 'missed']} />)).toMatchFileSnapshot(snap('sets-legend-all'));
  });
});

describe('ProgramProgressRing', () => {
  const ring = { percent: 40, basePercent: 30, gainPercent: 10 };
  it('one program (with gain) and two programs (no gain)', async () => {
    await expect(
      html(<ProgramProgressRing items={[{ key: 'p', name: 'כוח', levelLabel: 'רמה 5/25', nextLabel: 'עוד 60% לרמה 6', ring, gain: 10 }]} />),
    ).toMatchFileSnapshot(snap('ring-one'));
    const flat = { percent: 40, basePercent: 40, gainPercent: 0 };
    await expect(
      html(
        <ProgramProgressRing
          items={[
            { key: 'p', name: 'כוח', levelLabel: 'רמה 5/25', ring: flat, gain: 0 },
            { key: 'q', name: 'ריצה', levelLabel: 'רמה 2/10', ring: flat, gain: 0 },
          ]}
        />,
      ),
    ).toMatchFileSnapshot(snap('ring-two'));
  });
});

describe('RecommendationCard', () => {
  it('default and custom eyebrow', async () => {
    await expect(html(<RecommendationCard title="3 ימים בשבוע" detail="רמה 4" aside="אפשר לשנות" notes={['+ ליבה']} />)).toMatchFileSnapshot(snap('reco-default'));
    await expect(html(<RecommendationCard title="כותרת" eyebrow="אחר" />)).toMatchFileSnapshot(snap('reco-eyebrow'));
  });
});

describe('RepPaceTable', () => {
  const rows = [
    { key: '1', n: 1, title: '1:55', sub: 'יעד 4:45–4:55', status: 'בטווח', tone: 'in' as const, value: '4:48', paceSec: 288, paceLabel: '4:48' },
    { key: '2', n: 2, title: '1:58', tone: 'off' as const, value: '4:55', paceSec: 295, paceLabel: '4:55' },
  ];
  it('default title, custom title, chart variant', async () => {
    await expect(html(<RepPaceTable rows={rows} summaryLabel="1 מתוך 2 חזרות בטווח" />)).toMatchFileSnapshot(snap('pace-default'));
    await expect(html(<RepPaceTable rows={rows} title="אחר" variant="chart" legend="מקרא" />)).toMatchFileSnapshot(snap('pace-chart'));
  });
});
