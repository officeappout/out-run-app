/**
 * Push library core — catalog, write rules, selection.
 * (The server mirror is pinned below; push-copy.service.ts's own tests cover
 * the Firestore adapter and cache.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  PUSH_BODY_MAX,
  PUSH_CATALOG,
  PUSH_CATALOG_BY_TYPE,
  PUSH_TITLE_MAX,
  ageBandFromBirthDate,
  buildDeepLink,
  defaultRowsFor,
  isInTimeWindow,
  normalizeLegacyPlaceholders,
  previewPushCopy,
  renderCopy,
  sampleVarsFor,
  selectPushCopy,
  specificity,
  validatePushCopyDraft,
  findUnpairedRows,
  pairDraftRows,
  pairSideFor,
  sendBlockers,
  validatePushCopyPair,
  type PushCopyPairDraft,
  type PushCopyRow,
} from '../push-library.core';

describe('server mirror', () => {
  it('functions/src/shared/push-library.core.ts is this file, byte for byte (run the functions build to refresh)', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const app = readFileSync(path.join(root, 'src/features/notifications/push-library/push-library.core.ts'), 'utf8');
    const mirror = readFileSync(path.join(root, 'functions/src/shared/push-library.core.ts'), 'utf8');
    expect(mirror.slice(mirror.indexOf('\n') + 1)).toBe(app);
  });
});

// ─── Write rules ──────────────────────────────────────────────────────────────

const base = { pushType: 'retention_lapse', title: 'חוזרים בקטנה?', body: 'אימון קצר, בקצב שלך.', deepLink: 'home' };

function fields(draft: Parameters<typeof validatePushCopyDraft>[0]): string[] {
  return validatePushCopyDraft(draft).map((i) => i.field);
}

describe('validatePushCopyDraft (enforced on save)', () => {
  it('accepts clean copy', () => {
    expect(validatePushCopyDraft(base)).toEqual([]);
  });

  it(`title ≤ ${PUSH_TITLE_MAX}, body ≤ ${PUSH_BODY_MAX} (measured with sample values)`, () => {
    expect(fields({ ...base, title: 'א'.repeat(41) })).toContain('title');
    expect(fields({ ...base, title: 'א'.repeat(40) })).not.toContain('title');
    expect(fields({ ...base, body: 'א'.repeat(91) })).toContain('body');
    expect(fields({ ...base, body: 'א'.repeat(90) })).not.toContain('body');
    // '@שם' (3 chars) renders as the 3-char sample 'דנה'; 38 + 3 = 41 > 40
    expect(fields({ ...base, title: `@שם${'א'.repeat(38)}` })).toContain('title');
  });

  it("rejects '/' gender slashes", () => {
    expect(fields({ ...base, body: 'בוא/י להתאמן' })).toContain('body');
    expect(fields({ ...base, title: 'את/ה מוכן/ה?' })).toContain('title');
  });

  it('rejects em and en dashes, allows the plain hyphen', () => {
    expect(fields({ ...base, body: 'הגוף מחכה — בואו' })).toContain('body');
    expect(fields({ ...base, body: 'הגוף מחכה – בואו' })).toContain('body');
    expect(validatePushCopyDraft({ ...base, pushType: 'workout_reminder_before', title: '@אימון ב-@שעה', body: 'יוצאים?' })).toEqual([]);
  });

  it('rejects emoji', () => {
    expect(fields({ ...base, title: 'חוזרים 💪' })).toContain('title');
    expect(fields({ ...base, body: 'יוצאים 🏃' })).toContain('body');
  });

  it('only known variables, and only those this push fills', () => {
    expect(fields({ ...base, body: 'עברו @ימים ימים' })).toEqual([]);
    const unknown = validatePushCopyDraft({ ...base, body: '@זמן_אימון דקות מחכות' });
    expect(unknown.some((i) => i.message.includes('@זמן_אימון'))).toBe(true);
    const notFilled = validatePushCopyDraft({ ...base, body: 'נשארו @צעדים_שנותרו צעדים' });
    expect(notFilled.some((i) => i.message.includes('@צעדים_שנותרו'))).toBe(true);
    expect(fields({ ...base, body: '{name}, חוזרים?' })).toContain('body');
  });

  it('deep link is required and must be one this push allows', () => {
    expect(fields({ ...base, deepLink: '' })).toContain('deepLink');
    expect(fields({ ...base, deepLink: 'gateway' })).toContain('deepLink');
    expect(fields({ ...base, deepLink: 'map' })).not.toContain('deepLink');
  });

  it('time window, conditions and audience values are checked', () => {
    expect(fields({ ...base, timeWindow: { start: '8:00', end: '21:30' } })).toContain('timeWindow');
    expect(fields({ ...base, timeWindow: { start: '08:00', end: '21:30' } })).toEqual([]);
    expect(fields({ ...base, pushType: 'level_up', title: 'עלית לרמה @רמה', body: 'ממשיכים.', deepLink: 'progression', conditions: { level: ['11'] } })).toContain('conditions');
    expect(fields({ ...base, audience: { persona: ['astronaut'] } })).toContain('audience');
    expect(fields({ ...base, audience: { persona: ['parent'], ageBand: ['30_44'], primaryGoal: ['weight_loss'] } })).toEqual([]);
  });
});

describe('the code defaults obey the write rules', () => {
  for (const entry of PUSH_CATALOG) {
    it(`${entry.pushType}`, () => {
      expect(entry.defaults.length).toBeGreaterThan(0);
      for (const d of entry.defaults) {
        const issues = validatePushCopyDraft({
          pushType: entry.pushType,
          title: d.title,
          body: d.body,
          deepLink: entry.deepLinks[0],
          audience: d.audience,
          conditions: d.conditions,
          gender: d.gender,
          subjectGender: d.subjectGender,
        });
        expect(issues, `${d.title} / ${d.body}`).toEqual([]);
      }
      // A gendered default always ships with its twin.
      expect(findUnpairedRows(defaultRowsFor(entry.pushType))).toEqual(new Map());
    });
  }

  it('every catalog entry declares a lever, channel, sender and WHEN text', () => {
    for (const e of PUSH_CATALOG) {
      expect(e.lever && e.channel && e.sender && e.whenSent && e.description).toBeTruthy();
    }
  });
});

// ─── Selection ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-18T09:00:00Z'); // 12:00 Israel

function row(id: string, over: Partial<PushCopyRow> = {}): PushCopyRow {
  return { id, pushType: 'retention_lapse', title: `כותרת ${id}`, body: `טקסט ${id}`, deepLink: 'home', active: true, ...over };
}

describe('selectPushCopy', () => {
  it('library rows beat the code defaults', () => {
    const c = selectPushCopy('retention_lapse', [row('a')], { uid: 'u1', now: NOW });
    expect(c).toMatchObject({ rowId: 'a', source: 'library', title: 'כותרת a', deepLink: '/home' });
  });

  it('falls back to the code defaults when the library has nothing live', () => {
    const rows = [row('off', { active: false }), row('arch', { archived: true }), row('rw', { needsRewrite: true })];
    const c = selectPushCopy('retention_lapse', rows, { uid: 'u1', now: NOW, vars: { '@שם': 'דנה' } });
    expect(c?.source).toBe('default');
    expect(c?.rowId).toMatch(/^default:retention_lapse:\d$/);
  });

  it('ignores rows of another pushType', () => {
    const c = selectPushCopy('retention_lapse', [row('x', { pushType: 'level_up' })], { uid: 'u', now: NOW });
    expect(c?.source).toBe('default');
  });

  it('most specific audience wins', () => {
    const rows = [
      row('generic'),
      row('parent', { audience: { persona: ['parent'] } }),
      row('parent30', { audience: { persona: ['parent'], ageBand: ['30_44'] } }),
    ];
    const pick = (audience: object) => selectPushCopy('retention_lapse', rows, { uid: 'u1', now: NOW, audience })?.rowId;
    expect(pick({ persona: 'parent', ageBand: '30_44' })).toBe('parent30');
    expect(pick({ persona: 'parent', ageBand: '18_29' })).toBe('parent');
    expect(pick({ persona: 'student' })).toBe('generic');
    expect(pick({})).toBe('generic'); // unknown audience never gets a targeted row
  });

  it('rotates deterministically per user per day among equally specific rows', () => {
    const rows = ['a', 'b', 'c'].map((id) => row(id));
    const at = (uid: string, now: Date) => selectPushCopy('retention_lapse', rows, { uid, now })?.rowId;
    expect(at('u1', NOW)).toBe(at('u1', new Date(NOW.getTime() + 3600_000))); // same day → same row
    const users = new Set(Array.from({ length: 60 }, (_, i) => at(`user-${i}`, NOW)));
    expect(users.size).toBe(3); // spread across users
    const days = new Set(Array.from({ length: 30 }, (_, d) => at('u1', new Date(NOW.getTime() + d * 86_400_000))));
    expect(days.size).toBeGreaterThan(1); // changes across days
    // order of rows in the input doesn't matter
    expect(selectPushCopy('retention_lapse', [...rows].reverse(), { uid: 'u1', now: NOW })?.rowId).toBe(at('u1', NOW));
  });

  it('resolves variables from the context; a row with an unfilled variable is skipped', () => {
    const rows = [row('named', { title: '@שם, חוזרים?' }), row('plain', { title: 'חוזרים?', fallbackOnly: true })];
    expect(selectPushCopy('retention_lapse', rows, { uid: 'u', now: NOW, vars: { '@שם': 'דנה' } })).toMatchObject({
      rowId: 'named',
      title: 'דנה, חוזרים?',
    });
    expect(selectPushCopy('retention_lapse', rows, { uid: 'u', now: NOW, vars: { '@שם': '  ' } })?.rowId).toBe('plain');
  });

  it('invalid rows (slash, unknown variable, empty) fall back to the defaults', () => {
    const rows = [
      row('slash', { body: 'בוא/י להתאמן' }),
      row('unknown', { body: '@זמן_אימון דקות' }),
      row('empty', { body: '   ' }),
      row('brace', { body: '{days_since} ימים' }),
    ];
    const c = selectPushCopy('retention_lapse', rows, { uid: 'u', now: NOW, vars: { '@שם': 'דנה', '@ימים': '9' } });
    expect(c?.source).toBe('default');
  });

  it("a user value is never re-scanned as a variable", () => {
    const c = selectPushCopy('retention_lapse', [row('n', { title: '@שם, חוזרים?' })], {
      uid: 'u',
      now: NOW,
      vars: { '@שם': '@ימים' },
    });
    expect(c?.title).toBe('@ימים, חוזרים?');
  });

  it('conditions: per-level copy beats the generic level copy', () => {
    const c5 = selectPushCopy('level_up', [], { uid: 'u', now: NOW, conditions: { level: '5' } });
    expect(c5?.title).toBe('רמה 5, חצי הדרך');
    const c12 = selectPushCopy('level_up', [], { uid: 'u', now: NOW, conditions: { level: '12' }, vars: { '@רמה': '12' } });
    expect(c12?.title).toBe('עלית לרמה 12');
  });

  it('kudos bundle: "ועוד מישהו" only when exactly one other sent', () => {
    const vars = { '@שולח': 'נועה', '@כמות': '2', '@עוד': '1' };
    expect(selectPushCopy('kudos_bundle', [], { uid: 'u', now: NOW, vars, conditions: { others: 'one' } })?.body).toBe(
      'נועה ועוד מישהו שלחו לך כיף.',
    );
    expect(
      selectPushCopy('kudos_bundle', [], { uid: 'u', now: NOW, vars: { ...vars, '@כמות': '5', '@עוד': '4' }, conditions: { others: 'many' } })?.body,
    ).toBe('נועה ועוד 4 שלחו לך כיף.');
  });

  it('step goal: no copy for hit/over → null (the sender sends nothing)', () => {
    expect(selectPushCopy('step_goal', [], { uid: 'u', now: NOW, conditions: { bucket: 'hit' } })).toBeNull();
    const mid = selectPushCopy('step_goal', [], {
      uid: 'u',
      now: NOW,
      conditions: { bucket: 'mid' },
      audience: { persona: 'parent' },
      vars: { '@צעדים_שנותרו': '2,000', '@דקות': '18' },
    });
    expect(mid?.body).toBe('גם עם כל הסידורים, נשארו רק 2,000 צעדים ליעד.'); // persona copy beats generic
  });

  it('fallbackOnly copy is used only when nothing else renders', () => {
    const withName = selectPushCopy('contribution_approved', [], { uid: 'u', now: NOW, vars: { '@מקום': 'גן הבנים' } });
    expect(withName?.body).toContain('גן הבנים');
    const noName = selectPushCopy('contribution_approved', [], { uid: 'u', now: NOW, vars: { '@מקום': '' } });
    expect(noName?.body).toBe('מעכשיו כולם יכולים להתאמן שם. תודה!');
  });

  it('time windows (Israel time)', () => {
    const rows = [row('morning', { timeWindow: { start: '07:00', end: '11:00' } })];
    expect(selectPushCopy('retention_lapse', rows, { uid: 'u', now: NOW })?.source).toBe('default'); // 12:00
    expect(selectPushCopy('retention_lapse', rows, { uid: 'u', now: new Date('2026-10-18T06:00:00Z') })?.rowId).toBe('morning'); // 09:00
    expect(isInTimeWindow({ start: '22:00', end: '02:00' }, new Date('2026-10-18T21:30:00Z'))).toBe(true); // 00:30, wraps
  });

  it('row deep link must be one the push allows; params fill the path', () => {
    const rows = [row('m', { deepLink: 'map' }), row('bad', { deepLink: 'gateway', title: 'ב', body: 'ב' })];
    const m = selectPushCopy('retention_lapse', [rows[0]], { uid: 'u', now: NOW });
    expect(m?.deepLink).toBe('/map');
    const bad = selectPushCopy('retention_lapse', [rows[1]], { uid: 'u', now: NOW });
    expect(bad?.deepLink).toBe('/home');
    expect(buildDeepLink('map_park', { parkId: 'a b' })).toBe('/map?openPark=a%20b');
    expect(buildDeepLink('map_park', {})).toBe('/map');
  });

  it('unknown pushType → null', () => {
    expect(selectPushCopy('nope', [], { uid: 'u' })).toBeNull();
  });
});

describe('helpers', () => {
  it('specificity counts audience dimensions and conditions', () => {
    expect(specificity({})).toBe(0);
    expect(specificity({ audience: { persona: ['parent'], ageBand: [] }, conditions: { level: ['5'] } })).toBe(2);
  });

  it('legacy {placeholders} map onto @variables', () => {
    expect(normalizeLegacyPlaceholders('{creatorName} ב{placeName} {unknown}')).toBe('@שולח ב@מקום {unknown}');
  });

  it('renderCopy reports what is wrong', () => {
    expect(renderCopy({ title: 'את/ה', body: '@שם' }, {}).problems).toEqual(expect.arrayContaining(['slash', 'unresolved:@שם']));
    expect(renderCopy({ title: 'כמעט שם — עוד קצת', body: 'יוצאים 👟' }, {}).problems).toEqual(['dash', 'emoji']);
  });

  it('age bands', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    expect(ageBandFromBirthDate(Date.UTC(1990, 0, 1), now)).toBe('30_44');
    expect(ageBandFromBirthDate(Date.UTC(2010, 0, 1), now)).toBe('under_18');
    expect(ageBandFromBirthDate(null, now)).toBeNull();
  });

  it('preview fills sample values and the sample deep link', () => {
    const p = previewPushCopy({ pushType: 'level_up', title: 'עלית לרמה @רמה', body: '@תוכנית', deepLink: 'progression_map' });
    expect(p.title).toBe('עלית לרמה 5');
    expect(p.deepLink).toBe('/progression-map/program123');
    expect(Object.keys(sampleVarsFor('kudos_bundle'))).toEqual(PUSH_CATALOG_BY_TYPE.kudos_bundle.vars);
    expect(defaultRowsFor('kudos_bundle').every((r) => r.id.startsWith('default:kudos_bundle:'))).toBe(true);
  });
});

// ─── Gender ───────────────────────────────────────────────────────────────────

describe('gender: the recipient', () => {
  const rows = [
    row('both', { title: 'חוזרים?' }),
    row('m', { title: 'מוכן לחזור?', gender: 'male', pairId: 'p' }),
    row('f', { title: 'מוכנה לחזור?', gender: 'female', pairId: 'p' }),
  ];
  const pick = (gender: 'male' | 'female' | null | undefined) =>
    selectPushCopy('retention_lapse', rows, { uid: 'u1', now: NOW, audience: { gender } })?.title;

  it('exact gender beats the neutral row', () => {
    expect(pick('male')).toBe('מוכן לחזור?');
    expect(pick('female')).toBe('מוכנה לחזור?');
  });

  it("'other' / unknown recipients get only neutral rows", () => {
    expect(pick(null)).toBe('חוזרים?');
    expect(pick(undefined)).toBe('חוזרים?');
    expect(selectPushCopy('retention_lapse', rows, { uid: 'u1', now: NOW, audience: { gender: 'other' as never } })?.title).toBe('חוזרים?');
  });

  it('fallback chain: exact gender → both → code default', () => {
    const onlyMale = [row('m', { title: 'מוכן לחזור?', gender: 'male' })];
    // female, no female or neutral row in the library → the code defaults (her gendered default first)
    const f = selectPushCopy('retention_lapse', onlyMale, { uid: 'u1', now: NOW, audience: { gender: 'female' } });
    expect(f?.source).toBe('default');
    expect(f?.title).toMatch(/מוכנה|יום טוב/);
    // an exact row that can't be filled falls through to the neutral row
    const named = [row('m', { title: '@שם, מוכן?', gender: 'male' }), row('both', { title: 'חוזרים?' })];
    expect(selectPushCopy('retention_lapse', named, { uid: 'u1', now: NOW, audience: { gender: 'male' } })?.rowId).toBe('both');
  });

  it('code defaults: a woman gets female or neutral copy, never the male twin', () => {
    for (let i = 0; i < 40; i++) {
      const c = selectPushCopy('retention_lapse', [], { uid: `u${i}`, now: NOW, audience: { gender: 'female' }, vars: { '@שם': 'דנה' } });
      expect(c?.title).not.toMatch(/מוכן לחזור|מוכן\?/);
      expect(c?.body).not.toMatch(/ואתה/);
    }
  });
});

describe('gender: the subject (another person the push is about)', () => {
  const vars = { '@שם': 'דנה', '@שולח': 'נועה', '@מקום': 'גן הבנים', '@שעה': '18:30' };
  const ctx = (subjectGender: 'male' | 'female' | null, recipient: 'male' | 'female' | null = 'female') => ({
    uid: 'u1',
    now: NOW,
    vars,
    audience: { gender: recipient },
    conditions: { activity: 'running' },
    subjectGender,
  });

  it('partner_plan: the verb agrees with whoever planned the session', () => {
    const f = selectPushCopy('partner_plan', [], ctx('female'));
    expect(f?.body).toMatch(/נועה יוצאת לרוץ/);
    const m = selectPushCopy('partner_plan', [], { ...ctx('male'), vars: { ...vars, '@שולח': 'יואב' } });
    expect(m?.body).toMatch(/יואב יוצא לרוץ/);
  });

  it('unknown subject → neutral copy only', () => {
    const n = selectPushCopy('partner_plan', [], ctx(null));
    expect(n?.body).not.toMatch(/יוצא/);
    expect(n?.body).toMatch(/^ריצה ב/);
  });

  it("recipient and subject genders are independent", () => {
    const rows: PushCopyRow[] = [
      { ...row('sf', { subjectGender: 'female', body: 'נועה יוצאת' }), pushType: 'partner_plan' },
      { ...row('sm', { subjectGender: 'male', body: 'יואב יוצא' }), pushType: 'partner_plan' },
    ];
    expect(selectPushCopy('partner_plan', rows, ctx('female', 'male'))?.rowId).toBe('sf');
    expect(selectPushCopy('partner_plan', rows, ctx('male', 'female'))?.rowId).toBe('sm');
  });

  it('kudos and group-join pairs agree with the sender / joiner', () => {
    const k = selectPushCopy('kudos_single', [], { uid: 'u', now: NOW, vars: { '@שולח': 'נועה' }, subjectGender: 'female' });
    expect(k?.title).toBe('נועה שלחה לך כיף');
    const g = selectPushCopy('group_join_admin', [], {
      uid: 'u',
      now: NOW,
      vars: { '@מצטרף': 'יואב', '@קבוצה': 'רצים בפארק' },
      subjectGender: 'male',
    });
    expect(g?.title).toBe('יואב הצטרף לרצים בפארק');
  });
});

describe('gender: the editor (pairs)', () => {
  const pair = (over: Partial<PushCopyPairDraft> = {}): PushCopyPairDraft => ({
    pushType: 'retention_lapse',
    deepLink: 'home',
    axis: 'recipient',
    neutral: { title: '', body: '' },
    male: { title: 'מוכן לחזור?', body: 'אימון קל, ואתה שוב בשגרה.' },
    female: { title: 'מוכנה לחזור?', body: 'אימון קל, ואת שוב בשגרה.' },
    ...over,
  });

  it('a full pair saves two rows with the gender set', () => {
    expect(validatePushCopyPair(pair())).toEqual({ issues: [], warnings: [] });
    expect(pairDraftRows(pair()).map((r) => [r.side, r.draft.gender, r.draft.subjectGender])).toEqual([
      ['male', 'male', 'any'],
      ['female', 'female', 'any'],
    ]);
    const subj = pairDraftRows(pair({ pushType: 'kudos_single', axis: 'subject' }));
    expect(subj.map((r) => [r.draft.gender, r.draft.subjectGender])).toEqual([
      ['both', 'male'],
      ['both', 'female'],
    ]);
  });

  it('warns (does not block) when one side is missing', () => {
    const v = validatePushCopyPair(pair({ female: { title: '', body: '' } }));
    expect(v.issues).toEqual([]);
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatch(/אין נוסח לנקבה/);
  });

  it('still rejects slashes, per side', () => {
    const v = validatePushCopyPair(pair({ female: { title: 'מוכן/ה לחזור?', body: 'אימון קל.' } }));
    expect(v.issues.map((i) => [i.side, i.field])).toEqual([['female', 'title']]);
  });

  it('an empty pair, or a subject pair on a push without a subject, is blocked', () => {
    const empty = validatePushCopyPair(pair({ male: { title: '', body: '' }, female: { title: '', body: '' } }));
    expect(empty.issues.some((i) => i.side === 'shared')).toBe(true);
    const noSubject = validatePushCopyPair(pair({ axis: 'subject' }));
    expect(noSubject.issues.some((i) => i.field === 'gender')).toBe(true);
  });

  it('neutral mode is the old single variant', () => {
    const v = validatePushCopyPair(pair({ axis: 'none', neutral: { title: 'חוזרים?', body: 'אימון קל.' } }));
    expect(v).toEqual({ issues: [], warnings: [] });
    expect(pairDraftRows(pair({ axis: 'none', neutral: { title: 'a', body: 'b' } }))).toHaveLength(1);
  });

  it('preview toggles: which side a recipient gets from this variant', () => {
    expect(pairSideFor(pair(), 'female', null)).toBe('female');
    expect(pairSideFor(pair(), null, null)).toBeNull(); // 'other' → another variant
    expect(pairSideFor(pair({ female: { title: '', body: '' } }), 'female', null)).toBeNull();
    expect(pairSideFor(pair({ axis: 'subject' }), 'female', 'male')).toBe('male');
    expect(pairSideFor(pair({ axis: 'none' }), null, null)).toBe('neutral');
  });

  it('validatePushCopyDraft: one axis per row, subject only where the push has one', () => {
    const base = { pushType: 'retention_lapse', title: 'חוזרים?', body: 'אימון קל.', deepLink: 'home' };
    expect(validatePushCopyDraft({ ...base, gender: 'female' })).toEqual([]);
    expect(validatePushCopyDraft({ ...base, subjectGender: 'female' }).map((i) => i.field)).toContain('gender');
    expect(
      validatePushCopyDraft({ ...base, pushType: 'kudos_single', gender: 'male', subjectGender: 'female' }).map((i) => i.field),
    ).toContain('gender');
  });

  it('preview sample names agree with the side', () => {
    const p = previewPushCopy({ pushType: 'partner_plan', title: 'מתאמנים לידך', body: '@שם, @שולח יוצא לרוץ', deepLink: 'map', subjectGender: 'male' });
    expect(p.body).toBe('דנה, יואב יוצא לרוץ');
    const q = previewPushCopy({ pushType: 'retention_lapse', title: '@שם, מוכן?', body: 'x', deepLink: 'home', gender: 'male' });
    expect(q.title).toBe('איתי, מוכן?');
  });
});

describe('the panel: unpaired rows and send blockers', () => {
  it('flags a live gendered row whose twin is missing', () => {
    const rows = [
      row('m', { gender: 'male', pairId: 'p1' }),
      row('f', { gender: 'female', pairId: 'p1' }),
      row('lonely', { gender: 'female', pairId: 'p2' }),
      row('m-off-twin', { gender: 'male', pairId: 'p3' }),
      row('f-off', { gender: 'female', pairId: 'p3', active: false }),
      row('auto-m', { gender: 'male', conditions: { x: ['1'] } }),
      row('auto-f', { gender: 'female', conditions: { x: ['1'] } }),
      row('neutral'),
    ];
    expect(findUnpairedRows(rows)).toEqual(
      new Map([
        ['lonely', 'male'],
        ['m-off-twin', 'female'],
      ]),
    );
  });

  it('send blockers: what makes a row always skipped at send time', () => {
    expect(sendBlockers({ pushType: 'step_goal', title: 'יעד', body: 'עוד @צעדים_שנותרו צעדים' })).toEqual([]);
    expect(sendBlockers({ pushType: 'step_goal', title: 'יעד', body: 'באמצע הדרך! עוד @צעדים_שנותרו צעדים ואת/ה ביעד' })).toEqual(['slash']);
    expect(sendBlockers({ pushType: 'step_goal', title: 'יעד', body: 'יום חדש — @צעדים_שנותרו צעדים 👟' })).toEqual(['dash', 'emoji']);
    expect(sendBlockers({ pushType: 'step_goal', title: '', body: '@מקום @זמן' })).toEqual([
      'empty-title',
      'unfilled-var:@מקום',
      'unknown-var:@זמן',
    ]);
  });

  it('a row with a dash or emoji is skipped at send time (the code default goes instead)', () => {
    const rows = [{ ...row('legacy', { body: 'כמעט שם — עוד @דקות דקות', conditions: { bucket: ['close'] } }), pushType: 'step_goal' }];
    const c = selectPushCopy('step_goal', rows, { uid: 'u', now: NOW, conditions: { bucket: 'close' }, vars: { '@דקות': '10', '@צעדים_שנותרו': '900' } });
    expect(c?.source).toBe('default');
  });
});
