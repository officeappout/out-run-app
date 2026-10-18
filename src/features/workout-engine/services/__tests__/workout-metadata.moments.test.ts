import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Copy "moments" (18.10.2026): situation hard filter (returning / deload),
 * time-of-day hard filter, archived rows, persona priority bonus, the
 * policy-reason → situation mapping, the running break signal, and the
 * sweep-only doc-patch overlay.
 */

const state = vi.hoisted(() => ({
  ROWS: {} as Record<string, any[]>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _base: string, parentDoc: string, _subCol: string) => ({ __parentDoc: parentDoc }),
  getDocs: async (ref: { __parentDoc: string }) => {
    const rows = state.ROWS[ref.__parentDoc] ?? [];
    return {
      empty: rows.length === 0,
      docs: rows.map((r, i) => ({ id: r.__id ?? `doc${i}`, data: () => r })),
    };
  },
  query: vi.fn(),
  where: vi.fn(),
}));

import {
  resolveWorkoutMetadataWithCandidates,
  resolveContentSituation,
  resolveRunningContentSituation,
  scoreSituationField,
  isTimeOfDayCompatible,
  setLocalContentOverlay,
  SITUATION_MATCH_BOOST,
  PERSONA_PRIORITY_BONUS,
  type WorkoutMetadataContext,
} from '../workout-metadata.service';
import { generateMetadataDocId, readMomentFields } from '../workout-metadata-content-fields';

function setTitles(rows: any[]) {
  state.ROWS.workoutTitles = rows;
}

// April 10:00 — outside every seasonal / parent / desk time window.
const previewNow = (() => { const d = new Date(); d.setMonth(3, 15); d.setHours(10, 0, 0, 0); return d; })();

const generalHomeMorning: WorkoutMetadataContext = {
  persona: null, location: 'home', timeOfDay: 'morning', isAbroad: false, previewNow,
};

beforeEach(() => {
  state.ROWS = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => setLocalContentOverlay(null));

describe('resolveContentSituation (policy reason → content situation)', () => {
  it('maps every break reason to returning and the planned deload to deload', () => {
    expect(resolveContentSituation('detraining')).toBe('returning');
    expect(resolveContentSituation('long_gap_deload')).toBe('returning');
    expect(resolveContentSituation('rebuild')).toBe('returning');
    expect(resolveContentSituation('deload')).toBe('deload');
  });
  it('build / peak / missing → no situation (regular session)', () => {
    expect(resolveContentSituation('build')).toBeUndefined();
    expect(resolveContentSituation('peak')).toBeUndefined();
    expect(resolveContentSituation(undefined)).toBeUndefined();
  });
});

describe('resolveRunningContentSituation (days since the last run)', () => {
  const now = new Date('2026-10-18T18:00:00Z');
  it('7+ days → returning', () => {
    expect(resolveRunningContentSituation('2026-10-08T07:00:00Z', now)).toBe('returning');
    expect(resolveRunningContentSituation(new Date('2026-10-11T17:00:00Z'), now)).toBe('returning');
  });
  it('under 7 days, missing or invalid → none', () => {
    expect(resolveRunningContentSituation('2026-10-15T07:00:00Z', now)).toBeUndefined();
    expect(resolveRunningContentSituation(undefined, now)).toBeUndefined();
    expect(resolveRunningContentSituation('not a date', now)).toBeUndefined();
  });
});

describe('situation hard filter', () => {
  it('scoreSituationField: untagged 0, match +boost, mismatch null', () => {
    expect(scoreSituationField('', 'returning')).toBe(0);
    expect(scoreSituationField(undefined, undefined)).toBe(0);
    expect(scoreSituationField('returning', 'returning')).toBe(SITUATION_MATCH_BOOST);
    expect(scoreSituationField('returning', undefined)).toBeNull();
    expect(scoreSituationField('deload', 'returning')).toBeNull();
  });

  const rows = [
    { text: 'בוקר טוב, מתחילים לזוז', persona: 'any', location: 'home', timeOfDay: 'morning' },
    { text: 'חוזרים לאט ובטוח', persona: 'any', location: 'home', timeOfDay: 'any', situation: 'returning' },
    { text: 'שבוע קל, גוף חזק', persona: 'any', location: 'home', timeOfDay: 'any', situation: 'deload' },
  ];

  it('a regular session never sees situation rows', async () => {
    setTitles(rows);
    const r = await resolveWorkoutMetadataWithCandidates(generalHomeMorning);
    expect(r.title).toBe('בוקר טוב, מתחילים לזוז');
    expect(r.titleCandidates.map(c => c.text)).toEqual(['בוקר טוב, מתחילים לזוז']);
  });

  it('a returning session picks the returning row over a better-located regular row', async () => {
    setTitles(rows);
    const r = await resolveWorkoutMetadataWithCandidates({ ...generalHomeMorning, situation: 'returning' });
    expect(r.title).toBe('חוזרים לאט ובטוח');
    expect(r.titleCandidates.some(c => c.text === 'שבוע קל, גוף חזק')).toBe(false);
    expect(r.titleCandidates[0].reasons.join(' ')).toContain('situation=returning');
  });

  it('a deload session picks the deload row', async () => {
    setTitles(rows);
    const r = await resolveWorkoutMetadataWithCandidates({ ...generalHomeMorning, situation: 'deload' });
    expect(r.title).toBe('שבוע קל, גוף חזק');
  });

  it('with no situation row available, a returning session still gets regular copy', async () => {
    setTitles([rows[0]]);
    const r = await resolveWorkoutMetadataWithCandidates({ ...generalHomeMorning, situation: 'returning' });
    expect(r.title).toBe('בוקר טוב, מתחילים לזוז');
  });
});

describe('time-of-day hard filter', () => {
  it('isTimeOfDayCompatible: untagged rows fit any time, tagged rows only their time', () => {
    expect(isTimeOfDayCompatible('', 'evening')).toBe(true);
    expect(isTimeOfDayCompatible('any', 'evening')).toBe(true);
    expect(isTimeOfDayCompatible(undefined, 'evening')).toBe(true);
    expect(isTimeOfDayCompatible('evening', 'evening')).toBe(true);
    expect(isTimeOfDayCompatible('morning', 'evening')).toBe(false);
  });

  it('a morning row cannot win in the evening even when it is the only one targeted at the user', async () => {
    // Before: the morning row scored persona-match points and beat the untagged row
    // at any time. Now it is excluded outside the morning.
    setTitles([
      { text: 'בוקר בבית, היום רק מתחיל', persona: 'parent', location: 'home', timeOfDay: 'morning' },
      { text: 'אימון בבית', persona: 'any', location: 'home' },
    ]);
    const r = await resolveWorkoutMetadataWithCandidates({ ...generalHomeMorning, persona: 'parent', timeOfDay: 'evening' });
    expect(r.title).toBe('אימון בבית');
    expect(r.titleCandidates.some(c => c.text.includes('בוקר'))).toBe(false);
  });

  it('the same morning row still wins in the morning', async () => {
    setTitles([
      { text: 'בוקר בבית, היום רק מתחיל', persona: 'parent', location: 'home', timeOfDay: 'morning' },
      { text: 'אימון בבית', persona: 'any', location: 'home' },
    ]);
    const r = await resolveWorkoutMetadataWithCandidates({ ...generalHomeMorning, persona: 'parent' });
    expect(r.title).toBe('בוקר בבית, היום רק מתחיל');
  });
});

describe('archived rows', () => {
  it('an archived row never competes, even as the best match', async () => {
    setTitles([
      { text: 'שורה ישנה', persona: 'any', location: 'home', timeOfDay: 'morning', archived: true },
      { text: 'שורה חדשה', persona: 'any' },
    ]);
    const r = await resolveWorkoutMetadataWithCandidates(generalHomeMorning);
    expect(r.title).toBe('שורה חדשה');
    expect(r.titleCandidates).toHaveLength(1);
  });
});

describe('persona priority bonus', () => {
  const parentEvening: WorkoutMetadataContext = { ...generalHomeMorning, persona: 'parent', timeOfDay: 'evening' };

  it('a persona-only row (1 + bonus) outranks a general location+time row (2) for that persona', async () => {
    setTitles([
      { text: 'ערב בבית', persona: 'any', location: 'home', timeOfDay: 'evening' },
      { text: 'הילדים נרדמו', persona: 'parent', location: 'any', timeOfDay: 'any' },
    ]);
    const r = await resolveWorkoutMetadataWithCandidates(parentEvening);
    expect(r.title).toBe('הילדים נרדמו');
    const parentRow = r.titleCandidates.find(c => c.persona === 'parent')!;
    expect(parentRow.score).toBe(1 + PERSONA_PRIORITY_BONUS);
    expect(parentRow.reasons.join(' ')).toContain('personaPriority');
  });

  it('no bonus for a persona row that names a different location than the session', async () => {
    setTitles([
      { text: 'ערב בבית', persona: 'any', location: 'home', timeOfDay: 'evening' },
      { text: 'אחרי האיסוף, בגינה', persona: 'parent', location: 'park', timeOfDay: 'any' },
    ]);
    const r = await resolveWorkoutMetadataWithCandidates(parentEvening);
    expect(r.title).toBe('ערב בבית');
  });

  it('general (no-persona) users are unaffected: same scores as before', async () => {
    setTitles([
      { text: 'ערב בבית', persona: 'any', location: 'home', timeOfDay: 'evening' },
      { text: 'ערב כללי', persona: '' },
    ]);
    const r = await resolveWorkoutMetadataWithCandidates({ ...generalHomeMorning, timeOfDay: 'evening' });
    const scores = Object.fromEntries(r.titleCandidates.map(c => [c.text, c.score]));
    expect(scores['ערב בבית']).toBe(52); // location + time + generic persona bonus (+50)
    expect(scores['ערב כללי']).toBe(0);
    expect(r.titleCandidates.every(c => !c.reasons.join(' ').includes('personaPriority'))).toBe(true);
  });
});

describe('local doc patches (sweep-only preview of an import)', () => {
  it('archives / drops / retags live rows by doc id before scoring', async () => {
    setTitles([
      { __id: 'old1', text: 'ישן 1', persona: 'any', location: 'home', timeOfDay: 'morning' },
      { __id: 'old2', text: 'ישן 2', persona: 'any', location: 'home', timeOfDay: 'morning' },
      { __id: 'fix1', text: 'מתוקן', persona: 'any', location: 'home', timeOfDay: 'evening' },
    ]);
    setLocalContentOverlay(
      { workoutTitles: [] },
      { workoutTitles: { old1: { archived: true }, old2: null, fix1: { timeOfDay: 'morning' } } },
    );
    const r = await resolveWorkoutMetadataWithCandidates(generalHomeMorning);
    expect(r.titleCandidates.map(c => c.text)).toEqual(['מתוקן']);
  });
});

describe('workout-metadata-content-fields', () => {
  it('generateMetadataDocId matches the admin bulk-upload scheme (FNV-1a of text|persona|bundleId|gender)', () => {
    // Golden values: a v2 title row and a row with empty parts (dropped from the join).
    expect(generateMetadataDocId('בוקר טוב, מתחילים לזוז', 'any', 'v2_s_gen_home_morning_reg_1', 'both'))
      .toMatch(/^[0-9a-f]{8}$/);
    expect(generateMetadataDocId(' a ', '', 'b', '')).toBe(generateMetadataDocId('a', '', 'b', ''));
    expect(generateMetadataDocId('', '', '', '')).toBe('811c9dc5'); // FNV offset basis — empty input
  });

  it('readMomentFields keeps valid values and drops unknown ones with a warning', () => {
    expect(readMomentFields({ weather: 'rain', situation: 'returning', timeOfDay: 'evening' }))
      .toEqual({ weather: 'rain', situation: 'returning', timeOfDay: 'evening', warnings: [] });
    const bad = readMomentFields({ weather: 'snow', situation: 'tired', timeOfDay: 'noon' });
    expect(bad.weather).toBeUndefined();
    expect(bad.situation).toBeUndefined();
    expect(bad.timeOfDay).toBeUndefined();
    expect(bad.warnings).toHaveLength(3);
    expect(readMomentFields({ weather: '', situation: 'any' })).toEqual({ warnings: [] });
  });
});
