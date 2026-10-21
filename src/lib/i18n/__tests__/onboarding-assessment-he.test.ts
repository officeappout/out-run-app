/**
 * Namespace `onboarding` (i18n wave 2): every Hebrew key returns exactly what the code rendered
 * before the extraction. The `old` side of each case is the original literal / helper, copied
 * verbatim (origin/main @ 7498ba90; helpers in fixtures/onboarding-assessment.old.ts).
 *
 * Counted PER PREFIX (other batches add keys to the same namespace file).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';
import { resolveTierLabel, resolveSkillTierLabel } from '@/features/user/onboarding/utils/assessment-tier-label';
import { STRENGTH_LABELS, STRENGTH_LABEL_KEYS } from '@/features/user/onboarding/constants/onboarding-phases';
import {
  resolveTierLabelOld,
  resolveSkillTierLabelOld,
  STRENGTH_LABELS_OLD,
  describeSaveErrorOld,
} from './fixtures/onboarding-assessment.old';

type Key = keyof typeof he;
const t = makeT('he', onboarding);
const keysWith = (prefix: string) => (Object.keys(he) as Key[]).filter((k) => k.startsWith(prefix));

describe('onboarding · assessment page (he) — byte-identical to the pre-extraction literals', () => {
  const cases: Array<[Key, string]> = [
    ['assessment.loading', 'טוען הערכה...'],
    ['assessment.evaluating.title', 'מנתח תוצאות...'],
    ['assessment.evaluating.subtitle', 'בודק את הפרופיל שלך ומתאים תוכנית'],
    ['assessment.followUp.badge', 'הערכה מתקדמת'],
    ['assessment.followUp.titleFallback', 'הערכה מתקדמת'],
    ['assessment.saving', 'שומר תוצאות...'],
    ['assessment.fallbackProgramName', 'גוף מלא — ברירת מחדל'],
    ['assessment.saveError.network', describeSaveErrorOld({ code: 'unavailable' })],
    ['assessment.saveError.auth', describeSaveErrorOld({ code: 'permission-denied' })],
    ['assessment.saveError.generic', describeSaveErrorOld({ code: 'internal' })],
    ['assessment.alert.saveFailed', 'שגיאה בשמירה — נסו שנית'],
    ['assessment.alert.noUser', 'לא נמצא משתמש מחובר — נסו לרענן.'],
  ];

  it('every assessment.* key is covered', () => {
    expect(cases.map(([k]) => k).sort()).toEqual(keysWith('assessment.').sort());
  });

  it('plain strings', () => {
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('save-error classes map to the same text as the old describeSaveError', () => {
    const byCode: Array<[string | undefined, Key]> = [
      ['unavailable', 'assessment.saveError.network'],
      ['deadline-exceeded', 'assessment.saveError.network'],
      ['auth/network-request-failed', 'assessment.saveError.network'],
      ['permission-denied', 'assessment.saveError.auth'],
      ['unauthenticated', 'assessment.saveError.auth'],
      ['internal', 'assessment.saveError.generic'],
      [undefined, 'assessment.saveError.generic'],
    ];
    for (const [code, key] of byCode) expect(t(key)).toBe(describeSaveErrorOld(code ? { code } : {}));
  });
});

describe('onboarding · tier pill (he) — exhaustive against the old resolvers', () => {
  const proportions = [
    -5, -0.0001, 0, 0.1, 0.2, 0.24, 0.25, 0.3, 1 / 3 - 0.001, 1 / 3, 0.4, 0.49, 0.5, 0.6,
    2 / 3 - 0.001, 2 / 3, 0.7, 0.74, 0.75, 0.9, 1, 1.0001, 5, NaN, Infinity, -Infinity,
  ];

  it('every tier.* key is reachable', () => {
    expect(keysWith('tier.').sort()).toEqual([
      'tier.advanced',
      'tier.beginner',
      'tier.intermediate',
      'tier.skill.advanced',
      'tier.skill.beginner',
      'tier.skill.beginnerPlus',
      'tier.skill.intermediate',
    ]);
  });

  it('resolveTierLabel — every bucket × male / female', () => {
    for (const p of proportions) {
      // male / female keep the old labels; unknown gender is neutral since gender batch 3
      // (pinned in onboarding-gender-batch3.test.ts).
      for (const isFemale of [true, false]) {
        expect(resolveTierLabel(p, isFemale ? 'female' : 'male', t)).toBe(resolveTierLabelOld(p, isFemale));
      }
    }
  });

  it('resolveTierLabel ignores the injected profile gender — the quiz answer decides', () => {
    const tFemaleProfile = makeT('he', onboarding, { gender: 'female' });
    expect(resolveTierLabel(0, 'male', tFemaleProfile)).toBe(resolveTierLabelOld(0, false));
    expect(resolveTierLabel(1, 'male', tFemaleProfile)).toBe(resolveTierLabelOld(1, false));
  });

  it('resolveSkillTierLabel — every bucket', () => {
    for (const p of proportions) expect(resolveSkillTierLabel(p, t)).toBe(resolveSkillTierLabelOld(p));
  });
});

describe('onboarding · strength phase labels (he)', () => {
  it('every phases.strength.* key equals the old STRENGTH_LABELS entry', () => {
    expect(Object.values(STRENGTH_LABEL_KEYS).sort()).toEqual(keysWith('phases.strength.').sort());
    for (const phase of [1, 2, 3, 4, 5] as const) {
      expect(t(STRENGTH_LABEL_KEYS[phase])).toBe(STRENGTH_LABELS_OLD[phase]);
    }
  });

  it('STRENGTH_LABELS (kept for not-yet-migrated callers) is unchanged', () => {
    expect(STRENGTH_LABELS).toEqual(STRENGTH_LABELS_OLD);
    for (const phase of [1, 2, 3, 4, 5]) expect(STRENGTH_LABELS[phase]).toBe(STRENGTH_LABELS_OLD[phase]);
  });
});
