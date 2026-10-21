/**
 * Verbatim copies of the pre-extraction code (origin/main @ 7498ba90), kept only so
 * onboarding-he.test.ts can compare the catalog against the old output exhaustively.
 * Do not use outside tests.
 */

// src/features/user/onboarding/utils/assessment-tier-label.ts
export function resolveTierLabelOld(proportion: number, isFemale: boolean): string {
  const p = Number.isFinite(proportion) ? Math.max(0, Math.min(1, proportion)) : 0;
  if (p < 1 / 3) return isFemale ? 'מתחילה' : 'מתחיל';
  if (p < 2 / 3) return 'בינוני';
  return isFemale ? 'מתקדמת' : 'מתקדם';
}

const SKILL_TIER_LABELS = [
  'קליסטניקס למתחילים',
  'קליסטניקס למתחילים+',
  'קליסטניקס לבינוניים',
  'קליסטניקס למתקדמים',
] as const;

export function resolveSkillTierLabelOld(proportion: number): string {
  const p = Number.isFinite(proportion) ? Math.max(0, Math.min(1, proportion)) : 0;
  const idx = Math.min(SKILL_TIER_LABELS.length - 1, Math.floor(p * SKILL_TIER_LABELS.length));
  return SKILL_TIER_LABELS[idx];
}

// src/features/user/onboarding/constants/onboarding-phases.ts
export const STRENGTH_LABELS_OLD: Record<number, string> = {
  1: 'שלב 1: הכרות',
  2: 'שלב 2: בחירת מסלול',
  3: 'שלב 3: מבדק רמה',
  4: 'שלב 4: סיכום התוכנית',
  5: 'שלב 5: הצהרת בריאות',
};

// src/app/onboarding-new/assessment-visual/page.tsx — describeSaveError
export function describeSaveErrorOld(err: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const code: string = err?.code ?? '';
  if (code === 'unavailable' || code === 'deadline-exceeded' || code.includes('network')) {
    return 'החיבור לאינטרנט נראה לא יציב כרגע. אפשר לנסות שוב, או להמשיך — נשלים את השמירה בשלב הבא.';
  }
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return 'החשבון שלך לא מזוהה כרגע. נסה שוב, ואם זה חוזר — המשך בכל זאת, נשלים את השמירה בשלב הבא.';
  }
  return 'לא הצלחנו לשמור את התוצאות כרגע. אפשר לנסות שוב, או להמשיך — נשלים את השמירה בשלב הבא.';
}
