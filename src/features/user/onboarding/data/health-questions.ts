import { makeLiveT } from '@/lib/i18n/live-t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeLiveT(onboarding);

export const HEALTH_QUESTIONS = [
  { id: 'heart_disease', get text() { return t('healthDeclaration.q.heart_disease'); } },
  { id: 'chest_pain_rest', get text() { return t('healthDeclaration.q.chest_pain_rest'); } },
  { id: 'chest_pain_daily', get text() { return t('healthDeclaration.q.chest_pain_daily'); } },
  { id: 'chest_pain_activity', get text() { return t('healthDeclaration.q.chest_pain_activity'); } },
  { id: 'dizziness', get text() { return t('healthDeclaration.q.dizziness'); } },
  { id: 'fainting', get text() { return t('healthDeclaration.q.fainting'); } },
  { id: 'asthma_meds', get text() { return t('healthDeclaration.q.asthma_meds'); } },
  { id: 'asthma_symptoms', get text() { return t('healthDeclaration.q.asthma_symptoms'); } },
  { id: 'family_heart', get text() { return t('healthDeclaration.q.family_heart'); } },
  { id: 'family_sudden', get text() { return t('healthDeclaration.q.family_sudden'); } },
  { id: 'doctor_supervision', get text() { return t('healthDeclaration.q.doctor_supervision'); } },
  { id: 'chronic_disease', get text() { return t('healthDeclaration.q.chronic_disease'); } },
  { id: 'pregnancy', get text() { return t('healthDeclaration.q.pregnancy'); } },
];

export const legalText = (): string => t('healthDeclaration.legalText');
