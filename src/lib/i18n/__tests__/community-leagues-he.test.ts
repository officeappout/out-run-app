/**
 * Namespace `community`, keys `leagues.*` (i18n wave 2, the league boards in
 * src/features/arena/components: LeagueBoard, LeagueCarousel, LeaguesTabChrome, LeagueFilterSheet,
 * OpponentPickerSheet, UnitLeagueTable, GroupLeagueStatsBoard + the helpers format-leaderboard-score,
 * league-board-logic, scope-category-unit-label). Every key returns exactly what the code rendered
 * before the extraction: the `old` side is the original literal / template (or the old helper,
 * re-declared verbatim).
 *
 * The parity snapshots (src/features/arena/components/__tests__/league-boards-i18n-*.test.tsx) cover
 * the keys in context; this test also pins every select / plural branch, counts ≥ 1000 (no
 * thousands separator), the helpers' every mode (their only callers today are outside this PR and
 * use the Hebrew-catalog default) and keys a static render can't reach.
 */
import { describe, expect, it, vi } from 'vitest';

// Pace formatting is ranking.service's (outside this PR) — same function both sides; the real module pulls Firebase in.
vi.mock('@/features/arena/services/ranking.service', () => ({
  formatPaceSecPerKm: (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
}));
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';
import { formatLeaderboardScore, type LeaderboardMode } from '@/features/arena/components/format-leaderboard-score';
import { formatNextRankLine, formatTimeLeft, splitScore } from '@/features/arena/components/league-board-logic';
import { CATEGORY_UNIT_LABEL, CATEGORY_UNIT_LABEL_KEYS } from '@/features/arena/components/scope-category-unit-label';

const t = makeT('he', community);
type Key = keyof typeof he;

const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ── The pre-extraction helpers, verbatim ─────────────────────────────────────
function oldFormatLeaderboardScore(value: number, mode: LeaderboardMode, isSegmentMode?: boolean): string {
  if (mode === 'general') return `${value} ימים`;
  if (mode === 'steps')   return `${value.toLocaleString('he-IL')} צעדים`;
  if (mode === 'distance') return `${value.toLocaleString('he-IL', { maximumFractionDigits: 1 })} ק״מ`;
  if (mode === 'running' && isSegmentMode) {
    return value > 0 ? `${pace(value)} /ק״מ` : '—';
  }
  if (mode === 'strength') return `${value.toLocaleString('he-IL')} נק' כוח`;
  if (mode === 'running')  return `${value.toLocaleString('he-IL')} נק' ריצה`;
  return value.toLocaleString('he-IL');
}
function oldFormatTimeLeft(end: Date, now: Date): string {
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 'התקופה הסתיימה';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return days === 1 ? 'נשאר יום אחד' : `נשארו ${days} ימים`;
  }
  if (hours >= 2) return `נשארו ${hours} שעות`;
  if (hours === 1) return 'נשארה שעה אחת';
  return 'נשארה פחות משעה';
}

describe('community (he) leagues.* — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the keys this test pins (count per prefix)', () => {
    // batch x's sub-prefixes are pinned by community-leagues-x-he.test.ts.
    const batchX = /^leagues\.(individual|sheets|scopes|battle|national|groupBoard)\./;
    expect(Object.keys(he).filter((k) => k.startsWith('leagues.') && !batchX.test(k)).length).toBe(79);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['leagues.categoryUnit.overall', "נק' פעילות"],
      ['leagues.categoryUnit.cardio', "נק' ריצה"],
      ['leagues.categoryUnit.strength', "נק' כוח"],
      ['leagues.timeLeft.ended', 'התקופה הסתיימה'],
      ['leagues.timeLeft.underHour', 'נשארה פחות משעה'],
      ['leagues.board.firstPlace', 'מקום 1'],
      ['leagues.board.podium', 'שלושת הראשונים'],
      ['leagues.board.mine', 'שלך'],
      ['leagues.picker.rank', 'דירוג'],
      ['leagues.picker.members', 'חברים'],
      ['leagues.picker.create.title', 'פתיחת ליגה חדשה'],
      ['leagues.picker.create.sub', 'שכונה, חברים, משפחה, עבודה, או כניסה עם קוד'],
      ['leagues.selector.placeholder', 'בחירת ליגה'],
      ['leagues.selector.rank', 'דירוג'],
      ['leagues.filter.title', 'פילטרים'],
      ['leagues.filter.reset', 'איפוס'],
      ['leagues.filter.close', 'סגירה'],
      ['leagues.filter.apply', 'החל'],
      ['leagues.filter.genderTitle', 'מגדר'],
      ['leagues.filter.genderPill.all', 'הכל'],
      ['leagues.filter.genderPill.male', 'גברים'],
      ['leagues.filter.genderPill.female', 'נשים'],
      ['leagues.opponent.title', 'בחירת יריבה לקרב'],
      ['leagues.opponent.close', 'סגירה'],
      ['leagues.opponent.fixed', '📌 קבוע'],
      ['leagues.opponent.versus', 'נגד:'],
      ['leagues.opponent.firstPlace', 'המקום הראשון'],
      ['leagues.units.title', 'תחרות בין יחידות'],
      ['leagues.units.noData', 'אין נתונים עדיין'],
      ['leagues.units.refresh', 'רענון'],
      ['leagues.units.range.myBattalionCompanies', 'הפלוגות בגדוד שלי'],
      ['leagues.units.range.myBrigadeBattalions', 'הגדודים בחטיבה שלי'],
      ['leagues.units.range.allCompanies', 'כל הפלוגות בארץ'],
      ['leagues.units.range.allBrigades', 'כל החטיבות בארץ'],
      ['leagues.units.steps', 'צעדים'],
      ['leagues.units.myUnit', '(היחידה שלך)'],
      ['leagues.units.empty.title', 'אין עדיין נתונים בטווח הזה'],
      ['leagues.units.empty.body', 'ברגע שיהיו מספיק מתאמנים פעילים, הדירוג יופיע כאן'],
      ['leagues.group.subtitle', 'נקודות, צעדים וק״מ'],
      ['leagues.group.refresh', 'רענון'],
      ['leagues.group.empty.body', 'אימונים וצעדים של חברי הקבוצה נספרים כאן (הצעדים מתעדכנים פעם בשעה).'],
      ['leagues.group.tile.points', 'נקודות'],
      ['leagues.group.tile.steps', 'מהצעדים'],
      ['leagues.group.tile.km', 'ק״מ'],
      ['leagues.group.sortLabel', 'דירוג לפי'],
      ['leagues.group.sort.points', 'נקודות'],
      ['leagues.group.sort.km', 'ק״מ'],
      ['leagues.group.noKm.body', 'הצעדים וההליכות מתעדכנים פעם בשעה.'],
      ['leagues.group.me', '(את/ה)'],
      ['leagues.group.unit.points', 'נקודות'],
      ['leagues.group.unit.km', 'ק״מ'],
      ['leagues.group.showLess', 'הצג פחות'],
      ['leagues.group.note.km', 'הק״מ מוצגים בשביל הכיף — הם לא משנים את הנקודות.'],
      ['leagues.group.note.points', '3 נקודות על כל 1,000 צעדים ביום, ועוד נקודות על כל דקת אימון.'],
    ];
    for (const [key, old] of cases) expect([key, t(key)]).toEqual([key, old]);
  });

  it('values (counts ≥ 1000 stay unseparated)', () => {
    for (const n of [0, 7, 1234]) {
      expect(t('leagues.opponent.place', { rank: String(n) })).toBe(`מקום #${n}`);
      expect(t('leagues.units.active', { count: String(n) })).toBe(`${n} פעילים`);
      expect(t('leagues.units.activeParticipants', { count: String(n) })).toBe(`${n} משתתפים פעילים`);
      expect(t('leagues.units.belowFloor.body', { count: String(n) })).toBe(`${n} משתתפים פעילים כרגע — שלחו לחברים ביחידה!`); // gender batch 2: other = neutral
      expect(t('leagues.units.belowFloor.title', { needed: String(n), name: 'פלוגה ג' })).toBe(`עוד ${n} מ${'פלוגה ג'} וייפתח הדירוג`);
      expect(t('leagues.group.showAll', { count: String(n) })).toBe(`הצג את כל ה-${n}`);
    }
    // Gender batch 2 (21.10.2026): male keeps the old text, other is neutral.
    expect(t('leagues.opponent.subtitle', { name: 'נווה {צדק}', gender: 'male' })).toBe(`אתה נשאר ${'נווה {צדק}'} — רק היריבה מתחלפת`);
    expect(t('leagues.opponent.subtitle', { name: 'נווה צדק', gender: 'female' })).toBe('את נשארת נווה צדק — רק היריבה מתחלפת');
    expect(t('leagues.opponent.subtitle', { name: 'נווה צדק', gender: 'other' })).toBe('נווה צדק לא משתנה — רק היריבה מתחלפת');
    expect(t('leagues.units.updated', { when: 'לפני 5 דקות' })).toBe(`עודכן ${'לפני 5 דקות'}`);
    expect(t('leagues.units.kmPerDay', { km: '5.4' })).toBe(`${'5.4'} ק״מ ליום`);
    expect(t('leagues.group.sub.points', { points: '1,234' })).toBe(`${'1,234'} נקודות`);
    expect(t('leagues.group.sub.steps', { points: '1,234' })).toBe(`${'1,234'} מהצעדים`);
    expect(t('leagues.group.sub.km', { km: '12.3' })).toBe(`${'12.3'} ק״מ`);
  });

  it('window select (monthly / weekly)', () => {
    for (const w of ['weekly', 'monthly'] as const) {
      const windowLabel = w === 'monthly' ? 'החודש' : 'השבוע';
      expect(t('leagues.group.title', { window: w })).toBe(`הקבוצה ${windowLabel}`);
      expect(t('leagues.group.empty.title', { window: w })).toBe(`עוד אין פעילות בקבוצה ${windowLabel}`);
      expect(t('leagues.group.noKm.title', { window: w })).toBe(`עוד אין ק״מ ${windowLabel}`);
    }
  });

  it('formatLeaderboardScore / splitScore: every mode, default (Hebrew catalog) and passed t', () => {
    const modes: LeaderboardMode[] = ['general', 'running', 'strength', 'steps', 'distance'];
    for (const mode of modes) {
      for (const v of [0, 1, 12.34, 1234, 98765.4]) {
        for (const seg of [false, true]) {
          const old = oldFormatLeaderboardScore(v, mode, seg);
          expect(formatLeaderboardScore(v, mode, seg)).toBe(old);
          expect(formatLeaderboardScore(v, mode, seg, t)).toBe(old);
          const i = old.indexOf(' ');
          const split = i <= 0 ? { value: old, unit: '' } : { value: old.slice(0, i), unit: old.slice(i + 1) };
          expect(splitScore(v, mode, seg, t)).toEqual(split);
        }
      }
    }
  });

  it('formatNextRankLine + formatTimeLeft: every branch', () => {
    const target = { targetName: 'נועה', targetRank: 2, needed: 1, progress: 0.5 };
    for (const mode of ['general', 'steps', 'distance', 'strength', 'running'] as LeaderboardMode[]) {
      for (const needed of [1, 2, 0.3, 1500]) {
        const tg = { ...target, needed };
        const old =
          mode === 'general' && needed === 1
            ? `עוד יום אחד כדי לעקוף את ${tg.targetName}`
            : `עוד ${oldFormatLeaderboardScore(needed, mode)} כדי לעקוף את ${tg.targetName}`;
        expect(formatNextRankLine(tg, mode)).toBe(old);
        expect(formatNextRankLine(tg, mode, t)).toBe(old);
      }
    }
    const now = new Date('2026-10-19T09:00:00');
    for (const h of [-1, 0, 0.5, 1, 1.9, 2, 23, 24, 47, 48, 24 * 30]) {
      const end = new Date(now.getTime() + h * 3_600_000);
      expect(formatTimeLeft(end, now)).toBe(oldFormatTimeLeft(end, now));
      expect(formatTimeLeft(end, now, t)).toBe(oldFormatTimeLeft(end, now));
    }
  });

  it('CATEGORY_UNIT_LABEL (kept for unmigrated callers) reads the same Hebrew as before', () => {
    expect(CATEGORY_UNIT_LABEL).toEqual({ overall: "נק' פעילות", cardio: "נק' ריצה", strength: "נק' כוח" });
    for (const [c, key] of Object.entries(CATEGORY_UNIT_LABEL_KEYS)) {
      expect(t(key)).toBe(CATEGORY_UNIT_LABEL[c as keyof typeof CATEGORY_UNIT_LABEL]);
    }
  });
});
