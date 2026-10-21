import { describe, expect, it, vi } from 'vitest';

// Providers import their data services; the ranking under test is pure, so stub the I/O.
vi.mock('@/features/content/exercises/core/exercise.service', () => ({ getAllExercisesCached: async () => [] }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ getCachedOfficialRoutes: async () => [] }));
vi.mock('@/features/social/services/user-search.service', () => ({ searchUsersByName: async () => [] }));
vi.mock('@/lib/app-help/loader', () => ({ loadHelpEntries: async () => [] }));
vi.mock('@/lib/content-items/client', () => ({ fetchPublishedContent: async () => [] }));

import { muscleForQuery, rankExercises } from '../providers/exercises';
import { countParksWithin, nearestParks, rankParks, rankRoutes } from '../providers/places';
import { groupScheduleLabel, rankEvents, rankGroups, upcomingEvents } from '../providers/community';
import { peopleToHits } from '../providers/people';
import { rankArticles, rankQa, splitContent } from '../providers/content';

const ex = (id: string, he: string, primaryMuscle?: string) => ({ id, name: { he, en: '' }, primaryMuscle }) as never;
const park = (id: string, name: string, lat: number, lng: number, extra: Record<string, unknown> = {}) =>
  ({ id, name, city: 'תל אביב', location: { lat, lng }, ...extra }) as never;
const HOME = { lat: 32.08, lng: 34.78 };

describe('exercises provider', () => {
  it('maps a muscle word to the muscle', () => {
    expect(muscleForQuery('בטן')).toBe('abs');
    expect(muscleForQuery('Chest')).toBe('chest');
    expect(muscleForQuery('גינה')).toBeNull();
  });
  it('name matches first, then the muscle; nothing unrelated', () => {
    const list = [ex('1', 'פלאנק בתנועה', 'abs'), ex('2', 'כפיפות בטן', 'abs'), ex('3', 'סקוואט', 'legs'), ex('4', 'הרמות ברכיים בתלייה', 'abs')];
    const out = rankExercises(list, 'בטן');
    expect(out.map((h) => h.exercise.id)).toEqual(['2', '1', '4']);
    expect(out[0].score).toBeGreaterThan(out[1].score);
    expect(out[0].subtitle).toBe('בטן');
  });
});

describe('places providers', () => {
  const parks = [
    park('far', 'גינת הירקון צפון', 32.2, 34.9),
    park('near', 'גינת כושר פארק הירקון', 32.081, 34.781, { isPrimaryFitness: true }),
    park('fountain', 'ברזייה הירקון', 32.0801, 34.7801, { isMinor: true }),
    park('other', 'גינת הכרמל', 32.07, 34.77),
  ];
  it('matches by name, skips minor spots, nearer wins a tie', () => {
    const out = rankParks(parks, 'הירקון', HOME);
    expect(out.map((h) => h.id)).toEqual(['near', 'far']);
    expect(out[0].distanceKm).toBeLessThan(1);
  });
  it('nearest + count within 1 km', () => {
    expect(nearestParks(parks, HOME, 2).map((h) => h.id)).toEqual(['near', 'other']);
    expect(countParksWithin(parks, HOME, 1)).toBe(1);
  });
  it('routes: name / city match, city subtitle + length (PlaceRow joins them)', () => {
    const routes = [{ id: 'r1', name: 'טבעת הירקון', city: 'תל אביב', distance: 7.4, path: [[34.79, 32.09]] }, { id: 'r2', name: 'סיבוב פלורנטין', path: [] }] as never;
    const out = rankRoutes(routes, 'הירקון', HOME);
    expect(out).toHaveLength(1);
    expect(out[0].subtitle).toBe('תל אביב');
    expect(out[0].lengthKm).toBe(7.4);
  });
});

describe('community providers', () => {
  const g = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: '', category: 'running', ...extra }) as never;
  it('groups: dedupes my groups + city groups, ranks by name then address', () => {
    const out = rankGroups([g('a', 'רצי פלורנטין'), g('b', 'כוח בגינה', { meetingLocation: { address: 'פלורנטין' } }), g('a', 'רצי פלורנטין')], 'פלורנטין', null);
    expect(out.map((h) => h.group.id)).toEqual(['a', 'b']);
  });
  it('schedule label', () => {
    expect(groupScheduleLabel({ scheduleSlots: [{ dayOfWeek: 2, time: '19:30' }, { dayOfWeek: 4, time: '19:30' }] } as never)).toBe('ג׳ ו־ה׳ · 19:30');
    expect(groupScheduleLabel({} as never)).toBeNull();
  });
  it('events: inactive + past dropped, upcoming sorted', () => {
    const now = new Date('2026-10-19T10:00:00Z').getTime();
    const ev = (id: string, name: string, date: string, isActive = true, category = 'race') => ({ id, name, description: '', category, date: new Date(date), isActive, location: { address: 'נמל' } }) as never;
    const list = [ev('1', 'מרוץ הלילה', '2026-10-24'), ev('2', 'מרוץ ישן', '2026-01-01'), ev('3', 'מרוץ בוטל', '2026-10-22', false), ev('4', 'סדנה', '2026-10-20', true, 'workshop')];
    expect(rankEvents(list, 'מרוץ', null, now).map((h) => h.event.id)).toEqual(['1']);
    expect(rankEvents(list, 'סדנ', null, now).map((h) => h.event.id)).toEqual(['4']);
    expect(upcomingEvents(list, now).map((e) => e.id)).toEqual(['4', '1']);
  });
});

describe('people + content providers', () => {
  it('people keep the service order and never score 0', () => {
    const out = peopleToHits([{ uid: 'u1', name: 'נועה לוי' }, { uid: 'u2', name: 'איתי' }], 'נועה');
    expect(out[0].score).toBeGreaterThan(out[1].score);
    expect(out[1].score).toBeGreaterThan(0);
  });
  it('articles: title > excerpt > body; QA: question > tags > answer', () => {
    const art = (id: string, title: string, excerpt: string, body = 'x') =>
      ({ id, type: 'article', title, excerpt, tags: [], body: [{ type: 'p', text: body }], category: 'strength', cover: { illustration: 'map' }, readMin: 3, date: '2026-10-01' }) as never;
    const out = rankArticles([art('1', 'מתחילים קליסטניקס', 'בטן חזקה'), art('2', 'בטן חזקה בלי כפיפות', '...'), art('3', 'ריצה', '...', 'גם בטן')], 'בטן');
    expect(out.map((h) => h.article.id)).toEqual(['2', '1', '3']);
    const qa = rankQa([{ id: 'a', q: 'איך מזיזים אימון?', a: ['בלו״ז'], tags: ['לו״ז'], topic: 'schedule' }, { id: 'b', q: 'מה זה OUT?', a: ['...'], tags: [], topic: 'x' }], 'לו״ז', 'help');
    expect(qa.map((h) => h.id)).toEqual(['a']);
    expect(qa[0].kind).toBe('help');
  });
  it('splitContent: articles newest first, only the users FAQ', () => {
    const items = [
      { id: 'a1', type: 'article', date: '2026-10-01', title: 'א' },
      { id: 'a2', type: 'article', date: '2026-10-14', title: 'ב' },
      { id: 'f1', type: 'faq', audience: 'users', q: 'q', a: ['a'], tags: [], topic: 'users' },
      { id: 'f2', type: 'faq', audience: 'authorities', q: 'q2', a: ['a'], tags: [], topic: 'authorities' },
    ] as never;
    const s = splitContent(items);
    expect(s.articles.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(s.faq.map((f) => f.id)).toEqual(['f1']);
  });
});
