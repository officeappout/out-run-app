import { describe, it, expect } from 'vitest';
import { ADMIN_PAGES, buildAdminHref, pagesVisibleTo, adminPageById } from '../page-map';
import { decideLocalNav, isDataQuestion, queryTerms, searchAdminPages } from '../fuzzy-search';

const rootPages = pagesVisibleTo('root');
const superPages = pagesVisibleTo('super');

/**
 * 40 navigation questions written for calibration (plan §3.3 asks for 40 REAL questions from
 * the owner — these are the agent's stand-ins until the audit log has real ones). Correct =
 * one button to the expected page, or "did you mean" that includes it.
 */
const NAV_CASES: Array<[string, string]> = [
  ['איפה טבלת כל הערים', '/admin/authorities'],
  ['ניהול רשויות', '/admin/authorities'],
  ['תפתח את מרכז האישורים', '/admin/approval-center'],
  ['מסלולים שממתינים לאישור', '/admin/approval-center'],
  ['הגדרות מערכת', '/admin/system-settings'],
  ['דגלים', '/admin/system-settings'],
  ['בנק תרגילים', '/admin/exercises'],
  ['תרגילים', '/admin/exercises'],
  ['מפת חום', '/admin/heatmap'],
  ['עלויות', '/admin/costs'],
  ['כשלי הרשמה', '/admin/signup-failures'],
  ['פאנל סוכנים', '/admin/agents'],
  ['מסע משתמש', '/admin/journey'],
  ['אנליטיקה', '/admin/journey'],
  ['כל המשתמשים', '/admin/users/all'],
  ['הרשאות', '/admin/users'],
  ['ספריית פושים', '/admin/notifications/library'],
  ['מרכז התראות', '/admin/notifications'],
  ['קודי גישה', '/admin/access-codes'],
  ['יומן ביקורת', '/admin/audit-logs'],
  ['רמות ו XP', '/admin/levels'],
  ['שאלון אונבורדינג', '/admin/questionnaire'],
  ['תוכניות ריצה', '/admin/running/programs'],
  ['מפת קצבים', '/admin/running/pace-map'],
  ['ציוד ומתקנים', '/admin/gym-equipment'],
  ['מיקומים ומסלולים', '/admin/locations'],
  ['ארגונים', '/admin/organizations'],
  ['מפת דרכים', '/admin/roadmap'],
  ['ספר הוצאות', '/admin/finance/expenses'],
  ['חשבוניות לאישור', '/admin/finance/approvals'],
  ['תנועה באתר', '/admin/web-traffic'],
  ['קישורים שיווקיים', '/admin/links'],
  ['קלי ממתינים למענה', '/admin/ai-coach/kelly'],
  ['שיחות קלי', '/admin/ai-coach/reviews'],
  ['מרכז הדמו', '/admin/demo'],
  ['איך מגיעים למיפוי עיר', '/admin/city-mapping'],
  ['דיווחי תחזוקה', '/admin/authority/reports'],
  ['סימולטור אימונים', '/admin/workout-simulator'],
  ['כל הקבוצות במערכת', '/admin/community-groups-overview'],
  ['דף הבית', '/admin'],
];

function correct(query: string, href: string, pages = rootPages): 'go' | 'suggest' | 'miss' {
  const d = decideLocalNav(query, pages);
  if (d.kind === 'go') return d.page.href === href ? 'go' : 'miss';
  if (d.kind === 'did_you_mean') return d.pages.some((p) => p.page.href === href) ? 'suggest' : 'miss';
  return 'miss';
}

describe('local navigation calibration (plan §3.3: ≥85% answered locally and correctly)', () => {
  const outcomes = NAV_CASES.map(([q, href]) => ({ q, href, r: correct(q, href) }));
  it('≥ 85% of the 40 navigation questions are answered locally and correctly', () => {
    const ok = outcomes.filter((o) => o.r !== 'miss').length;
    const misses = outcomes.filter((o) => o.r === 'miss').map((o) => o.q);
    expect({ ok, misses }).toEqual({ ok: expect.any(Number), misses: expect.any(Array) });
    expect(ok / NAV_CASES.length).toBeGreaterThanOrEqual(0.85);
  });
  it('most of them are a single button (no "did you mean")', () => {
    const go = outcomes.filter((o) => o.r === 'go').length;
    expect(go / NAV_CASES.length).toBeGreaterThanOrEqual(0.6);
  });
  it('"טבלת כל הערים" offers BOTH the authorities table and city mapping (plan §11 Q14)', () => {
    const d = decideLocalNav('איפה טבלת כל הערים', rootPages);
    expect(d.kind).toBe('did_you_mean');
    if (d.kind === 'did_you_mean') {
      const hrefs = d.pages.map((p) => p.page.href);
      expect(hrefs).toContain('/admin/authorities');
      expect(hrefs).toContain('/admin/city-mapping');
    }
  });
  it('answers in well under 50ms per question (plan target)', () => {
    const t0 = performance.now();
    for (const [q] of NAV_CASES) decideLocalNav(q, rootPages);
    expect((performance.now() - t0) / NAV_CASES.length).toBeLessThan(50);
  });
});

describe('local navigation rules', () => {
  it('data / analysis questions always go to the server', () => {
    for (const q of ['כמה ממתינים לאישור?', 'למה ה-D7 ירד', 'מה המצב של הצנרת', 'כמה עלה ה-AI היום', 'D7 של 2026']) {
      expect(isDataQuestion(q)).toBe(true);
      expect(decideLocalNav(q, rootPages)).toEqual({ kind: 'server', reason: 'data_question' });
    }
  });
  it('gibberish → server (no_match), empty → server (empty)', () => {
    expect(decideLocalNav('קקקקקקק זזזזז', rootPages)).toEqual({ kind: 'server', reason: 'no_match' });
    expect(decideLocalNav('  ', rootPages)).toEqual({ kind: 'server', reason: 'empty' });
  });
  it('a super admin never gets a root-only page', () => {
    expect(superPages.some((p) => p.href === '/admin/agents')).toBe(false);
    expect(rootPages.some((p) => p.href === '/admin/agents')).toBe(true);
    const r = searchAdminPages('פאנל סוכנים', superPages);
    expect(r.some((x) => x.page.href === '/admin/agents')).toBe(false);
  });
  it('login / callback pages are never offered', () => {
    expect(rootPages.some((p) => p.path === '/admin/login')).toBe(false);
  });
  it('filler words are dropped (before and after stemming)', () => {
    expect(queryTerms('איפה אני מוצא את הדף של ניהול רשויות')).toEqual(['ניהול', 'רשויות']);
    expect(queryTerms('איך להגיע למסך')).toEqual([]);
  });
});

describe('buildAdminHref (the only way a link is made)', () => {
  it('static page → its href', () => {
    expect(buildAdminHref(adminPageById('admin/authorities')!)).toEqual({ ok: true, href: '/admin/authorities' });
  });
  it('dynamic page needs a safe param; value is encoded', () => {
    const page = ADMIN_PAGES.find((p) => p.path === '/admin/authorities/[id]')!;
    expect(buildAdminHref(page, {}).ok).toBe(false);
    expect(buildAdminHref(page, { id: '../x' }).ok).toBe(false);
    expect(buildAdminHref(page, { id: 'abc_123' })).toEqual({ ok: true, href: '/admin/authorities/abc_123' });
  });
  it('keeps the page\'s own ?type= and validates extra query keys', () => {
    const page = adminPageById('admin/authority/units?type=municipal')!;
    expect(buildAdminHref(page)).toEqual({ ok: true, href: '/admin/authority/units?type=municipal' });
    expect(buildAdminHref(page, {}, { tab: 'x' })).toEqual({ ok: true, href: '/admin/authority/units?type=municipal&tab=x' });
    expect(buildAdminHref(page, {}, { 'bad key': 'x' }).ok).toBe(false);
  });
});
