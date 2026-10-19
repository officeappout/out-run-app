/**
 * Static-markup render checks for the live-player primitives (cart ring,
 * per-colour story bars) and the summary's per-rep table.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartProgressIcon, RepPaceTable, StoryBars } from '../index';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('CartProgressIcon', () => {
  const items = Array.from({ length: 13 }, (_, i) => ({ color: i % 2 ? '#e5484d' : '#a9b7c2', done: i < 5 }));
  it('one arc per item + the done badge + an accessible name', () => {
    const out = html(<CartProgressIcon items={items} />);
    expect(out.match(/stroke-opacity=/g)).toHaveLength(13);
    expect(out).toContain('aria-label="רשימת האימון · 5 הושלמו"');
    expect(out).toContain('>5</span>');
  });
  it('no badge before anything is done', () => {
    const out = html(<CartProgressIcon items={items.map((i) => ({ ...i, done: false }))} />);
    expect(out).not.toContain('bg-v2-ink');
  });
});

describe('StoryBars', () => {
  it('done bars solid in their own colour, the current bar wider and partially filled', () => {
    const out = html(
      <StoryBars segments={[{ key: 'a', color: '#bfe48a' }, { key: 'b', color: '#e5484d' }, { key: 'c', color: '#a9b7c2' }]} currentIndex={1} progress={0.47} />,
    );
    expect(out).toContain('background:#bfe48a');
    expect(out).toContain('flex:3');
    expect(out).toContain('width:47%');
    expect(out).not.toContain('background:#a9b7c2');
  });
});

describe('RepPaceTable', () => {
  it('rows, chip and chart bars', () => {
    const out = html(
      <RepPaceTable
        summaryLabel="1 מתוך 2 חזרות בטווח"
        band={{ min: 285, max: 295 }}
        rows={[
          { key: '1', n: 1, title: '1:55', sub: 'יעד 4:45–4:55', status: 'בטווח', tone: 'in', value: '4:48', paceSec: 288, paceLabel: '4:48' },
          { key: '2', n: 2, title: '1:59', status: 'איטי ב-3 שנ׳', tone: 'off', value: '4:58', paceSec: 298, paceLabel: '4:58' },
        ]}
      />,
    );
    expect(out).toContain('1 מתוך 2 חזרות בטווח');
    expect(out).toContain('איטי ב-3 שנ׳');
    expect(out).toContain('יעד 4:45–4:55');
    expect(out).toContain('border-dashed');
  });
  it('renders nothing without rows', () => {
    expect(html(<RepPaceTable rows={[]} />)).toBe('');
  });
  it("chart variant: no rows list, legend, the 'best' bar in blue", () => {
    const rows = [
      { key: '1', n: 1, title: '6:24', tone: 'in' as const, value: '6:24', paceSec: 384, paceLabel: '6:24' },
      { key: '2', n: 2, title: '6:02', status: 'הכי מהיר', tone: 'best' as const, value: '6:02', paceSec: 362, paceLabel: '6:02' },
    ];
    const out = html(<RepPaceTable variant="chart" title="קצב לכל ק״מ" legend="כחול = הכי מהיר" barColor="#84cc16" rows={rows} />);
    expect(out).toContain('קצב לכל ק״מ');
    expect(out).toContain('כחול = הכי מהיר');
    expect(out).toContain('background:#0284c7');
    expect(out).not.toContain('הכי מהיר</span>');
    expect(out).not.toContain('divide-y');
  });
});
