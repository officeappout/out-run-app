import { describe, expect, it } from 'vitest';
import { decideHtmlLangDir } from '../locale-resolution';

// Regression: a persisted legacy store left at en/ltr (English testing, challenge visit) flipped Hebrew <html dir>.
describe('Hebrew never renders ltr', () => {
  it('transient (i18n not yet resolved) and settled states are rtl', () => {
    const stale = { locale: 'he' as const, legacyLanguage: 'en' as const, legacyDirection: 'ltr' as const };
    expect(decideHtmlLangDir({ ...stale, i18nEnabled: false }).dir).toBe('rtl');
    expect(decideHtmlLangDir({ ...stale, i18nEnabled: true }).dir).toBe('rtl');
  });
});
