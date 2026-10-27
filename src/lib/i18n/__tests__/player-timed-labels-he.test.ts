/**
 * i18n batch aw (namespace `player`, `timedLabels.*`): every key equals the literal / template the timed label builders carried
 * before the extraction (pasted verbatim), including every select branch and counts >= 1000 (no thousands separator).
 * The builders' output over every engine state is pinned by timed/__tests__/aw-i18n-parity.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);
type PKey = Parameters<typeof t>[0];
const check = (rows: Array<[PKey, string, Record<string, unknown>?]>) => {
  for (const [key, old, values] of rows) expect(t(key, values), key).toBe(old);
};
const sideOld = (side: string) => (side === 'right' ? ' · ימין' : side === 'left' ? ' · שמאל' : '');
const word = (n: number, one: string, many: string) => (n === 1 ? one : many);

describe('timedLabels: plain strings', () => {
  it('match the old literals', () => {
    check([
      ['timedLabels.unit.reps', 'חזרות'], ['timedLabels.unit.sec', 'שנ׳'], ['timedLabels.prefix.finisher', 'פינישר'],
      ['timedLabels.clock.over', 'הזמן נגמר'], ['timedLabels.clock.left', 'נותרו'],
      ['timedLabels.hint.emomRest', 'סיימת? מה שנשאר מהדקה הוא המנוחה'], ['timedLabels.hint.amrapFixed', 'יעד קבוע בכל סבב'],
      ['timedLabels.next.amrap', 'הבא בסבב'], ['timedLabels.next.tabata', 'התרגיל הבא'],
      ['timedLabels.info.amrap.title', 'מה זה AMRAP?'], ['timedLabels.info.emom.title', 'מה זה EMOM?'], ['timedLabels.info.tabata.title', 'מה זה טבטה?'],
      ['timedLabels.info.amrap.line3', 'סופרים סבבים מלאים, ובסוף מוסיפים את החזרות של הסבב שלא נגמר.'],
      ['timedLabels.info.amrap.line4', 'אין מנוחה קבועה: נחים כשצריך, השעון ממשיך.'],
      ['timedLabels.info.emom.line2', 'מסיימים את המשימה ולוחצים סיימתי — מה שנשאר מהזמן הוא המנוחה.'],
      ['timedLabels.info.emom.line3', 'לא הספקת עד הסוף? רושמים כמה עשית, והמשימה הבאה מתחילה בזמן.'],
      ['timedLabels.info.tabata.line2', 'הטיימר מוביל: עוברים לבד בין עבודה למנוחה, אין צורך ללחוץ.'],
      ['timedLabels.info.tabata.line3', 'עובדים בעצימות גבוהה לאורך כל האינטרוול.'],
      ['timedLabels.ready.amrapEach', 'בכל סבב'], ['timedLabels.ready.emomOdd', 'דקות אי-זוגיות'], ['timedLabels.ready.emomEven', 'דקות זוגיות'], ['timedLabels.ready.emomEveryMinute', 'כל דקה'],
      ['timedLabels.mini.ready', 'מוכן להתחלה'], ['timedLabels.now', 'עכשיו'], ['timedLabels.list.pillDone', 'בוצע'],
      ['timedLabels.playlist.rule.amrap', 'כמה שיותר סבבים'], ['timedLabels.playlist.rule.emom', 'משימה בתחילת כל דקה'], ['timedLabels.playlist.rule.tabata', 'הטיימר מוביל'],
    ]);
  });
});

describe('timedLabels: values and branches', () => {
  it('titles, eyebrows, captions, hints', () => {
    check([
      ['timedLabels.title.tabata', 'טבטה 20/10', { work: '20', rest: '10' }],
      ['timedLabels.title.minutes', 'AMRAP 10′', { format: 'amrap', minutes: '10' }],
      ['timedLabels.title.minutes', 'EMOM 12′', { format: 'emom', minutes: '12' }],
      ['timedLabels.target.text', '12 חזרות', { value: '12', unit: 'חזרות' }],
      ['timedLabels.eyebrow.amrap', `סבב ${3} · תרגיל ${1} מתוך ${2}`, { round: '3', item: '1', total: '2' }],
      ['timedLabels.eyebrow.emom', 'דקה 5/12', { round: '5', total: '12' }],
      ['timedLabels.eyebrow.prefixed', 'פינישר · דקה 5/12', { prefix: 'פינישר', text: 'דקה 5/12' }],
      ['timedLabels.clock.leftPrefixed', 'פינישר · נותרו', { prefix: 'פינישר' }],
      ['timedLabels.hint.emomLast', 'עוד 4 שנ׳ — לא סיימת? נרשום כמה הספקת', { sec: '4' }],
      ['timedLabels.next.emom', 'דקה 6', { n: '6' }],
      ['timedLabels.emom.restLine', 'סיימת ב-0:39 · 21 שנ׳ מנוחה', { work: '0:39', rest: '21' }],
      ['timedLabels.round.line', '2:38 לסבב', { time: '2:38' }],
      ['timedLabels.round.faster', '2:34 לסבב · מהיר ב-0:04 מהסבב הקודם', { time: '2:34', diff: '0:04' }],
      ['timedLabels.round.slower', '2:34 לסבב · איטי ב-0:04 מהסבב הקודם', { time: '2:34', diff: '0:04' }],
    ]);
    for (const side of ['right', 'left', '', 'other']) {
      expect(t('timedLabels.eyebrow.tabata', { round: '3', total: '8', side })).toBe(`אינטרוול ${3}/${8}${sideOld(side)}`);
      expect(t('timedLabels.list.tabataInterval', { n: '4', side })).toBe(`אינטרוול ${4}${sideOld(side)}`);
    }
  });

  it('format explainers', () => {
    for (const n of [0, 1, 2, 4, 1000, 12345]) expect(t('timedLabels.info.amrap.line2', { n: String(n) })).toBe(`סבב = ${n === 1 ? 'התרגיל' : `${n} התרגילים לפי הסדר`}. מסיימים אחד ועוברים מיד לבא.`);
    for (const m of [1, 10, 1000]) expect(t('timedLabels.info.amrap.line1', { minutes: String(m) })).toBe(`AMRAP = כמה שיותר סבבים בזמן הקצוב. כאן: ${m} דקות.`);
    for (const [sec, times] of [[60, 12], [45, 10], [30, 1000], [1000, 1]]) {
      const every = sec === 60 ? 'כל דקה' : `כל ${sec} שנ׳`;
      expect(t('timedLabels.info.emom.line1', { sec: String(sec), times: String(times) })).toBe(`EMOM = ${every} מתחילים משימה חדשה. כאן: ${times} פעמים.`);
    }
    expect(t('timedLabels.info.tabata.line1', { work: '20', rest: '10', rounds: '1200' })).toBe(`${20} שניות עבודה, ${10} שניות מנוחה — ${1200} אינטרוולים.`);
  });

  it('result, ready and list lines (counts 0 / 1 / 2 / many / >= 1000)', () => {
    for (const full of [0, 1, 2, 4, 1000, 12345]) {
      const rounds = `${full} ${full === 1 ? 'סבב מלא' : 'סבבים מלאים'}`;
      expect(t('timedLabels.result.amrap', { count: String(full) })).toBe(rounds);
      for (const extra of [1, 2, 16, 1500]) expect(t('timedLabels.result.amrapExtra', { count: String(full), extra: String(extra) })).toBe(`${rounds} · ועוד ${extra} חזרות`);
    }
    expect(t('timedLabels.result.emom', { done: '11', total: '1000' })).toBe(`${11}/${1000} דקות בזמן`);
    expect(t('strengthSummary.timed.tabata.line', { done: '8', total: '1200' })).toBe(`${8}/${1200} אינטרוולים`);
    check([
      ['timedLabels.ready.amrapTargetEach', '12 חזרות · בכל סבב', { target: '12 חזרות' }],
      ['timedLabels.ready.emomEveryN', 'כל 5 דקות', { n: '5' }],
      ['timedLabels.ready.emomWithTarget', 'דקות אי-זוגיות · 12 חזרות', { which: 'דקות אי-זוגיות', target: '12 חזרות' }],
      ['timedLabels.ready.tabata', '30 שנ׳ לכל צד', { sec: '30', unilateral: 'yes' }],
      ['timedLabels.ready.tabata', '30 שנ׳', { sec: '30', unilateral: 'no' }],
      ['timedLabels.mini.line', 'סבב 3 · תרגיל 1 מתוך 2 · נותרו 05:48', { eyebrow: 'סבב 3 · תרגיל 1 מתוך 2', caption: 'נותרו', clock: '05:48' }],
      ['timedLabels.list.round', 'סבב 3', { n: '3' }],
      ['timedLabels.list.minute', 'דקה 7', { n: '7' }],
      ['timedLabels.list.minuteTarget', 'דקה 3 · 12 חזרות', { n: '3', target: '12 חזרות' }],
      ['timedLabels.list.emomSummary', '2 תרגילים · 12 דקות', { items: '2', minutes: '12' }],
      ['timedLabels.list.tabataItem', '20 שנ׳ · 3/8', { sec: '20', done: '3', total: '8' }],
      ['timedLabels.list.tabataSummary', '20 שנ׳ עבודה · 10 שנ׳ מנוחה', { work: '20', rest: '10' }],
      ['timedLabels.playlist.doneDetail', '31 חזרות · ×3', { value: '31 חזרות', count: '3' }],
      ['timedLabels.prompt.eyebrow.amrap', 'הזמן נגמר · שכיבות סמיכה בסבב 5', { name: 'שכיבות סמיכה', round: '5' }],
      ['timedLabels.prompt.eyebrow.emom', 'דקה 5 · סקוואט', { minute: '5', name: 'סקוואט' }],
      ['strengthSummary.hero.reps', '1500 חזרות', { reps: '1500' }],
    ]);
    for (const n of [0, 1, 2, 10, 1000, 54321]) {
      expect(t('timedLabels.list.basket', { count: String(n) })).toBe(`${n} ${word(n, 'פריט', 'פריטים')} בסל`);
      expect(t('timedLabels.list.reps', { count: String(n) })).toBe(`${n} ${word(n, 'חזרה', 'חזרות')}`);
      expect(t('timedLabels.list.minutesDone', { count: String(n) })).toBe(`${n} ${word(n, 'דקה הושלמה', 'דקות הושלמו')}`);
      expect(t('timedLabels.list.roundsSummary', { rounds: String(n), reps: String(1000 + n) })).toBe(`${n} ${word(n, 'סבב מלא', 'סבבים מלאים')} · ${1000 + n} ${word(1000 + n, 'חזרה', 'חזרות')}`);
    }
    expect(t('timedLabels.list.roundsSummary', { rounds: '1', reps: '1' })).toBe('1 סבב מלא · 1 חזרה');
  });
});
