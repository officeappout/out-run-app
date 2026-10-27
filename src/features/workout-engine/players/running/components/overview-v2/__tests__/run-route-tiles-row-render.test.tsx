/**
 * RP-14 route tiles row (enable_run_drawer_from_me_v1) — static-markup render (node env).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = { profile: { core: { gender: 'male' } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});

import RunRouteTilesRow from '../RunRouteTilesRow';
import { buildRouteTiles } from '../../../utils/run-overview/run-route-tiles';
import type { RouteSuggestion } from '../../../lib/route-fit/suggest-routes-for-workout';
import { ORIGIN, makeRoute, squareLoop } from '../../../lib/route-fit/__tests__/fixtures';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });

function sugg(id: string, name: string, generated: boolean, score: number, reasons: string[], laps = 1, offsetM = 0): RouteSuggestion {
  return {
    route: makeRoute({ id, name, distance: 4, path: squareLoop(4000, offsetM) }),
    isGenerated: generated,
    score: {
      routeId: id, score, climb: null, cautions: [], reasons,
      fit: { verdict: laps > 1 ? 'laps' : 'fits', laps, endsAtStart: true, turnaroundKm: null, score: 1, reason: null, caution: null },
    },
  };
}

const tiles = buildRouteTiles([
  sugg('a', 'לולאה מכאן', true, 80, ['מישורי']),
  sugg('b', '', true, 70, ['מוצל']),
  sugg('off', 'לולאת הירקון', false, 90, ['2 סיבובים'], 2, 600),
], ORIGIN);

describe('RunRouteTilesRow', () => {
  it('renders the loops, the official tile and the selected laps note', () => {
    const html = renderToStaticMarkup(<RunRouteTilesRow tiles={tiles} selectedId="a" onSelect={() => {}} onAnother={() => {}} />);
    expect(html).toContain('מסלולים מהמיקום שלך, לפי האימון');
    expect(html).toContain('מישורי · חוזרת לכאן');
    expect(html).toContain('לולאה מכאן'); // the unnamed loop's fallback too
    expect(html).toContain('רשמי · 2 סיבובים');
    expect(html).toContain('600 מ׳ ממך');
    expect(html).toContain('סיבוב אחד = כל האימון · ~4.0 ק״מ');
    expect(html).toContain('הצעה אחרת');
    expect(html.split('aria-pressed="true"').length - 1).toBe(1);
    expect(html).not.toContain('dir="ltr"');
  });

  it('the official tile selected → its laps; no tiles → nothing', () => {
    const html = renderToStaticMarkup(<RunRouteTilesRow tiles={tiles} selectedId="off" onSelect={() => {}} />);
    expect(html).toContain('2 סיבובים = כל האימון · ~8.0 ק״מ');
    expect(html).not.toContain('הצעה אחרת');
    expect(renderToStaticMarkup(<RunRouteTilesRow tiles={[]} selectedId={null} onSelect={() => {}} />)).toBe('');
  });
});
