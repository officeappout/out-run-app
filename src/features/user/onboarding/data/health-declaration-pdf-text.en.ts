/**
 * English text of the signed health declaration PDF (template id 'health-en-v1').
 *
 * Source: docs/i18n/EN-HEALTH-DECLARATION-DRAFT.md tables A, B and D, English text approved by the
 * owner on 29.10.2026. The Hebrew PDF is a static template file; the English one is typeset from
 * this data (LTR, Latin glyphs of Simpler Pro). The 13 ids match HEALTH_QUESTIONS (the answer
 * contract) and must never be reordered.
 *
 * The clause that names "the municipality" in the Hebrew template is deliberately NOT carried over:
 * the draft doc flags it (and its garbled source sentence) as unresolved, so the English PDF uses
 * the same liability sentence the user sees on screen.
 */

export const HEALTH_PDF_TEMPLATE_ID_EN = 'health-en-v1';

export const HEALTH_PDF_TEXT_EN = {
  title: 'Health declaration',
  nameLabel: 'Name:',
  dateLabel: 'Date:',
  instructionsTitle: 'Instructions',
  instructions: [
    "If any answer points to a medical problem, you won't be able to sign up for the app.",
    'If your health changes, talk to a doctor about whether to continue physical activity.',
  ],
  defaultNote: 'Note: answers are marked "No" by default.',
  answerNo: 'No',
  answerYes: 'Yes',
  questions: [
    { id: 'heart_disease', text: '1. Has your doctor told you that you have a heart condition?' },
    { id: 'chest_pain_rest', text: '2. Do you feel pain in your chest when you are resting?' },
    { id: 'chest_pain_daily', text: '3. Do you feel pain in your chest during your normal daily activities?' },
    { id: 'chest_pain_activity', text: '4. Do you feel pain in your chest when you do physical activity?' },
    { id: 'dizziness', text: '5. In the past year, have you lost your balance because of dizziness?' },
    { id: 'fainting', text: '6. In the past year, have you lost consciousness?' },
    { id: 'asthma_meds', text: '7. Has a doctor diagnosed you with asthma and, because of it, have you needed medication in the past three months?' },
    { id: 'asthma_symptoms', text: '8. Has a doctor diagnosed you with asthma and, because of it, have you had shortness of breath or wheezing in the past three months?' },
    { id: 'family_heart', text: '9. Has a first-degree relative (parent, sibling or child) died of a heart condition?' },
    { id: 'family_sudden', text: '10. Has a first-degree relative died suddenly at a young age? (Before age 55 for a male relative, before age 65 for a female relative.)' },
    { id: 'doctor_supervision', text: '11. In the past five years, has your doctor told you to do physical activity only under medical supervision?' },
    { id: 'chronic_disease', text: '12. Do you have a long-term (chronic) condition that is not mentioned above and that could prevent or limit you from doing physical activity?' },
    { id: 'pregnancy', text: '13. If you are pregnant: has this pregnancy, or any earlier pregnancy, been described as high-risk?' },
  ],
  declarations: [
    'I declare that I have read and understood the whole medical questionnaire, and that all my answers on this form are "No".',
    'I declare that I have given complete and accurate information about my medical condition, past and present.',
    'I understand that two years after I sign this declaration I will need to provide a new one.',
    'I understand that I alone am responsible for any injury or harm to my health, of any kind, that happens during the activity.',
    'The health benefits of regular physical activity are clear. This questionnaire will help you decide when to talk to a doctor.',
    'I make this declaration of my own free will, after understanding what it says and agreeing to it.',
  ],
  signatureLabel: 'Signature:',
} as const;
