import { beforeAll, describe, expect, it } from 'vitest';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';
import { common } from '@/messages/ns/common';
import { weekdayMessageArg } from '../weekday-message-arg';

const HE_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

describe('weekdayMessageArg', () => {
  it('Hebrew: the bare letter, so the message output is byte-identical to the old DAY_LETTERS_HE', () => {
    const tc = makeT('he', common);
    const t = makeT('he', onboarding);
    for (let d = 0; d < 7; d++) {
      const letter = weekdayMessageArg(d, 'he', tc);
      expect(letter).toBe(HE_LETTERS[d]);
      expect(t('steps.schedule.popover.title', { day: letter })).toBe(`מה מתאמנים ביום ${HE_LETTERS[d]}׳?`);
      expect(t('signup.days.windowAria', { letter })).toBe(`שעה ביום ${HE_LETTERS[d]}׳`);
      expect(t('signup.days.removeAria', { letter })).toBe(`הסרת יום ${HE_LETTERS[d]}׳`);
      expect(t('signup.days.addAria', { letter })).toBe(`הוספת יום ${HE_LETTERS[d]}׳`);
    }
  });

  beforeAll(async () => {
    await ensureCatalog('en', 'common');
    await ensureCatalog('en', 'onboarding');
  });

  it('English: Sun/Mon..., never a Hebrew letter', () => {
    const tc = makeT('en', common);
    const t = makeT('en', onboarding);
    for (let d = 0; d < 7; d++) {
      const letter = weekdayMessageArg(d, 'en', tc);
      expect(letter).toBe(EN_SHORT[d]);
      for (const msg of [t('steps.schedule.popover.title', { day: letter }), t('signup.days.windowAria', { letter }), t('signup.days.addAria', { letter }), t('signup.days.removeAria', { letter })]) {
        expect(msg).toContain(EN_SHORT[d]);
        expect(msg).not.toMatch(/[א-ת]/);
      }
    }
  });
});
