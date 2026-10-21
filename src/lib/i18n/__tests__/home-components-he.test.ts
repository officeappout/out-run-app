/**
 * Namespace `home` — the home screen components in src/features/home/components (i18n wave 2): every Hebrew key
 * returns exactly what the code rendered before the extraction. The `old` side of each case is the original
 * literal / template expression, copied verbatim from the components (git show origin/main:<file>).
 *
 * The parity snapshots (src/features/home/components/__tests__/home-i18n*-parity.test.tsx) cover the keys in
 * context; this test also pins every select / gender branch, counts >= 1000 and the copy no render reaches
 * (the add-persona toast, the classic move sheet's actions behind the portal stub, the planner's collapse label).
 * Own file (not a describe in a shared home-he.test.ts) so parallel home batches don't conflict.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';
import {
  PROGRAM_START_COPY,
  PROGRAM_START_HINT,
  ADD_TRACK_CTA,
  ADD_TRACK_DISMISS,
  PICK_PROGRAM_STRIP_HINT,
} from '@/features/home/components/start-cards/program-start-copy';

const t = makeT('he', home);
type Key = keyof typeof he;

describe('home (he) — home components, byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['hero.difficulty.easy', 'קל'],
      ['hero.difficulty.medium', 'בינוני'],
      ['hero.difficulty.hard', 'מאתגר'],
      ['hero.recovery', '🧘 התאוששות פעילה'],
      ['hero.bodyweight', 'ללא ציוד – משקל גוף'],
      ['buildCustom.whatsYourOut', 'אז מה ה-OUT שלך היום? ✦'],
      ['buildCustom.yourself', 'רוצה לבנות אימון בעצמך? ✦'],
      ['programStart.title', 'בוא נבנה לך תוכנית'],
      ['programStart.hint', 'לא בטוח? אפשר את שניהם'],
      ['programStart.strength.title', 'תוכנית כוח'],
      ['programStart.strength.valueLine', 'כוח, סקילים ויציבה — מותאם לרמה שלך'],
      ['programStart.strength.chip', 'שאלון · 2 דק׳'],
      ['programStart.strength.addTitle', 'רוצה להוסיף כוח?'],
      ['programStart.strength.addBody', '2 אימונים קצרים ישפרו את הריצה. הריצות נשארות.'],
      ['programStart.running.title', 'תוכנית ריצה'],
      ['programStart.running.valueLine', 'מ-0 ל-5 ק״מ או מהר יותר — תוכנית שבועית'],
      ['programStart.running.chip', 'שאלון · 2 דק׳'],
      ['programStart.running.addTitle', 'רוצה להוסיף ריצה?'],
      ['programStart.running.addBody', '3 ריצות קצרות בשבוע, סביב הכוח. השבוע שלך נשאר.'],
      ['programStart.addCta', 'בוא נוסיף · 2 דק׳'],
      ['programStart.addDismiss', 'לא עכשיו'],
      ['programStart.pickStripHint', 'בחר תוכנית למטה'],
      ['addStrength.title', 'תוכנית כוח'],
      ['addStrength.body', 'אימון מותאם אישית למטרות שלך'],
      ['nearbyGroups.title', 'קבוצות קרובות אליך'],
      ['nearbyGroups.filter', 'סנן קבוצות'],
      ['nearbyGroups.all', 'הכל ›'],
      ['nearbyGroups.chip.all', 'הכל'],
      ['nearbyGroups.chip.walking', 'הליכה'],
      ['nearbyGroups.chip.running', 'ריצה'],
      ['nearbyGroups.chip.calisthenics', 'כוח'],
      ['nearbyGroups.chip.community', 'קהילתי'],
      ['nearbyGroups.emptyCategory', 'אין קבוצות בקטגוריה זו באזורך'],
      ['personas.title', 'הפרסונות שלי'],
      ['personas.privacy', 'הפרטים כאן פרטיים ולא מופיעים בפרופיל הציבורי שלך.'],
      ['personas.row.loading', 'טוען...'],
      ['personas.row.stale', 'היחידה כבר לא קיימת — הקש לעדכון'],
      ['personas.row.pending', 'טרם הושלם — הקש להשלמה'],
      ['personas.addButton', 'הוסף פרסונה'],
      ['personas.pickerTitle', 'הוסף פרסונה'],
      ['personas.confirmRemove.cancel', 'ביטול'],
      ['personas.confirmRemove.remove', 'הסר'],
      ['racePrediction.empty.title', 'רוצים תחזית למרוץ?'],
      ['racePrediction.empty.body', 'ספרו לנו על ריצה אחרונה ונחשב'],
      ['racePrediction.empty.cta', 'בואו נתחיל'],
      ['racePrediction.title', 'תחזית למרוץ'],
      ['racePrediction.basedOnRuns', 'מתעדכן לפי הריצות שלך'],
      ['racePrediction.infoAria', 'איך מחושבת התחזית'],
      ['racePrediction.info.runs', ' קצב הבסיס מתעדכן אחרי כל 3 אימוני איכות מהתוכנית (אינטרוולים / טמפו), לפי הקצב שרצת בפועל.'],
      ['racePrediction.info.noRuns', ' אחרי 3 אימוני איכות מהתוכנית (אינטרוולים / טמפו) התחזית תתעדכן לפי הקצב שרצת בפועל.'],
      ['runCard.title.today', 'הריצה של היום'],
      ['runCard.title.next', 'הריצה הבאה'],
      ['runCard.tapHint', 'לחיצה לפרטי האימון'],
      ['runCard.skip', 'אין לי כוח היום — דלג לעוד'],
      ['runCard.undoSkip', 'ביטול — אני בכל זאת רוצה להתאמן'],
      ['walkCard.kicker.today', 'יום הליכה · האימון וטבעת הצעדים יחד'],
      ['walkCard.kicker.gap', 'השלמת הצעדים'],
      ['walkCard.title.today', 'ההליכה של היום'],
      ['walkCard.title.gap', 'הליכה קצרה'],
      ['walkCard.type.today', 'הליכה'],
      ['walkCard.type.gap', 'הליכה קצרה'],
      ['walkCard.defaultTitle', 'הליכה מהירה'],
      ['walkCard.start.today', 'צא להליכה'],
      ['walkCard.start.gap', 'יאללה'],
      ['runWeekCard.start', 'התחל'],
      ['runWeekCard.done', 'בוצע'],
      ['runWeekCard.skipped', 'דילגת'],
      ['agenda.move.once', 'שנה רק את האימון הזה'],
      ['agenda.move.all', 'שנה את כל הלוז קדימה'],
      ['agenda.move.cancel', 'ביטול'],
      ['agenda.delete.title', 'מחיקת אימון?'],
      ['agenda.delete.body', 'האימון יוסר מהלוח השבועי'],
      ['agenda.delete.confirm', 'מחק'],
      ['agenda.delete.cancel', 'ביטול'],
      ['planner.title', 'תכנון אימונים'],
      ['planner.buildSchedule', 'בנה לוז אימונים'],
      ['planner.close', 'סגור'],
      ['planner.calendar.expand', 'הרחב לוח שנה'],
      ['planner.calendar.collapse', 'כווץ לוח שנה'],
      ['preWorkout.steps.title', 'עוד קצת ותשלימו את יעד הצעדים'],
      ['preWorkout.cta.viewRoute', 'צפה במסלול'],
      ['preWorkout.cta.findRoute', 'מצא לי מסלול'],
      ['connectSteps.status.declined', 'דחית קודם, רוצה לחבר?'],
      ['connectSteps.status.notConnected', 'עוד לא חובר'],
      ['connectSteps.compact.title', 'חבר את הצעדים שלך'],
      ['connectSteps.card.title', 'חבר את הצעדים שלך'],
      ['connectSteps.card.body', 'כדי לקבל הצעת הליכה מותאמת ליעד הצעדים היומי שלך'],
      ['connectSteps.card.cta', 'חבר עכשיו'],
      ['loadAdvisor.budgetHigh', 'תקציב הנפח השבועי כמעט מלא. שקול אימון שחזור או מנוחה.'],
      ['loadAdvisor.pushDominant', `תרגילי Push עברו את היעד. התמקד באימוני Pull לאיזון שרירי.`],
      ['loadAdvisor.pullDominant', `תרגילי Pull עברו את היעד. התמקד באימוני Push לאיזון שרירי.`],
      ['loadAdvisor.onTrack', 'את/ה בדרך הנכונה! איזון מעולה בין קבוצות השרירים.'],
      ['consistency.strength', 'כוח'],
      ['consistency.run', 'ריצה'],
      ['consistency.addStrength', 'הוסף תוכנית כוח'],
      ['consistency.addRun', 'הוסף תוכנית ריצה'],
      ['doneToday.aria', 'סיכום היום'],
      ['doneToday.title', 'הפעילות שלי היום'],
      ['steps.connect.declined', 'דחית קודם, רוצה לחבר?'],
      ['steps.connect.notConnected', 'עוד לא חובר'],
      ['steps.today', 'צעדים היום'],
      ['programProgress.notStarted', 'טרם התחיל · מבוסס על התוכניות שלך'],
      ['programProgressRow.ghost.label', 'בואו נראה מאיפה מתחילים'],
      ['programProgressRow.ghost.cta', 'לחצו כאן '],
      ['programProgressRow.placeholderName', 'תוכנית אימון'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values (counts >= 1000 passed as pre-formatted strings, never re-formatted)', () => {
    const duration = 1234;
    expect(t('hero.minutes', { n: String(duration) })).toBe(`${duration} דקות`);
    const label = 'צה"ל';
    expect(t('personas.row.removeAria', { label })).toBe(`הסר ${label}`);
    expect(t('personas.added', { label })).toBe(`${label} נוספה`);
    expect(t('personas.confirmRemove.withAnswers', { label })).toBe(`הסרת ${label} תמחק גם את הפרטים שמילאת. להסיר?`);
    expect(t('personas.confirmRemove.plain', { label })).toBe(`להסיר את ${label}?`);
    for (const trend of ['מהר יותר', 'איטי יותר']) expect(t('racePrediction.trend', { label: trend })).toBe(`${trend} · 30 יום`);

    const typeLabel = 'ריצה קלה';
    expect(t('runCard.typeNext', { type: typeLabel })).toBe(`${typeLabel} · הבא`);
    expect(t('runCard.nextAria', { name: typeLabel })).toBe(`הריצה הבאה: ${typeLabel}`);
    expect(t('runWeekCard.today', { type: typeLabel })).toBe(`${typeLabel} · היום`);

    const fmt = (n: number) => n.toLocaleString('he-IL');
    const [steps, goal, walkSteps, missing, minutes] = [12345, 10000, 3300, 1500, 1234];
    expect(t('walkCard.gapTitle', { minutes: String(minutes) })).toBe(`~${minutes} דק׳ להשלמת הצעדים`);
    expect(t('walkCard.walkSteps', { steps: fmt(walkSteps) })).toBe(`~${fmt(walkSteps)} צעדים`);
    expect(t('walkCard.ringLabel', { steps: fmt(steps), goal: fmt(goal) })).toBe(`${fmt(steps)} מתוך ${fmt(goal)} צעדים`);
    // JSX `צעדים היום {fmt(steps)}{goal ? ` מתוך ${fmt(goal)}` : ''}` — both branches.
    expect(t('walkCard.stepsToday.withGoal', { steps: fmt(steps), goal: fmt(goal) })).toBe(`צעדים היום ${fmt(steps)}${` מתוך ${fmt(goal)}`}`);
    expect(t('walkCard.stepsToday.plain', { steps: fmt(steps) })).toBe(`צעדים היום ${fmt(steps)}${''}`);
    expect(t('walkCard.missing.withGoal', { steps: fmt(missing), goal: fmt(goal) })).toBe(`חסרים ${fmt(missing)} צעדים${` · יעד ${fmt(goal)}`}`);
    expect(t('walkCard.missing.plain', { steps: fmt(missing) })).toBe(`חסרים ${fmt(missing)} צעדים${''}`);

    expect(t('planner.week', { n: String(12) })).toBe(`שבוע ${12}`);
    const route = { distance: 1234.567, duration: 1500 };
    expect(t('preWorkout.route.subtitle', { km: route.distance.toFixed(1), minutes: String(route.duration) }))
      .toBe(`${route.distance.toFixed(1)} ק״מ · ~${route.duration} דק׳`);
    expect(t('preWorkout.steps.subtitle', { steps: (12500).toLocaleString('he-IL') })).toBe(`${(12500).toLocaleString('he-IL')} צעדים נותרו היום`);

    const title = 'ריצה קלה';
    expect(t('todayActivity.done', { label: title })).toBe(`אימון ${title} בוצע`);
    expect(t('todayActivity.steps', { steps: (10234).toLocaleString('he-IL') })).toBe(`${(10234).toLocaleString('he-IL')} צעדים`);
    expect(t('todayActivity.meta', { minutes: String(1234), label: 'אירובי' })).toBe(`${1234} דק' · ${'אירובי'}`);

    const displaySteps = (12345).toLocaleString('he-IL');
    expect(t('steps.openAria', { steps: displaySteps, goal: (10000).toLocaleString('he-IL') }))
      .toBe(`פתח ניתוח צעדים: ${displaySteps} מתוך ${(10000).toLocaleString('he-IL')}`);
    expect(t('steps.openAria', { steps: '—', goal: '8,000' })).toBe(`פתח ניתוח צעדים: ${'—'} מתוך ${'8,000'}`);
    expect(t('steps.ofGoal', { goal: (10000).toLocaleString('he-IL') })).toBe(`מתוך ${(10000).toLocaleString('he-IL')}`);

    const [currentLevel, maxLevel, remainingPercent, nextLevel] = [4, 25, 63, 5];
    expect(t('programProgress.level.v2', { level: String(currentLevel), max: String(maxLevel) })).toBe(`רמה ${currentLevel} מתוך ${maxLevel}`);
    expect(t('programProgress.level.classic', { level: String(currentLevel), max: String(maxLevel) })).toBe(`רמה ${currentLevel}/${maxLevel}`);
    // JSX `עוד {remainingPercent}% לרמה {nextLevel}`
    expect(t('programProgress.remaining', { pct: String(remainingPercent), next: String(nextLevel) })).toBe(`עוד ${remainingPercent}% לרמה ${nextLevel}`);
  });

  it('race prediction note (rich): text around the LTR pace, in the old order', () => {
    const parts = t.rich<string>('racePrediction.info.body', { pace: '5:30', ltr: (chunks: unknown) => `[${String(chunks)}]` });
    expect(parts.join('')).toBe(
      'הערכה בלבד, לא תוצאה מובטחת. מחושבת מקצב הבסיס שלך בתוכנית הריצה (' + '[5:30]' +
      ' דק׳ לק״מ) ומהמרחק שאליו התוכנית מכוונת. מרחקים אחרים מוערכים בנוסחת Riegel.',
    );
  });

  it('run card distance label = the old DIST_LABEL map with its 5 ק״מ fallback, and the program line', () => {
    const DIST_LABEL: Record<string, string> = {
      '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ', maintenance: '5 ק״מ',
    };
    for (const d of ['2k', '3k', '5k', '10k', 'maintenance', 'marathon', '']) {
      expect(t('runCard.dist', { dist: d })).toBe(DIST_LABEL[d] ?? '5 ק״מ');
    }
    const [week, total, dist] = [2, 8, '5 ק״מ'];
    // JSX `תוכנית {distLabel} · {weekLabel}` with both weekLabel branches.
    expect(t('runCard.program.withTotal', { dist, week: String(week), total: String(total) })).toBe(`תוכנית ${dist} · ${`שבוע ${week} מתוך ${total}`}`);
    expect(t('runCard.program.noTotal', { dist, week: String(week) })).toBe(`תוכנית ${dist} · ${`שבוע ${week}`}`);
  });

  it('build-custom phrases = the old MESSAGES_MALE / MESSAGES_FEMALE pick (female vs everything else)', () => {
    const MESSAGES_MALE = [
      'תבנה אימון שמתאים למה שיש לך היום ✦',
      'אז מה ה-OUT שלך היום? ✦',
      'כמה זמן יש לך? אני אבנה לך אימון מושלם ✦',
      'רוצה לבנות אימון בעצמך? ✦',
    ];
    const MESSAGES_FEMALE = [
      'תבני אימון שמתאים למה שיש לך היום ✦',
      'אז מה ה-OUT שלך היום? ✦',
      'כמה זמן יש לך? אני אבני לך אימון מושלם ✦',
      'רוצה לבנות אימון בעצמך? ✦',
    ];
    const keys = ['buildCustom.build', 'buildCustom.whatsYourOut', 'buildCustom.howLong', 'buildCustom.yourself'] as const;
    for (const userGender of ['male', 'female', 'other', null, undefined] as const) {
      const old = userGender === 'female' ? MESSAGES_FEMALE : MESSAGES_MALE;
      expect(keys.map((k) => t(k, { gender: userGender ?? 'other' }))).toEqual(old);
    }
    // An unexpected stored gender value falls to `other` = the old male list.
    expect(t('buildCustom.build', { gender: 'unknown' })).toBe(MESSAGES_MALE[0]);
  });

  it('program-start-copy constants (outside callers) still hold the old Hebrew, read from the catalog', () => {
    expect(PROGRAM_START_COPY).toEqual({
      strength: {
        title: 'תוכנית כוח',
        valueLine: 'כוח, סקילים ויציבה — מותאם לרמה שלך',
        chip: 'שאלון · 2 דק׳',
        addTitle: 'רוצה להוסיף כוח?',
        addBody: '2 אימונים קצרים ישפרו את הריצה. הריצות נשארות.',
      },
      running: {
        title: 'תוכנית ריצה',
        valueLine: 'מ-0 ל-5 ק״מ או מהר יותר — תוכנית שבועית',
        chip: 'שאלון · 2 דק׳',
        addTitle: 'רוצה להוסיף ריצה?',
        addBody: '3 ריצות קצרות בשבוע, סביב הכוח. השבוע שלך נשאר.',
      },
    });
    expect(PROGRAM_START_HINT).toBe('לא בטוח? אפשר את שניהם');
    expect(ADD_TRACK_CTA).toBe('בוא נוסיף · 2 דק׳');
    expect(ADD_TRACK_DISMISS).toBe('לא עכשיו');
    expect(PICK_PROGRAM_STRIP_HINT).toBe('בחר תוכנית למטה');
  });

  it('key counts per prefix (other batches add keys to home.json)', () => {
    const count = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix + '.')).length;
    expect({
      hero: count('hero'), buildCustom: count('buildCustom'), programStart: count('programStart'), addStrength: count('addStrength'),
      nearbyGroups: count('nearbyGroups'), personas: count('personas'), racePrediction: count('racePrediction'),
      runCard: count('runCard'), walkCard: count('walkCard'), runWeekCard: count('runWeekCard'), agenda: count('agenda'),
      planner: count('planner'), preWorkout: count('preWorkout'), connectSteps: count('connectSteps'),
      loadAdvisor: count('loadAdvisor'), consistency: count('consistency'), todayActivity: count('todayActivity'),
      doneToday: count('doneToday'), steps: count('steps'), programProgress: count('programProgress'),
      programProgressRow: count('programProgressRow'),
    }).toEqual({
      hero: 6, buildCustom: 4, programStart: 15, addStrength: 2, nearbyGroups: 9, personas: 13, racePrediction: 10,
      runCard: 10, walkCard: 16, runWeekCard: 4, agenda: 7, planner: 6, preWorkout: 5, connectSteps: 6,
      loadAdvisor: 4, consistency: 4, todayActivity: 3, doneToday: 2, steps: 5, programProgress: 4,
      programProgressRow: 3,
    });
  });
});
