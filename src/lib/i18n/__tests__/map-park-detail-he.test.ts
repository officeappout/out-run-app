/**
 * Namespace `map`, `parkDetail.*` keys (i18n wave 2, batch ac — the park page's
 * sections in src/features/parks/client/components/park-detail/sections): every
 * Hebrew key returns exactly what the code rendered before the extraction. The
 * `old` side of each case is the original literal / template / lookup map,
 * copied verbatim from the components and utils/park-detail-{format,logic}.ts.
 *
 * The static-markup snapshots (park-detail-i18n-parity.test.tsx) cover the keys
 * in context; this test also pins every select branch and a count ≥ 1000.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);

describe('map parkDetail.* (park page sections)', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['parkDetail.pulse.titleHere', 'מתאמנים כאן'],
      ['parkDetail.session.group', 'קבוצתי'],
      ['parkDetail.session.published', 'פרסמת'],
      ['parkDetail.session.joined', 'נרשמת'],
      ['parkDetail.session.join', 'הצטרף'],
      ['parkDetail.arrival.empty', 'אף אחד עוד לא פרסם שהוא מגיע...'],
      ['parkDetail.arrival.prompt', 'גם אתה מתכנן להגיע?'],
      ['parkDetail.arrival.cta', 'אני מגיע…'],
      ['parkDetail.arrival.window', 'חלון הגעה'],
      ['parkDetail.arrival.startAria', 'שעת התחלה'],
      ['parkDetail.arrival.endAria', 'שעת סיום'],
      ['parkDetail.arrival.publish', 'פרסם'],
      ['parkDetail.rating.cta', 'דרג את המקום'],
      ['parkDetail.rating.placeholder', 'תגובה (לא חובה)...'],
      ['parkDetail.rating.send', 'שלח'],
      ['parkDetail.reviews.title', 'ביקורות'],
      ['parkDetail.reviews.userFallback', 'משתמש'],
      ['parkDetail.actions.suggestEdit', 'עדכן פרטים'],
      ['parkDetail.actions.navigate', 'ניווט'],
      ['parkDetail.amenities.title', 'פירוט על הפארק'],
      ['parkDetail.amenities.empty', 'לא צוינו תכונות'],
      ['parkDetail.photos.title', 'תמונות'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values', () => {
    const review = 5;
    expect(t('parkDetail.rating.thanks', { xp: String(review) })).toBe(`תודה! +${review} XP`);
    for (const n of [1, 7, 1234]) {
      expect(t('parkDetail.reviews.more', { count: String(n) })).toBe(`צפה בעוד ביקורות (${n})`);
    }
    // The title is one rich sentence: "מתקנים" + <span> ({n})</span>.
    expect(t.rich('parkDetail.equipment.title', { count: String(1234), muted: (c: unknown) => `[${(c as string[]).join('')}]` }).join(''))
      .toBe(`מתקנים[ (${1234})]`);
  });

  it('selects equal the old lookup maps / ternaries', () => {
    const DAY_FILTER_LABELS: Record<string, string> = { today: 'היום', tomorrow: 'מחר', week: 'השבוע' };
    for (const filter of ['today', 'tomorrow', 'week']) expect(t('parkDetail.dayFilter', { filter })).toBe(DAY_FILTER_LABELS[filter]);

    for (const status of ['under_repair', 'closed', 'whatever']) {
      expect(t('parkDetail.meta.status', { status })).toBe(status === 'under_repair' ? 'בתיקון' : 'סגור');
    }

    const SECTION_LABELS: Record<string, string> = { aerobic: 'אירובי', functional: 'פונקציונלי', hydraulic: 'הידראולי' };
    for (const section of Object.keys(SECTION_LABELS)) expect(t('parkDetail.equipment.section', { section })).toBe(SECTION_LABELS[section]);

    const FACILITY_LABELS: Record<string, string> = {
      gym_park: 'גינת כושר', court: 'מגרש ספורט', route: 'מסלול',
      zen_spot: 'פינת גוף-נפש', urban_spot: 'אורבן / אקסטרים', nature_community: 'טבע וקהילה',
    };
    for (const type of Object.keys(FACILITY_LABELS)) expect(t('parkDetail.facility', { type })).toBe(FACILITY_LABELS[type]);
  });
});
