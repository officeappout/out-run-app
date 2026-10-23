import { buildTermsDoc, buildPrivacyDoc } from '../legal-content';
import { makeT } from '@/lib/i18n/t';
import { legal } from '@/messages/ns/legal';

const t = makeT('he', legal);
export const getTermsDoc = () => buildTermsDoc(t);
export const getPrivacyDoc = () => buildPrivacyDoc(t);
