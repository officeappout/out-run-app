/**
 * Namespace `onboarding` — the /onboarding-new/access-code page (`accessCodeLink.*`): 18 keys, Hebrew pinned,
 * and every error key the helper can return exists in the catalog.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';
import { accessCodeErrorKey } from '@/features/user/onboarding/utils/institution-code';

const t = makeT('he', onboarding);

describe('onboarding (he) — access-code link page', () => {
  it('has 18 accessCodeLink keys', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('accessCodeLink.'))).toHaveLength(18);
  });
  it('Hebrew copy matches the access-code modal / gate wording', () => {
    const cases: Array<[Parameters<typeof t>[0], string]> = [
      ['accessCodeLink.title', 'קוד גישה'],
      ['accessCodeLink.subtitle', 'הזינו את הקוד שקיבלתם מהארגון שלכם'],
      ['accessCodeLink.verified', 'הקוד אומת!'],
      ['accessCodeLink.error.notFound', 'קוד גישה לא נמצא. בדקו ונסו שוב.'],
      ['accessCodeLink.error.expired', 'קוד הגישה פג תוקף.'],
      ['accessCodeLink.error.exhausted', 'קוד הגישה הגיע למכסה המקסימלית.'],
      ['accessCodeLink.error.inactive', 'קוד הגישה אינו פעיל יותר.'],
      ['accessCodeLink.error.generic', 'שגיאה בבדיקת הקוד. נסו שוב.'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
  it('every key the helper returns is in the catalog', () => {
    for (const e of [{ code: 'not-found' }, { message: 'expired' }, { code: 'resource-exhausted' }, { message: 'precondition' }, { message: 'complete your profile' }, { message: 'under-minimum-age' }, {}]) {
      expect(typeof t(accessCodeErrorKey(e))).toBe('string');
      expect(accessCodeErrorKey(e) in he).toBe(true);
    }
  });
});
