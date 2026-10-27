import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

export const HEALTH_QUESTIONS = [
  { id: 'heart_disease', text: t('healthDeclaration.q.heart_disease') },
  { id: 'chest_pain_rest', text: t('healthDeclaration.q.chest_pain_rest') },
  { id: 'chest_pain_daily', text: t('healthDeclaration.q.chest_pain_daily') },
  { id: 'chest_pain_activity', text: t('healthDeclaration.q.chest_pain_activity') },
  { id: 'dizziness', text: t('healthDeclaration.q.dizziness') },
  { id: 'fainting', text: t('healthDeclaration.q.fainting') },
  { id: 'asthma_meds', text: t('healthDeclaration.q.asthma_meds') },
  { id: 'asthma_symptoms', text: t('healthDeclaration.q.asthma_symptoms') },
  { id: 'family_heart', text: t('healthDeclaration.q.family_heart') },
  { id: 'family_sudden', text: t('healthDeclaration.q.family_sudden') },
  { id: 'doctor_supervision', text: t('healthDeclaration.q.doctor_supervision') },
  { id: 'chronic_disease', text: t('healthDeclaration.q.chronic_disease') },
  { id: 'pregnancy', text: t('healthDeclaration.q.pregnancy') },
];

export const LEGAL_TEXT = t('healthDeclaration.legalText');
