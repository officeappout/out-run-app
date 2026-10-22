/**
 * Namespace `player`, keys `swapIcon.*` / `exerciseCard.*` / `weeklyAchievements.*` / `gainBreakdown.*` /
 * `summaryStats.*` / `exerciseBreakdown.*` / `exerciseRow.*` / `personalRecords.*` (i18n wave 2 batch ai:
 * the shared strength cards and summary blocks). Every key returns exactly what the code rendered before
 * the extraction: the `old` side is the original literal / template, or the old lookup re-declared verbatim.
 * Parity snapshots: src/features/workout-engine/components/__tests__/strength-cards-i18n-parity.test.tsx.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/player.json';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);
type Key = keyof typeof he;

describe('player (he) strength cards — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the keys this test pins (count per prefix)', () => {
    const PREFIXES: Record<string, number> = {
      swapIcon: 1, exerciseCard: 7, weeklyAchievements: 5, gainBreakdown: 7,
      summaryStats: 3, exerciseBreakdown: 5, exerciseRow: 1, personalRecords: 1,
    };
    for (const [prefix, n] of Object.entries(PREFIXES)) {
      expect([prefix, Object.keys(he).filter((k) => k.startsWith(`${prefix}.`)).length]).toEqual([prefix, n]);
    }
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['swapIcon.aria', 'החלף תרגיל'],
      ['exerciseCard.badge.target', 'יעד'],
      ['exerciseCard.badge.targetTitle', 'יעד רמה'],
      ['exerciseCard.badge.goal', 'מטרה'],
      ['exerciseCard.badge.goalTitle', 'תואם למטרה שלך'],
      ['exerciseCard.badge.equipment', 'ציוד'],
      ['exerciseCard.badge.equipmentTitle', 'מתאים לציוד שלך'],
      ['weeklyAchievements.title', 'הישגים שבועיים'],
      ['weeklyAchievements.coins', 'מטבעות'],
      ['weeklyAchievements.strengthSessions', 'אימוני כוח'],
      ['weeklyAchievements.activeDays', 'ימים פעילים'],
      ['weeklyAchievements.minutes', 'דקות שבועיות'],
      ['gainBreakdown.title', 'פירוט התקדמות'],
      ['gainBreakdown.completion', 'השלמת אימון'],
      ['gainBreakdown.bonus', '✓ בונוס'],
      ['gainBreakdown.total', 'סה״כ התקדמות'],
      ['summaryStats.calories', 'קלוריות'],
      ['summaryStats.duration', 'זמן'],
      ['summaryStats.streak', 'אימונים ברצף'],
      ['exerciseBreakdown.total', 'סה״כ'],
      ['exerciseBreakdown.performed', 'ביצוע'],
      ['exerciseBreakdown.title', 'סיכום אימון'],
      ['exerciseBreakdown.empty', 'אין תרגילים להצגה'],
      ['exerciseRow.notPerformed', 'לא בוצע'],
      ['personalRecords.title', 'שיא חדש!'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('exerciseCard.range matches the old template for every shape (counts >= 1000 too)', () => {
    for (const isTimeBased of [false, true])
      for (const symmetry of ['unilateral', 'bilateral', undefined] as const)
        for (const rampedTarget of [undefined, 0, 10, 1500])
          for (const [min, max] of [[6, 12], [1200, 1800]]) {
            const perSide = symmetry === 'unilateral' ? ' (לכל צד)' : '';
            const unit = isTimeBased ? 'שניות' : 'חזרות';
            const targetSuffix = rampedTarget ? ` (יעד: ${rampedTarget})` : '';
            const old = `${min}-${max} ${unit}${perSide}${targetSuffix}`;
            expect(
              t('exerciseCard.range', {
                min: String(min),
                max: String(max),
                unit: isTimeBased ? 'seconds' : 'reps',
                side: symmetry === 'unilateral' ? 'unilateral' : 'both',
                hasTarget: rampedTarget ? 'yes' : 'no',
                target: rampedTarget ? String(rampedTarget) : '',
              }),
            ).toBe(old);
          }
  });

  it('gainBreakdown values', () => {
    expect(t('gainBreakdown.goals', { met: String(2), total: String(1000) })).toBe(`יעדים שהושגו (${2}/${1000})`);
    expect(t('gainBreakdown.consistency', { done: String(1), goal: String(3) })).toBe(`עקביות שבועית (${1}/${3})`);
    expect(t('gainBreakdown.remaining', { n: String(2) })).toBe(`עוד ${2}`);
  });

  it('exerciseBreakdown.category = old label map with raw-id fallback', () => {
    const CATEGORY_LABELS: Record<string, string> = { warmup: 'חימום', superset: 'סופר סט', stretch: 'מתיחות', main: 'עיקרי' };
    for (const category of ['warmup', 'superset', 'stretch', 'main', 'weird_new', 'cooldown'])
      expect(t('exerciseBreakdown.category', { category })).toBe(CATEGORY_LABELS[category] || category);
  });
});
