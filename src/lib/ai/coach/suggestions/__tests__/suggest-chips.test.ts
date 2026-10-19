/**
 * Kelly phase 2 — context-aware quick replies: one case per situation, the follow-ups after
 * each kind of answer, gendered copy, the caps and the dedupe rules.
 */
import { describe, it, expect } from 'vitest';
import { suggestChips } from '../suggest-chips';
import { placeholderHints } from '../placeholders';
import { lastTurnFrom, situationFromProfile, situationFromSheet } from '../situation';
import { parseStoredSuggestions } from '../stored';
import { MAX_SUGGESTIONS, type ChipSituation } from '../types';
import { OWNER_SHEET } from '../../__tests__/owner-sheet.fixture';

const base: ChipSituation = {
  gender: 'male',
  hour: 10,
  trainingDayToday: true,
  buildableToday: true,
  doneToday: false,
  daysAway: 1,
  newUser: false,
  gapName: null,
  weather: null,
};
const ids = (s: ChipSituation, last = { kind: 'opening' } as Parameters<typeof suggestChips>[1], opts = {}) =>
  suggestChips(s, last, opts).map((c) => c.id);
const labels = (s: ChipSituation, last = { kind: 'opening' } as Parameters<typeof suggestChips>[1]) => suggestChips(s, last).map((c) => c.label);

describe('suggestChips — first open, by situation', () => {
  it('training day morning: build today first', () => {
    expect(ids(base)[0]).toBe('build_today');
  });
  it('training day evening: build today + the tired/skip question', () => {
    expect(ids({ ...base, hour: 20 })).toEqual(['build_today', 'tired_skip', 'quick_15']);
  });
  it('late night: tomorrow first, no "build now"', () => {
    const r = ids({ ...base, hour: 23 });
    expect(r[0]).toBe('tomorrow');
    expect(r).not.toContain('build_today');
  });
  it('rest day: a short home workout and the week', () => {
    expect(ids({ ...base, trainingDayToday: false, buildableToday: false })).toEqual(['short_home', 'week', 'progress']);
  });
  it('already trained today: progress and tomorrow, never "build today"', () => {
    const r = ids({ ...base, doneToday: true, daysAway: 0 });
    expect(r).toEqual(['progress', 'tomorrow', 'week']);
  });
  it('back after a break (calm return): a light way back, no guilt', () => {
    const r = labels({ ...base, daysAway: 9 });
    expect(r[0]).toBe('תבנה לי אימון חזרה קל');
    expect(r.join(' ')).not.toMatch(/פספס|החמצ|לא התאמנת/);
  });
  it('new user: a first short workout and how the app works', () => {
    expect(ids({ ...base, newUser: true, daysAway: null })).toEqual(['first_workout', 'how_app_works', 'week']);
  });
  it('a level gap adds the level-check question', () => {
    expect(labels({ ...base, trainingDayToday: false, buildableToday: false, gapName: 'ליבה' })).toContain('מה זה בדיקת רמה בליבה?');
  });
  it('weather: rain → a home workout chip', () => {
    expect(ids({ ...base, weather: 'rain' })).toContain('weather_rain');
    expect(ids({ ...base, buildableToday: false, weather: 'heat' })[0]).toBe('weather_heat');
  });
});

describe('suggestChips — gendered copy', () => {
  it('male / female / unknown self-references, no slashes', () => {
    const p = (g: ChipSituation['gender']) => suggestChips({ ...base, gender: g, doneToday: true }, { kind: 'opening' })[0].label;
    expect(p('male')).toBe('איך אני מתקדם?');
    expect(p('female')).toBe('איך אני מתקדמת?');
    expect(p('other')).toBe('איך ההתקדמות שלי?');
    const tired = (g: ChipSituation['gender']) => suggestChips({ ...base, gender: g, hour: 20 }, { kind: 'opening' }).find((c) => c.id === 'tired_skip')!.label;
    expect(tired('female')).toContain('עייפה');
    expect(tired('male')).toContain('עייף,');
    expect(tired('other')).not.toMatch(/עייפ/);
    for (const g of ['male', 'female', 'other'] as const) {
      for (const c of suggestChips({ ...base, gender: g, hour: 20, gapName: 'ליבה' }, { kind: 'opening' })) expect(c.label).not.toContain('/');
    }
  });
});

describe('suggestChips — follow-ups after an answer', () => {
  it('after a built workout: start (opens the card), shorter, no bar', () => {
    const r = suggestChips(base, { kind: 'workout', location: 'park', minutes: 25, domains: [] });
    expect(r.map((c) => c.id)).toEqual(['start', 'shorter', 'no_bar']);
    expect(r[0].openCard).toBe(true);
    expect(r[1].message).toBe('תבנה אותו קצר יותר');
  });
  it('a short home core workout: no "shorter", "easier" instead of "no bar"', () => {
    expect(ids(base, { kind: 'workout', location: 'home', minutes: 10, domains: ['core'] })).toEqual(['start', 'easier']);
  });
  it('after a schedule answer: build today, move a day, tomorrow', () => {
    expect(ids(base, { kind: 'schedule' })).toEqual(['build_today', 'move_day', 'tomorrow']);
  });
  it('never repeats an action chip already under the reply', () => {
    expect(ids(base, { kind: 'schedule' }, { actions: ['open_schedule', 'build_today'] })).toEqual(['move_day', 'tomorrow']);
  });
  it('after progress: the week and the level gap', () => {
    expect(ids({ ...base, gapName: 'משיכה' }, { kind: 'progress' })).toEqual(['week', 'level_check', 'build_today']);
  });
  it('after app help: talk to the team', () => {
    const r = suggestChips(base, { kind: 'app_help' });
    expect(r[0]).toMatchObject({ id: 'team', message: 'אני רוצה לדבר עם מישהו מהצוות' });
  });
  it('no chips after safety, a handoff or a schedule proposal', () => {
    for (const kind of ['safety', 'handoff', 'proposal'] as const) expect(suggestChips(base, { kind })).toEqual([]);
  });
  it('a generic answer gets two situation chips', () => {
    expect(suggestChips(base, { kind: 'other' })).toHaveLength(2);
  });
  it('never offers back what the user just sent; at most 3', () => {
    const r = suggestChips(base, { kind: 'opening' }, { lastUserText: 'תבנה לי את האימון של היום' });
    expect(r.map((c) => c.id)).not.toContain('build_today');
    expect(r.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });
});

describe('situation builders', () => {
  const now = new Date('2026-10-18T07:00:00Z');
  it('from the sheet: today planned and buildable, gap, not done', () => {
    const sheet = {
      ...OWNER_SHEET,
      today: [{ ...OWNER_SHEET.today[0], buildNow: { durationMin: null, domains: [] } }],
      assessmentGaps: [{ slug: 'core' as const, name: 'ליבה', partOf: null, why: '' }],
    };
    const s = situationFromSheet({ sheet, gender: 'male', hour: 10, todayKey: '2026-10-18', profile: { progression: { lastActiveDate: '2026-10-16' } }, now });
    expect(s).toMatchObject({ trainingDayToday: true, buildableToday: true, doneToday: false, gapName: 'ליבה', newUser: false });
  });
  it('from the sheet: a workout today → done, not buildable', () => {
    const sheet = { ...OWNER_SHEET, lastWorkouts: [{ date: '2026-10-18', type: 'strength', minutes: 30 }], today: [{ ...OWNER_SHEET.today[0], buildNow: { durationMin: null, domains: [] } }] };
    const s = situationFromSheet({ sheet, gender: 'female', hour: 19, todayKey: '2026-10-18', profile: null, now });
    expect(s.doneToday).toBe(true);
    expect(s.buildableToday).toBe(false);
  });
  it('from the profile: the template letter of today, never trained → new user, weather', () => {
    const s = situationFromProfile({
      profile: { lifestyle: { recurringTemplate: { א: ['full_body'] } } },
      gender: 'other',
      hour: 9,
      dayOfWeek: 0,
      now,
      weather: 'rain',
    });
    expect(s).toMatchObject({ trainingDayToday: true, buildableToday: true, newUser: true, daysAway: null, weather: 'rain' });
    expect(situationFromProfile({ profile: { lifestyle: { recurringTemplate: { ב: ['x'] } } }, gender: 'male', hour: 9, dayOfWeek: 0, now }).trainingDayToday).toBe(false);
    expect(situationFromProfile({ profile: {}, gender: 'male', hour: 9, dayOfWeek: 0, now, weather: 'uv' }).weather).toBeNull();
  });
  it('lastTurnFrom: tools and texts → the kind', () => {
    expect(lastTurnFrom({ userText: 'x', toolNames: ['generate_workout'], workout: { location: 'home', durationMin: 15, domains: ['core'] } })).toEqual({ kind: 'workout', location: 'home', minutes: 15, domains: ['core'] });
    expect(lastTurnFrom({ userText: 'מה בתוכנית השבוע?', toolNames: [] }).kind).toBe('schedule');
    expect(lastTurnFrom({ userText: 'x', toolNames: ['get_app_help'] }).kind).toBe('app_help');
    expect(lastTurnFrom({ userText: 'x', toolNames: ['propose_schedule_change'] }).kind).toBe('proposal');
    expect(lastTurnFrom({ userText: 'x', toolNames: [], safety: true }).kind).toBe('safety');
    expect(lastTurnFrom({ userText: 'איך אני מתקדם?', toolNames: [] }).kind).toBe('progress');
  });
});

describe('placeholderHints', () => {
  it('gendered prefix, 3-4 hints, situation first', () => {
    const m = placeholderHints({ ...base, daysAway: 7 });
    expect(m[0]).toBe('נסה: תבנה לי אימון חזרה קל');
    expect(m.length).toBeGreaterThanOrEqual(3);
    expect(m.length).toBeLessThanOrEqual(4);
    expect(placeholderHints({ ...base, gender: 'female' })[0].startsWith('נסי: ')).toBe(true);
    expect(placeholderHints({ ...base, gender: 'other' })[0].startsWith('אפשר לנסות: ')).toBe(true);
    expect(placeholderHints({ ...base, weather: 'rain' })[0]).toContain('בבית');
  });
});

describe('parseStoredSuggestions', () => {
  it('keeps valid chips only, caps lengths and count', () => {
    const r = parseStoredSuggestions([
      { id: 'a', label: 'x'.repeat(100), message: 'm' },
      { id: 'b' },
      null,
      { id: 'c', label: 'להתחיל', openCard: true, href: 'https://evil' },
      { id: 'd', label: 'd' },
      { id: 'e', label: 'e' },
    ]);
    expect(r).toHaveLength(3);
    expect(r[0].label.length).toBe(40);
    expect(r[1]).toEqual({ id: 'c', label: 'להתחיל', openCard: true });
    expect(parseStoredSuggestions('nope')).toEqual([]);
  });
});
