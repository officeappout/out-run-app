/**
 * The seed script's pure part: which rows it inserts, archives and keeps.
 */
import { describe, it, expect } from 'vitest';
import { PUSH_CATALOG, findUnpairedRows, type PushCopyRow } from '../push-library.core';
import { classifyDormant, classifyLegacyInUse, seedInsertRows } from '../push-library.seed-classify';

describe('seedInsertRows', () => {
  const rows = seedInsertRows();

  it('one row per code default, ids by index (appended gendered defaults never rename a row)', () => {
    expect(rows).toHaveLength(PUSH_CATALOG.reduce((n, e) => n + e.defaults.length, 0));
    expect(rows.find((r) => r.id === 'lib_retention_lapse_0')?.data.title).toBe('פספסת כמה ימים? זה בסדר');
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('gendered defaults carry their gender and a shared pairId; every pair is complete', () => {
    const kudos = rows.filter((r) => r.data.pushType === 'kudos_single' && r.data.subjectGender !== 'any');
    expect(kudos.map((r) => [r.data.subjectGender, r.data.pairId])).toEqual([
      ['male', 'lib_kudos_single_pair_sent'],
      ['female', 'lib_kudos_single_pair_sent'],
    ]);
    const asRows: PushCopyRow[] = rows.map((r) => ({ id: r.id, ...(r.data as Omit<PushCopyRow, 'id'>) }));
    expect(findUnpairedRows(asRows)).toEqual(new Map());
    expect(rows.filter((r) => r.data.gender === 'both' && r.data.subjectGender === 'any').length).toBeGreaterThan(50);
  });

  it('no slash, em dash or emoji in anything it inserts', () => {
    // Built from a string: the app's tsconfig has no regex target for the u flag.
    const forbidden = new RegExp('[/\\u2013\\u2014]|\\p{Extended_Pictographic}', 'u');
    for (const r of rows) expect(`${r.data.title} ${r.data.body}`).not.toMatch(forbidden);
  });
});

describe('classifyLegacyInUse (the 18 rows a sender still reads)', () => {
  const legacy = [
    { id: 'dg', data: { triggerType: 'Daily_Goal', activityType: 'walking', dailyGoalBucket: 'mid', text: 'באמצע הדרך! עוד @צעדים_שנותרו צעדים ואת/ה ביעד' } },
    { id: 'pp', data: { triggerType: 'Future_Partner_Plan', activityType: 'running', text: '@שם, {creatorName} יוצא/ת לרוץ ב{placeName} — רוצה להצטרף?' } },
    { id: 'emoji', data: { triggerType: 'Daily_Goal', activityType: 'walking', dailyGoalBucket: 'start', text: 'יום חדש 👟' } },
    { id: 'clean', data: { triggerType: 'Daily_Goal', activityType: 'walking', dailyGoalBucket: 'close', text: 'כמעט שם! עוד ~@דקות דקות הליכה' } },
    { id: 'done', data: { triggerType: 'Daily_Goal', activityType: 'walking', dailyGoalBucket: 'mid', text: 'x', archived: true } },
    { id: 'lib', data: { pushType: 'step_goal', triggerType: 'Daily_Goal', text: 'x' } },
    { id: 'dormant', data: { triggerType: 'Inactivity', text: 'x' } },
  ];
  const out = classifyLegacyInUse(legacy);

  it('archives every unclassified in-use row (superseded), and only those', () => {
    expect(out.map((c) => [c.id, c.decision, c.pushType])).toEqual([
      ['dg', 'archive', 'step_goal'],
      ['pp', 'archive', 'partner_plan'],
      ['emoji', 'archive', 'step_goal'],
      ['clean', 'archive', 'step_goal'],
    ]);
  });

  it('lists the write rules each breaks, read the way the sender reads it', () => {
    const reasons = Object.fromEntries(out.map((c) => [c.id, c.reasons.slice(1)]));
    expect(reasons).toEqual({
      dg: ['gender slash'],
      pp: ['gender slash', 'em/en dash'], // {creatorName}/{placeName} are mapped, not a problem
      emoji: ['emoji'],
      clean: [],
    });
  });
});

describe('classifyDormant', () => {
  it('archives English, duplicates and rows needing data retention lacks; keeps the rest for a rewrite', () => {
    const out = classifyDormant([
      { id: 'a', data: { text: 'Come back!', persona: 'parent' } },
      { id: 'b', data: { text: '@שם, בוא/י נחזור', persona: 'parent' } },
      { id: 'c', data: { text: '@שם, בוא/י נחזור.', persona: 'parent' } },
      { id: 'd', data: { text: 'הגינה ב@מקום מחכה', persona: 'parent' } },
      { id: 'e', data: { text: 'אבא, הילדים מחכים לך בגינה', persona: 'parent' } },
      { id: 'f', data: { text: 'לוחמת, הכושר מחכה', persona: 'military' } },
    ]);
    const by = Object.fromEntries(out.map((c) => [c.id, c]));
    expect(by.a.decision).toBe('archive');
    expect(by.b).toMatchObject({ decision: 'keep', pushType: 'retention_lapse' });
    expect(by.b.reasons.join(' ')).toMatch(/gender slash/);
    expect(by.c.reasons[0]).toBe('duplicate of b');
    expect(by.d.decision).toBe('archive');
    expect(by.e).toMatchObject({ decision: 'keep', gender: 'male' });
    expect(by.f).toMatchObject({ decision: 'keep', gender: 'female' });
    expect(by.b.gender).toBeUndefined();
  });
});
