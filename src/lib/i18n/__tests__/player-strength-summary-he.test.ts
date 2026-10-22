/**
 * Namespace `player`, keys `strengthSummary.*` / `dopamine.*` (i18n wave 2 batch z: the strength
 * post-workout screens — StrengthSummaryView + shared children, the v2 sections, TimedResultCardsV2 /
 * timed-summary.model, level-ring.util, StrengthDopamineScreen). Every key returns exactly what the code
 * rendered before the extraction: the `old` side is the original literal / template, or the old
 * ternary / map re-declared verbatim.
 *
 * The parity snapshots (src/features/workout-engine/components/strength/__tests__/strength-summary-i18n-parity.test.tsx)
 * cover the keys in context; this test also pins what a static render can't reach (the dopamine status
 * line after its timers, every ordinal, counts ≥ 1000).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/player.json';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);
type Key = keyof typeof he;

describe('player (he) strength summary + dopamine screen — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the keys this test pins (count per prefix)', () => {
    const PREFIXES: Record<string, number> = { strengthSummary: 67, dopamine: 8 };
    for (const [prefix, n] of Object.entries(PREFIXES)) {
      expect([prefix, Object.keys(he).filter((k) => k.startsWith(`${prefix}.`)).length]).toEqual([prefix, n]);
    }
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['strengthSummary.header.title', 'סיכום אימון'],
      ['strengthSummary.programFallback', 'תוכנית אימון'],
      ['strengthSummary.exercisesTitle', 'פירוט התרגילים'],
      ['strengthSummary.footer.deleteAria', 'מחק אימון'],
      ['strengthSummary.footer.close', 'סגור'],
      ['strengthSummary.footer.saving', 'שומר...'],
      ['strengthSummary.footer.thanks', 'תודה על האימון!'],
      ['strengthSummary.hero.duration', 'זמן אימון'],
      ['strengthSummary.hero.done', 'הושלם'],
      ['strengthSummary.hero.sets', 'סטים'],
      ['strengthSummary.week.activeMinutes', 'דקות פעילות'],
      ['strengthSummary.phase.warmup', 'חימום'],
      ['strengthSummary.phase.main', 'חלק עיקרי'],
      ['strengthSummary.phase.cooldown', 'שחרור ומתיחות'],
      ['strengthSummary.protocol.superset', 'סופר סט'],
      ['strengthSummary.protocol.pyramid', 'פירמידה'],
      ['strengthSummary.protocol.tabata', 'טבטה'],
      ['strengthSummary.protocol.emom', 'EMOM'],
      ['strengthSummary.protocol.amrap', 'AMRAP'],
      ['strengthSummary.breakdown.empty', 'אין תרגילים להצגה'],
      ['strengthSummary.timed.amrap.partial', 'חלקי'],
      ['strengthSummary.timed.emom.done', 'הושלם'],
      ['strengthSummary.timed.emom.reps', 'חזרות'],
      ['strengthSummary.timed.emom.workPerMinute', 'עבודה בדקה'],
      ['strengthSummary.timed.emom.minuteByMinute', 'דקה אחר דקה'],
      ['strengthSummary.timed.emom.legend', 'גובה = זמן עבודה מתוך הדקה'],
      ['strengthSummary.timed.tabata.title', 'טבטה'],
      ['strengthSummary.goals.title', 'יעדי רמה'],
      ['strengthSummary.goals.total', 'סה״כ יעדים באימון'],
      ['strengthSummary.suggestions.titleOne', 'נראה שאתם מוכנים לעוד תוכנית'],
      ['strengthSummary.suggestions.titleMany', 'נראה שאתם מוכנים לעוד כמה תוכניות'],
      ['strengthSummary.suggestions.accept', 'בואו נבדוק'],
      ['strengthSummary.suggestions.dismissAria', 'דחה הצעה'],
      ['strengthSummary.lifestyle.title', 'עבודה מעולה!'],
      ['strengthSummary.lifestyle.subtitle', 'בוא נשמור על המומנטום הזה'],
      ['strengthSummary.lifestyle.cta', 'בואו נקבע לו״ז'],
      ['strengthSummary.lifestyle.later', 'אולי מאוחר יותר'],
      ['strengthSummary.email.title', 'גבה את האימון שלך'],
      ['strengthSummary.email.subtitle', 'התחבר כדי לא לאבד את ההתקדמות'],
      ['strengthSummary.email.google', 'המשך עם Google'],
      ['strengthSummary.email.apple', 'המשך עם Apple'],
      ['strengthSummary.email.later', 'אולי מאוחר יותר'],
      ['strengthSummary.levelUp.title', 'עלית רמה!'],
      ['strengthSummary.levelUp.cta', 'המשך לרמה הבאה'],
      ['dopamine.status.analyzing', 'מנתח ביצועים...'],
      ['dopamine.status.step1', 'סחטיין על הביצוע!'],
      ['dopamine.status.step2', 'ממשיכים להתקדם!'],
      ['dopamine.status.complete', 'האימון הסתיים!'],
      [
        'dopamine.celebrationDefault',
        'כל הכבוד, איזה אנרגיה! קיבלתם אחוזים שמקדמים אתכם בדרך לרמה הבאה. המשיכו כך – וכשתגיעו ל-100%, תעלו רמה!',
      ],
      ['dopamine.share', 'שיתוף התקדמות'],
      ['dopamine.back', 'חזרה ללוח בקרה'],
    ];
    for (const [key, old] of cases) expect([key, t(key)]).toEqual([key, old]);
  });

  it('values (counts ≥ 1000 passed as strings stay unseparated)', () => {
    for (const n of [0, 1, 7, 25, 1234]) {
      expect(t('strengthSummary.levelRing.level', { level: String(n), max: String(25) })).toBe(`רמה ${n}/${25}`);
      expect(t('strengthSummary.levelRing.next', { remaining: String(n), next: String(n + 1) })).toBe(`עוד ${n}% לרמה ${n + 1}`);
      expect(t('strengthSummary.hero.calories', { calories: String(n) })).toBe(`≈ ${n} קלוריות (הערכה)`);
      expect(t('strengthSummary.hero.reps', { reps: String(n) })).toBe(`${n} חזרות`);
      expect(t('strengthSummary.phase.setsOf', { done: String(n), planned: String(n + 1) })).toBe(`${n}/${n + 1} סטים`);
      expect(t('strengthSummary.phase.sets', { done: String(n) })).toBe(`${n} סטים`);
      expect(t('strengthSummary.phase.reps', { reps: String(n) })).toBe(`${n} חזרות`);
      expect(t('strengthSummary.timed.amrap.roundLabel', { n: String(n) })).toBe(`סבב ${n}`);
      expect(t('strengthSummary.timed.tabata.line', { done: String(n), total: String(8) })).toBe(`${n}/${8} אינטרוולים`);
      expect(t('strengthSummary.levelUp.level', { level: String(n) })).toBe(`רמה ${n}`);
      expect(t('dopamine.level', { level: String(n) })).toBe(`רמה ${n}`);
    }
    expect(t('strengthSummary.hero.workTime', { time: '1:05' })).toBe('זמן עבודה 1:05');
    expect(t('strengthSummary.timed.amrap.title', { title: 'AMRAP 10′' })).toBe('התוצאה שלך · AMRAP 10′');
    expect(t('strengthSummary.timed.emom.doneTitle', { title: 'EMOM 12′' })).toBe('דקות שהושלמו בזמן · EMOM 12′');
    expect(t('strengthSummary.timed.emom.avgRest', { rest: '0:14' })).toBe('מנוחה ממוצעת 0:14');
    expect(t('strengthSummary.timed.emom.barsAria', { done: '11/12' })).toBe(`${'11/12'} דקות בזמן`);
    const note = 'דקה 10 (כתום): 8 מתוך 10 חזרות';
    expect(t('strengthSummary.timed.emom.legendWithNote', { note })).toBe(`גובה = זמן עבודה מתוך הדקה${`. ${note}`}`);
  });

  it('branches: exercise count, rounds, ordinals, EMOM note, goal unit', () => {
    for (const n of [0, 1, 2, 12]) {
      expect(t('strengthSummary.phase.exerciseCount', { count: n, n: String(n) })).toBe(`${n} ${n === 1 ? 'תרגיל' : 'תרגילים'}`);
      expect(t('strengthSummary.timed.amrap.rounds', { count: n })).toBe(n === 1 ? 'סבב מלא' : 'סבבים מלאים');
    }
    const ORDINAL = ['', 'הראשון', 'השני', 'השלישי', 'הרביעי', 'החמישי', 'השישי', 'השביעי', 'השמיני', 'התשיעי', 'העשירי'];
    const oldOrdinal = (n: number) => (ORDINAL[n] ? `בסבב ${ORDINAL[n]}` : `בסבב ה-${n}`);
    for (let n = 0; n <= 14; n++) expect(t('strengthSummary.timed.roundOrdinal', { n: String(n) })).toBe(oldOrdinal(n));
    expect(t('strengthSummary.timed.roundOrdinal', { n: String(1234) })).toBe(oldOrdinal(1234));
    expect(t('strengthSummary.timed.amrap.extra', { reps: '16', ordinal: oldOrdinal(5) })).toBe(`ועוד ${16} חזרות ${oldOrdinal(5)}`);

    const oldNote = (minute: number, reps: number, target?: number) =>
      `דקה ${minute} (כתום): ${reps}${target ? ` מתוך ${target}` : ''} חזרות`;
    expect(t('strengthSummary.timed.emom.note', { minute: '2', reps: '0' })).toBe(oldNote(2, 0));
    expect(t('strengthSummary.timed.emom.noteWithTarget', { minute: '10', reps: '8', target: '10' })).toBe(oldNote(10, 8, 10));

    for (const unit of ['reps', 'seconds', undefined]) {
      expect(t('strengthSummary.goals.progress', { best: '12', target: '1234', unit: unit === 'reps' ? 'reps' : 'other' })).toBe(
        `12/1234 ${unit === 'reps' ? 'חזרות' : 'שניות'}`,
      );
    }
  });
});
