/**
 * <WeekBuilder> static render: day rows (sessions / "מנוחה" / "לא פנוי"), the "why" line,
 * "1 מתוך 2" on a double day, the drag handles (none on a locked session), tabs only for
 * two tracks, and one CTA.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

import WeekBuilder from '../components/WeekBuilder';
import { createWeekEngine } from '../moveSession';
import { explainWeek } from '../explain';
import { OPEN_SUN_FRI, run, strength, week } from './fixtures';

const RULES = { maxPerDay: 2 as const, runLevel: 'intermediate' as const };
const DATES = [25, 26, 27, 28, 29, 30, 31];

function render(w: ReturnType<typeof week>) {
  return renderToStaticMarkup(
    <WeekBuilder title="השבוע שלך" subtitle="כוח וריצה" week={w} engine={createWeekEngine(RULES)} onChange={() => {}} dates={DATES} onConfirm={() => {}} />,
  );
}

describe('WeekBuilder render', () => {
  it('two tracks: tabs, a double day "1 מתוך 2", why lines, rest and closed days', () => {
    const w = explainWeek(
      week(OPEN_SUN_FRI, [
        [0, run('q', 'quality_primary')],
        [0, strength('l', 'legs')],
        [1, strength('p', 'push')],
        [4, run('long', 'long_run')],
      ]),
      { preferredLongRunDay: null },
    );
    const html = render(w);
    expect(html).toContain('משולב');
    expect(html).toContain('1 מתוך 2');
    expect(html).toContain('2 מתוך 2');
    expect(html).toContain('מנוחה');
    expect(html).toContain('לא פנוי');
    expect(html).toContain('הריצה הארוכה');
    expect(html).toContain('אישור השבוע');
    expect(html.match(/גרירת /g)?.length).toBe(4);
  });

  it('one track: no tabs; a locked session has no drag handle', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'full_body')], [2, { ...strength('b', 'full_body'), locked: true }]]);
    const html = render(w);
    expect(html).not.toContain('משולב');
    expect(html.match(/גרירת /g)?.length).toBe(1);
  });
});
