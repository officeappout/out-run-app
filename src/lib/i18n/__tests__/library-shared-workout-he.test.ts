/**
 * i18n wave 2 batch ab (namespace `library`, prefix `sharedWorkout.*`): the shared-workout web page
 * (/workouts/[id] — page metadata, OG image, WorkoutPreviewClient). Every key equals the old literal /
 * template, copied verbatim from the source before the extraction — including lines a render can't reach
 * (convertSharedToLocal's flat segment lines, which only show when the share doc has no exercises).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/library.json';
import { library } from '@/messages/ns/library';
import { makeT } from '../t';

const t = makeT('he', library);

describe('library sharedWorkout.* — key count', () => {
  it('has the keys this batch added', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('sharedWorkout.'))).toHaveLength(29);
  });
});

describe('library sharedWorkout.* — plain strings', () => {
  it('equals the old literals', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['sharedWorkout.meta.fallbackTitle', 'אימון | Out'],
      ['sharedWorkout.meta.fallbackDescription', 'צפו באימון וקפצו להתאמן!'],
      ['sharedWorkout.og.fallbackTitle', 'אימון כוח'],
      ['sharedWorkout.banner.label', 'הורדת האפליקציה'],
      ['sharedWorkout.banner.close', 'סגור'],
      ['sharedWorkout.banner.title', 'רוצה לבצע את האימון הזה?'],
      ['sharedWorkout.banner.subtitle', 'עקוב אחרי הסטים, המנוחות וההתקדמות שלך באפליקציה'],
      ['sharedWorkout.banner.cta', 'להורדה חינם'],
      ['sharedWorkout.loading', 'טוען את האימון...'],
      ['sharedWorkout.error.title', 'לא הצלחנו לטעון את האימון'],
      ['sharedWorkout.error.message', 'לא הצלחנו לטעון את האימון'],
      ['sharedWorkout.error.home', 'חזרה לדף הבית'],
      ['sharedWorkout.footer.start', 'התחלת אימון'],
      ['sharedWorkout.footer.home', 'בית'],
      ['sharedWorkout.fallback.title', 'אימון כוח מותאם'],
      ['sharedWorkout.fallback.description', 'אימון דינמי המותאם לרמה שלך'],
      ['sharedWorkout.section.warmup', 'חימום'],
      ['sharedWorkout.section.cooldown', 'שחרור'],
      ['sharedWorkout.reps.defaultHold', '20-40 שניות'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
});

describe('library sharedWorkout.* — server metadata + OG image', () => {
  const DIFFICULTY_HE: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };
  const MUSCLE_HE: Record<string, string> = {
    chest: 'חזה', back: 'גב', shoulders: 'כתפיים', biceps: 'ביצפס',
    triceps: 'טרייצפס', core: 'ליבה', abs: 'בטן', quads: 'ארבע ראשי',
    hamstrings: 'אחורי ירך', glutes: 'ישבן', calves: 'שוקיים',
    legs: 'רגליים', forearms: 'אמות', lats: 'גב רחב',
    upper_back: 'גב עליון', lower_back: 'גב תחתון', full_body: 'כל הגוף',
    obliques: 'אלכסוניים', traps: 'טרפז', hip_flexors: 'כופפי ירך',
  };

  it('title / description', () => {
    expect(t('sharedWorkout.meta.title', { title: 'אימון הבוקר' })).toBe(`🔥 הצטרפו לאימון שלי: ${'אימון הבוקר'} | Out`);
    for (const difficulty of [0, 1, 2, 3, 4, 2.5, -1]) {
      for (const minutes of [0, 35, 1500]) {
        const diffLabel = DIFFICULTY_HE[difficulty] || 'בינוני';
        expect(t('sharedWorkout.meta.description', { difficulty: String(difficulty), minutes: String(minutes) })).toBe(
          `אימון ${diffLabel} של ${minutes} דקות. לחצו לצפייה בתרגילים ותתחילו להתאמן!`,
        );
      }
    }
  });

  it('OG difficulty / stats / muscles', () => {
    for (const difficulty of [0, 1, 2, 3, 9, 2.5]) {
      expect(t('sharedWorkout.og.difficulty', { difficulty: String(difficulty) })).toBe(DIFFICULTY_HE[difficulty] || 'בינוני');
    }
    // no meta → 'בינוני'
    expect(t('sharedWorkout.og.difficulty', { difficulty: '' })).toBe('בינוני');
    for (const n of [1, 45, 1500]) {
      expect(t('sharedWorkout.og.minutes', { minutes: String(n) })).toBe(`${n} דק׳`);
      expect(t('sharedWorkout.og.exercises', { count: String(n) })).toBe(`${n} תרגילים`);
    }
    for (const m of [...Object.keys(MUSCLE_HE), 'neck', 'other', 'Full Body', '']) {
      expect(t('sharedWorkout.og.muscle', { muscle: m })).toBe(MUSCLE_HE[m] || m);
    }
  });
});

describe('library sharedWorkout.* — exercise lines', () => {
  it('superset label', () => {
    for (const n of [1, 2, 12]) expect(t('sharedWorkout.superset', { n: String(n) })).toBe(`סופרסט ${n}`);
  });

  it('range / single lines, every unit × side × goal branch', () => {
    for (const timeBased of [false, true]) {
      const unit = timeBased ? 'שניות' : 'חזרות';
      for (const side of [false, true]) {
        const uniSuffix = side ? ' (לכל צד)' : '';
        for (const target of [undefined, 14, 1000]) {
          const goalSuffix = target ? ` (יעד: ${target})` : '';
          const values = {
            unit: timeBased ? 'seconds' : 'reps',
            side: side ? 'yes' : 'no',
            goal: target ? 'yes' : 'no',
            target: String(target ?? ''),
          };
          expect(t('sharedWorkout.reps.range', { ...values, min: '1000', max: '1200' })).toBe(
            `${1000}-${1200} ${unit}${uniSuffix}${goalSuffix}`,
          );
          expect(t('sharedWorkout.reps.single', { ...values, min: '30', max: 'undefined' })).toBe(
            `${30} ${unit}${uniSuffix}${goalSuffix}`,
          );
        }
      }
    }
  });

  it('defaults', () => {
    expect(t('sharedWorkout.reps.defaultReps', { side: 'no' })).toBe('8-12 חזרות');
    expect(t('sharedWorkout.reps.defaultReps', { side: 'yes' })).toBe(`8-12 חזרות${' (לכל צד)'}`);
  });
});
