/**
 * i18n wave 2 batch ak (namespace `legal`, keys `termsDoc.*` / `privacyDoc.*`): the Terms of Use and
 * the Privacy Policy as the app renders them. The full document tree (titles, intros, every
 * paragraph, subsections; `body` kept as string vs array) is serialised and compared to a snapshot
 * recorded BEFORE the extraction from unmodified origin/main — legal text must stay byte-identical.
 */
import { expect, it } from 'vitest';
import { LEGAL_VERSION, LEGAL_LAST_UPDATED_HE, toParagraphs, type LegalDoc } from '../legal-content';
import { getTermsDoc, getPrivacyDoc } from './docs-under-test';

const dump = (doc: LegalDoc) => JSON.stringify(doc, null, 2);
const paragraphsDump = (doc: LegalDoc) =>
  JSON.stringify(
    [toParagraphs(doc.intro), ...doc.sections.map((s) => [s.title, toParagraphs(s.body), ...(s.subsections ?? []).map((u) => [u.title, toParagraphs(u.body)])])],
    null,
    2,
  );

it('terms of use: full document', async () => {
  await expect(dump(getTermsDoc())).toMatchFileSnapshot('./__snapshots__/terms-doc.json');
});
it('privacy policy: full document', async () => {
  await expect(dump(getPrivacyDoc())).toMatchFileSnapshot('./__snapshots__/privacy-doc.json');
});
it('terms of use: rendered paragraphs (what the modal prints)', async () => {
  await expect(paragraphsDump(getTermsDoc())).toMatchFileSnapshot('./__snapshots__/terms-paragraphs.json');
});
it('privacy policy: rendered paragraphs (what the modal and /privacy print)', async () => {
  await expect(paragraphsDump(getPrivacyDoc())).toMatchFileSnapshot('./__snapshots__/privacy-paragraphs.json');
});
it('version and date label stay data', () => {
  expect(LEGAL_VERSION).toBe('2.4');
  expect(LEGAL_LAST_UPDATED_HE).toBe('אוקטובר 2026');
});
