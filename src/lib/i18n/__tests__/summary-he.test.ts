/**
 * Namespace `summary` (i18n wave 2, batch ad — the aerobic summary's child
 * blocks in src/features/workout-engine/summary/components/{run-type,shared,aerobic}):
 * every Hebrew key returns exactly what the code rendered before the extraction.
 * The `old` side of each case is the original literal / template / ternary,
 * copied verbatim from the components and run-type/run-type-ui.ts.
 *
 * The static-markup snapshots (summary-blocks-i18n-parity.test.tsx) cover the
 * keys in context; this test also pins what a static render can't reach (the
 * chart tooltip, the share text built on click), every branch and a count ≥ 1000.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/summary.json';
import { summary } from '@/messages/ns/summary';
import { splitsLegendKey } from '@/features/workout-engine/summary/components/run-type/run-type-ui';
import { makeT } from '../t';

const t = makeT('he', summary);

describe('summary — aerobic summary blocks', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['runType.openSegments.hint', 'לפירוט בלשונית מקטעים'],
      ['runType.reps.title', 'קצב בכל חזרה'],
      ['runType.course.title', 'מהלך האימון'],
      ['runType.splits.chartTitle', 'קצב לכל ק״מ'],
      ['runType.splits.title', 'פיצולים לפי ק״מ'],
      ['runType.laps.title', 'קצב בכל הקפה'],
      ['laps.header.lap', 'הקפה'],
      ['laps.header.km', 'ק״מ'],
      ['laps.header.time', 'זמן'],
      ['laps.header.speed', 'קמ״ש'],
      ['lapChart.title', 'קצב לפי הקפה'],
      ['lapChart.unit', 'דק׳/ק״מ · נמוך = מהיר'],
      ['lapChart.empty', 'אין נתוני קצב להצגה'],
      ['lapChart.tooltip.pace', 'קצב'],
      ['streak.label', 'רצף ימים'],
      ['streak.days', 'ימים ברצף'],
      ['streak.praise', 'כל הכבוד!'],
      ['participants.nameFallback', 'משתתף'],
      ['participants.you', ' (את/ה)'],
      ['share.tooShort', 'אימון קצר מדי — לא נשמר'],
      ['share.cta', 'שתף'],
      ['rings.time', 'זמן'],
      ['rings.calories', 'קק״ל'],
      ['together.unit', 'ק״מ סה״כ'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('splits legend equals the old splitsLegend ternary', () => {
    const splitsLegend = (hasBand: boolean) =>
      hasBand ? 'ירוק = בטווח · כתום = מחוץ לטווח · כחול = הכי מהיר' : 'כחול = הק״מ המהיר ביותר';
    for (const hasBand of [true, false]) expect(t(splitsLegendKey(hasBand))).toBe(splitsLegend(hasBand));
  });

  it('values (counts ≥ 1000 stay unformatted)', () => {
    for (const n of [1, 6, 1234]) {
      expect(t('runType.reps.chip', { reps: String(n) })).toBe(`${n} חזרות`);
      expect(t('runType.laps.chip', { count: String(n) })).toBe(`${n} הקפות`);
      expect(t('laps.row', { n: String(n) })).toBe(`הקפה ${n}`);
      expect(t('lapChart.tooltip.lap', { lap: String(n) })).toBe(`הקפה ${n}`);
      expect(t('participants.more', { count: String(n) })).toBe(`עוד ${n} משתתפים ◄`);
    }
    const km = 5.123;
    expect(t('participants.distance', { km: km.toFixed(2) })).toBe(`${km.toFixed(2)} ק״מ`);
  });

  it('share text equals the old handleShare template', () => {
    const old = (distanceKm: number, group: { participantCount: number; collectiveDistanceKm: number } | null) => {
      const distanceStr = distanceKm > 0 ? `${distanceKm.toFixed(2)} ק״מ` : '';
      const groupPart =
        group && group.participantCount > 1
          ? ` | ${group.participantCount} אנשים · ${group.collectiveDistanceKm.toFixed(1)} ק״מ יחד`
          : '';
      return `סיימתי אימון ב-OUT! ${distanceStr}${groupPart} 💪`;
    };
    const now = (distanceKm: number, group: { participantCount: number; collectiveDistanceKm: number } | null) => {
      const distanceStr = distanceKm > 0 ? t('share.distance', { km: distanceKm.toFixed(2) }) : '';
      const groupPart =
        group && group.participantCount > 1
          ? t('share.group', { count: String(group.participantCount), km: group.collectiveDistanceKm.toFixed(1) })
          : '';
      return t('share.text', { distance: distanceStr, group: groupPart });
    };
    const groups = [null, { participantCount: 1, collectiveDistanceKm: 3 }, { participantCount: 4, collectiveDistanceKm: 12.34 }, { participantCount: 1234, collectiveDistanceKm: 4321.06 }];
    for (const d of [0, 5, 10.456]) for (const g of groups) expect(now(d, g)).toBe(old(d, g));
  });

  it('selects / plurals equal the old ternaries', () => {
    for (const activityType of ['walking', 'running'] as const) {
      expect(t('rings.pace', { activityType })).toBe(activityType === 'walking' ? "ד׳/ק״מ" : 'קצב ממוצע');
    }
    for (const n of [0, 1, 2, 4, 1234]) {
      expect(t('together.people', { n, count: String(n) })).toBe(`${n} ${n === 1 ? 'אדם' : 'אנשים'} הלכו יחד`);
    }
  });
});
