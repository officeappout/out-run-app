import { describe, expect, it } from 'vitest';
import { highlightParts, scoreFields, scoreText } from '../core/text';
import { categoryCounts, groupHits, previewOf } from '../core/grouping';
import { editDistance, nearMatches } from '../core/fuzzy';
import { addRecent, removeRecent, MAX_RECENTS } from '../core/recents';
import { countEventsThisWeek, situationSuggestions } from '../core/situations';
import { categoryFromParams, queryFromParams, searchHref } from '../core/url-state';
import type { SearchHit } from '../core/types';

const params = (q: string) => new URLSearchParams(q);

describe('scoreText', () => {
  it('ranks exact > starts with > word starts with > contains > all words', () => {
    expect(scoreText('בטן', 'בטן')).toBe(100);
    expect(scoreText('בטן תחתונה', 'בטן')).toBe(80);
    expect(scoreText('הרמות ברכיים', 'ברכ')).toBe(60);
    expect(scoreText('פלאנקבטן', 'בטן')).toBe(40);
    expect(scoreText('מתח רחב בגינה', 'רחב מתח')).toBe(30);
    expect(scoreText('סקוואט', 'בטן')).toBe(0);
  });
  it('tolerates Hebrew prefixes and niqqud / geresh', () => {
    expect(scoreText('בגינת הכרמל', 'גינת')).toBe(60);
    expect(scoreText('פסודו פלאנץ׳', 'פלאנץ')).toBeGreaterThan(0);
  });
  it('is empty-safe', () => {
    expect(scoreText('', 'x')).toBe(0);
    expect(scoreText('abc', '')).toBe(0);
  });
  it('scoreFields takes the best weighted field', () => {
    expect(scoreFields([['סקוואט', 1], ['רגליים בטן', 0.5]], 'בטן')).toBe(30);
  });
});

describe('highlightParts', () => {
  it('bolds the typed text inside the original string', () => {
    expect(highlightParts('גינת כושר פארק הירקון', 'הירקון')).toEqual([
      { text: 'גינת כושר פארק ', match: false },
      { text: 'הירקון', match: true },
    ]);
  });
  it('falls back to the longest query word', () => {
    expect(highlightParts('טבעת הירקון', 'הירקון צפון').some((p) => p.match && p.text === 'הירקון')).toBe(true);
  });
  it('no match → a single plain part', () => {
    expect(highlightParts('סקוואט', 'בטן')).toEqual([{ text: 'סקוואט', match: false }]);
  });
});

const hit = (kind: SearchHit['kind'], id: string, score: number): SearchHit =>
  ({ kind, key: `${kind}:${id}`, title: id, score } as unknown as SearchHit);

describe('grouping', () => {
  const hits = [
    hit('exercise', 'a', 80), hit('exercise', 'b', 60), hit('exercise', 'c', 40),
    hit('article', 'x', 100),
    hit('faq', 'q1', 30), hit('help', 'h1', 50),
    hit('person', 'p', 30), hit('group', 'g', 60),
    hit('park', 'zero', 0),
  ];
  const groups = groupHits(hits);
  it('groups by chip, best group first, members by score; 0-score hits dropped', () => {
    expect(groups.map((g) => g.category)).toEqual(['articles', 'exercises', 'social', 'help']);
    expect(groups.find((g) => g.category === 'help')!.hits.map((h) => h.title)).toEqual(['h1', 'q1']);
    expect(groups.find((g) => g.category === 'social')!.total).toBe(2);
  });
  it('counts per chip and "all"', () => {
    const c = categoryCounts(groups);
    expect(c).toMatchObject({ all: 8, exercises: 3, articles: 1, social: 2, help: 2, parks: 0 });
  });
  it('preview shows 2–3 per type + the rest as "לכל N"', () => {
    const ex = previewOf(groups.find((g) => g.category === 'exercises')!);
    expect(ex.shown).toHaveLength(2);
    expect(ex.more).toBe(1);
    expect(previewOf(groups.find((g) => g.category === 'help')!).more).toBe(0);
  });
});

describe('nearMatches ("אולי חיפשת")', () => {
  const names = ['פרונט ליבר', 'פרונט ליבר טאק', 'תרגילים עם גומייה', 'סקוואט', 'מתח רחב'];
  it('finds the closest names for a long query that matched nothing', () => {
    const out = nearMatches('פרונט ליבר עם גומיות', names);
    expect(out[0]).toBe('פרונט ליבר');
    expect(out).toContain('פרונט ליבר טאק');
    expect(out).not.toContain('סקוואט');
  });
  it('catches a typo', () => {
    expect(nearMatches('סקוואת', names)).toContain('סקוואט');
  });
  it('editDistance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'ab')).toBe(2);
  });
});

describe('recents', () => {
  it('newest first, deduped, capped, ignores 1-letter queries', () => {
    let l: string[] = [];
    l = addRecent(l, 'בטן');
    l = addRecent(l, 'גינת הכרמל');
    l = addRecent(l, ' בטן ');
    l = addRecent(l, 'x');
    expect(l).toEqual(['בטן', 'גינת הכרמל']);
    for (let i = 0; i < 20; i++) l = addRecent(l, `חיפוש ${i}`);
    expect(l).toHaveLength(MAX_RECENTS);
    expect(removeRecent(['בטן', 'מתח'], 'בטן')).toEqual(['מתח']);
  });
});

describe('situations', () => {
  it('parks nearby + morning abs + help + events this week', () => {
    const s = situationSuggestions({ hour: 9, parksWithin1Km: 3, eventsThisWeek: 2, groupsNearby: 0 });
    expect(s.map((x) => x.id)).toEqual(['park', 'abs', 'help', 'events']);
    expect(s[0].n).toBe(3); // the sub line is search.situation.park.sub (library-he.test.ts)
    expect(s[1].action).toEqual({ type: 'muscle', muscle: 'abs' });
  });
  it('evening → a run; no events → groups; never more than 4', () => {
    const s = situationSuggestions({ hour: 19, parksWithin1Km: 0, eventsThisWeek: 0, groupsNearby: 5 });
    expect(s.map((x) => x.id)).toEqual(['parks', 'run', 'help', 'groups']);
  });
  it('countEventsThisWeek', () => {
    const now = new Date('2026-10-19T10:00:00Z');
    expect(countEventsThisWeek([new Date('2026-10-21'), '2026-11-30', null, new Date('2026-10-01')], now)).toBe(1);
  });
});

describe('url state', () => {
  it('reads ?cat, maps today\'s ?tab links, defaults to all', () => {
    expect(categoryFromParams(params('cat=help'))).toBe('help');
    expect(categoryFromParams(params('tab=groups'))).toBe('social');
    expect(categoryFromParams(params('tab=people'))).toBe('social');
    expect(categoryFromParams(params('tab=exercises'))).toBe('exercises');
    expect(categoryFromParams(params('cat=nope'))).toBe('all');
    expect(queryFromParams(params('q=%D7%94%D7%99%D7%A8%D7%A7%D7%95%D7%9F'))).toBe('הירקון');
  });
  it('searchHref', () => {
    expect(searchHref(' הירקון ')).toBe(`/search?q=${encodeURIComponent('הירקון')}`);
    expect(searchHref('', 'events')).toBe('/search?cat=events');
    expect(searchHref('')).toBe('/search');
  });
});
