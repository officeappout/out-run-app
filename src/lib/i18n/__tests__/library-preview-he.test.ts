/**
 * i18n wave 2 batch aa (namespace `library`, prefix `preview.*`): the workout preview drawer.
 * Every key equals the old literal / template, copied verbatim from the source before the extraction —
 * including what a static render can't reach: the drawer shell (hero close, intensity toggle, nearby parks),
 * the exercise-detail sheet's aria-label and the share text built in a click handler.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/library.json';
import { library } from '@/messages/ns/library';
import { makeT } from '../t';

const t = makeT('he', library);

describe('library preview.* — plain strings', () => {
  it('equals the old literals', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['preview.hero.close', 'סגור'],
      ['preview.intensity.label', 'בחירת עצימות'],
      ['preview.parks.title', 'איפה כדאי להתאמן?'],
      ['preview.parks.walkOne', 'דקה הליכה ממך'],
      ['preview.header.close', 'סגור'],
      ['preview.header.edit', 'ערוך אימון'],
      ['preview.footer.offline', 'שמור אימון למועדפים כדי להתאמן אופליין'],
      ['preview.footer.start', 'התחלת אימון'],
      ['preview.footer.edit', 'ערוך אימון'],
      ['preview.footer.mute', 'השתק סרטונים'],
      ['preview.footer.unmute', 'הפעל שמע'],
      ['preview.location.title', 'איפה מתאמנים?'],
      ['preview.location.swapping', 'מחליף…'],
      ['preview.list.share', 'שתף'],
      ['preview.list.favRemove', 'הסר ממועדפים'],
      ['preview.list.favAdd', 'מועדפים'],
      ['preview.list.download', 'הורדה לאופליין'],
      ['preview.list.equipment', 'ציוד'],
      ['preview.list.muscles', 'שרירים'],
      ['preview.list.unilateral', ' (לכל צד)'],
      ['preview.card.unilateral', ' (לכל צד)'],
      ['preview.card.goal', 'יעד'],
      ['preview.card.needsStation', 'דורש מתקן'],
      ['preview.step.goal', 'יעד'],
      ['preview.section.tabata.title', 'טבטה'],
      ['preview.section.tabata.oneCycle', 'סבב אחד'],
      ['preview.section.tabata.oneExercise', 'תרגיל אחד'],
      ['preview.section.warmup.collapse', 'כווץ חימום'],
      ['preview.section.warmup.expand', 'הרחב חימום'],
      ['preview.section.warmup.active', 'פעיל'],
      ['preview.section.warmup.skip', 'דלג'],
      ['preview.timed.profile', 'עצימות לאורך האימון'],
      ['preview.timed.amrap.line', 'כמה שיותר סבבים'],
      ['preview.timed.tabata.name', 'טבטה'],
      ['preview.timed.item.unilateral', ' לכל צד'],
      ['preview.timed.item.amrap', 'בכל סבב'],
      ['preview.timed.item.emomOdd', 'דקות אי-זוגיות'],
      ['preview.timed.item.emomEven', 'דקות זוגיות'],
      ['preview.timed.item.emomEveryMinute', 'כל דקה'],
      ['preview.exerciseDetail.label', 'פרטי תרגיל'],
      ['preview.share.fallbackTitle', 'אימון כוח'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('covers every preview.* key (count per prefix)', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('preview.')).length).toBe(74);
  });
});

describe('library preview.* — values and branches (old templates verbatim)', () => {
  const N = [1, 2, 7, 1234];

  it('drawer shell + footer + list', () => {
    const option = { label: 'בינוני', duration: 22 };
    expect(t('preview.intensity.option', { label: option.label, duration: String(option.duration) })).toBe(
      `${option.label} · ${option.duration}׳`,
    );
    for (const n of N) {
      expect(t('preview.parks.walk', { minutes: String(n) })).toBe(`${n} דקות הליכה ממך`);
      expect(t('preview.footer.nearby', { count: String(n) })).toBe(`${n} אנשים מתאמנים כוח קרוב אליך`);
      expect(t('preview.list.duration', { minutes: String(n) })).toBe(`${n} דק'`);
      expect(t('preview.list.tabataWork', { sec: String(n) })).toBe(`${n} שנ'`);
      expect(t('preview.list.tabataWorkUni', { sec: String(n) })).toBe(`${n} שנ' לכל צד`);
    }
  });

  it('volume labels (exercise-display.utils + PyramidStepCard)', () => {
    for (const uni of ['', ' (לכל צד)']) {
      for (const isTimeBased of [false, true]) {
        const unit = isTimeBased ? 'שניות' : 'חזרות';
        expect(t('preview.volume.range', { min: '8', max: '1234', unit: isTimeBased ? 'seconds' : 'reps', uni })).toBe(
          `8-1234 ${unit}${uni}`,
        );
      }
      expect(t('preview.volume.reps', { n: '1234', uni })).toBe(`1234 חזרות${uni}`);
      for (const hold of [false, true]) {
        const stepUnit = hold ? 'שניות' : 'חזרות';
        expect(t('preview.step.volume', { target: '15', unit: hold ? 'hold' : 'reps', uni })).toBe(`15 ${stepUnit}${uni}`);
        expect(t('preview.step.unitOnly', { unit: hold ? 'hold' : 'reps', uni })).toBe(`${stepUnit}${uni}`);
      }
    }
    expect(t('preview.volume.seconds', { n: '1234' })).toBe(`1234 שניות`);
    expect(t('preview.step.set', { n: '3' })).toBe(`סט 3`);
  });

  it('section headers', () => {
    for (const n of N) {
      const s = String(n);
      expect(t('preview.section.tabata.intervals', { n: s })).toBe(`${n} אינטרוולים`);
      expect(t('preview.section.tabata.cycles', { n: s })).toBe(`${n} סבבים`);
      expect(t('preview.section.tabata.exercises', { n: s })).toBe(`${n} תרגילים`);
      expect(t('preview.section.warmup.count', { n: s })).toBe(`(${n} תרגילים)`);
      expect(t('preview.section.steps', { n: s })).toBe(`${n} שלבים`);
      expect(t('preview.section.rounds', { n: s })).toBe(`${n}x סבבים`);
    }
    expect(t('preview.section.tabata.chip', { work: '20', rest: '10' })).toBe(`20 שנ' עבודה / 10 שנ' מנוחה`);
  });

  it('timed block (timed-preview.utils + TimedSectionHeader)', () => {
    const count = (n: number) => `${n} ${n === 1 ? 'תרגיל' : 'תרגילים'}`;
    for (const n of [1, 2, 9]) {
      expect(t('preview.timed.meta.count', { n })).toBe(count(n));
      expect(t('preview.timed.emom.lineMinute', { n })).toBe(`כל דקה · ${count(n)}`);
      expect(t('preview.timed.emom.lineSec', { sec: '90', n })).toBe(`כל 90 שנ׳ · ${count(n)}`);
      expect(t('preview.timed.item.emomEveryN', { n: String(n) })).toBe(`כל ${n} דקות`);
    }
    expect(t('preview.timed.meta.duration', { min: '1234' })).toBe(`1234 דק׳`);
    expect(t('preview.timed.meta.end', { time: '9:55' })).toBe(`מסיים ~9:55`);
    expect(t('preview.timed.tabata.line', { n: '8' })).toBe(`8 אינטרוולים`);
    for (const uni of ['', ' לכל צד']) {
      expect(t('preview.timed.item.reps', { n: '12', uni })).toBe(`12 חזרות${uni}`);
      expect(t('preview.timed.item.hold', { n: '30', uni })).toBe(`30 שנ׳${uni}`);
      expect(t('preview.timed.item.tabata', { sec: '20', uni })).toBe(`20 שנ׳${uni}`);
    }
    expect(t('preview.timed.item.amrapTarget', { target: '12 חזרות' })).toBe(`12 חזרות · בכל סבב`);
    expect(t('preview.timed.item.emomTarget', { which: 'כל דקה', target: '8 חזרות' })).toBe(`כל דקה · 8 חזרות`);
    for (const name of ['AMRAP', 'EMOM', 'טבטה']) expect(t('preview.timed.info', { name })).toBe(`מה זה ${name}?`);
  });

  it('share text (useFavoritesActions)', () => {
    const APP_ORIGIN = 'https://outrun.co.il';
    for (const title of ['אימון כוח', 'Full body {x}']) {
      expect(t('preview.share.text', { title, origin: APP_ORIGIN })).toBe(
        `💪 ${title}\nבואו לנסות את האימון שלי ב-Out!\n${APP_ORIGIN}`,
      );
    }
  });
});
