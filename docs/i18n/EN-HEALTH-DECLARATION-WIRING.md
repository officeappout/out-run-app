# English health declaration: wiring plan (LATER, not done here)

> Status: **DRAFT plan. No code changed.** Read after [EN-HEALTH-DECLARATION-DRAFT.md](./EN-HEALTH-DECLARATION-DRAFT.md) is approved by legal. Verified against `origin/main` at d73f1783.

## 1. What reads Hebrew today

| Where | What | Problem for English |
|---|---|---|
| `src/features/user/onboarding/data/health-questions.ts` | `const t = makeT('he', onboarding)` at **module load**; `HEALTH_QUESTIONS[].text` and `LEGAL_TEXT` are plain strings frozen in Hebrew | Not locale-reactive. Also used for ids only in `handleFastTrack` and `allAnswered`. |
| `HealthDeclarationStep.tsx` | `useT(onboarding)` for the 29 `health.*` keys; imports `HEALTH_QUESTIONS`, `LEGAL_TEXT` directly | UI follows locale; questions and legal text do not. |
| `health-signer-identity` / `healthGender` | gender for Hebrew copy | Ignored in English. |
| `src/features/user/onboarding/services/pdf-service.ts` | Loads `public/assets/documents/health-declaration-template.pdf` (Hebrew), SimplerPro Hebrew font, `reverseHebrew()`, coordinates for RTL layout | Needs an English template, Latin font path, LTR coordinates. |
| `src/features/legal/legal-content.ts` | `LEGAL_VERSION = '2.4'`; terms/privacy modal | `src/messages/en/legal.json` is empty: the links open Hebrew documents. |
| `src/messages/en/onboarding.json` | 29 `health.*` keys removed deliberately (PR #894) | Re-add after approval (section 5). |

## 2. What is stored as the signed declaration

Write path: `HealthDeclarationStep.handleSubmit` -> `submitHealthDeclaration(uid, record, onSaved)` in `health-declaration-record.ts`:

1. **Firestore `users/{uid}/private/legal`**, field `healthDeclaration`: `{ answers: Record<questionId, boolean>, signature (PNG data URL, compacted), signerName, signedAt (ISO), termsVersion (LEGAL_VERSION), usedFastTrack }`. Plus `healthDeclarationPdfUrl`, `healthDeclarationPdfStatus` ('pending' | 'done' | 'failed'), `healthDeclarationPdfError`, `updatedAt`.
2. **Storage** `health-declarations/{uid}/health-declaration-{ts}.pdf` with `customMetadata { userName, generatedAt }`. Built in the background from the Firestore record; a once-per-session self-heal regenerates a missing PDF.
3. **Onboarding store / profile** via `updateData` and `onboarding-sync.service.ts`: `healthDeclarationAccepted`, `healthTermsAccepted`, `healthAnswers`, `healthSignature`, `healthUsedFastTrack`, `healthTimestamp`, `healthUserName`, `healthGender`, `termsVersion`. `hasAcceptedHealthDeclaration()` (`src/lib/health-declaration.ts`) reads `healthDeclarationAccepted` (top-level or nested under `health`).
4. Consumers: admin user page (`src/app/admin/users/[uid]/page.tsx`, reads `healthDeclarationPdfUrl`), `legalHold` Cloud Function (reads the same field name), `delete-data` page, `onboarding-session-reset`.

**Key point:** the questions and legal sentence are **not stored as text**. Only answers (by id), the signature and `termsVersion`. The stored PDF is a Hebrew template with name, date and signature stamped. So "the text the user signed" is reconstructed from (a) the current code strings and (b) the template file. If either changes later, an old record no longer shows what was signed.

## 3. Proposed backward-compatible storage

Add to `HealthDeclarationRecord` (all optional so old records stay valid; Firestore merge write):

```ts
declarationLocale?: 'he' | 'en';      // locale of the text actually shown
declarationTextVersion?: string;       // e.g. 'health-2026-11-en-1' (bump on any text change)
declarationTextHash?: string;          // sha-256 of the exact rendered text (questions + legal text, in order)
declarationTemplateId?: string;        // which PDF template, e.g. 'health-he-v1' | 'health-en-v1'
```

- Compute the hash from the strings **as rendered**, in order, joined with `\n`; keep a small registry `health-text-versions.ts` mapping `declarationTextVersion` -> `{ locale, hash, templateId }` so history stays readable.
- Missing fields mean "Hebrew, original text" (legacy). Do **not** backfill Hebrew records in bulk.
- Optionally store the rendered text itself (about 3 KB) under `healthDeclaration.renderedText` for new records: simplest proof of what the user saw; weigh against the 1 MiB doc limit (signature is the large part).
- Mirror `declarationLocale` into the onboarding store next to `termsVersion`; do not change `healthDeclarationAccepted` semantics.

## 4. Risks to existing Hebrew records

1. **Never rewrite or re-generate old PDFs with a new template.** The self-heal regenerates a missing PDF from the stored record and "stamps with the original signing date": it must pick the template by `declarationTemplateId` (absent -> Hebrew v1), otherwise a Hebrew signer could get an English PDF.
2. **Hebrew text edits (e.g. fixing the garbled PDF clause) change what old records "mean".** Treat any edit as a new text version; keep the old template file.
3. **Answer ids are the contract.** The 13 ids (`heart_disease` ... `pregnancy`) must stay identical across locales. Never reorder or renumber by locale (numbers are currently inside the string).
4. **Module-level `makeT('he')`.** Switching to a locale-aware accessor (hook or function taking locale) must not change the Hebrew output byte for byte; existing snapshot tests (`av-i18n-parity`, `legal-he.test.ts`, `constants-misc.json`) guard this.
5. **Admin/legalHold/delete-data** read `healthDeclarationPdfUrl` and may assume Hebrew; the new fields are additive, but the admin UI should show locale/version.
6. **Language switch mid-flow.** If the user changes language after answering, answers survive by id but the signature was drawn against different text: either block switching on this step or clear the signature.
7. **Fast-track flag** is stored; keep it, and show it in the admin view.
8. **Terms links** open `legal.json` content which has no English: ship the English terms/privacy before enabling the English declaration, or the English user consents to a Hebrew document.
9. **Re-declaration after a text change:** no code enforces the two-year renewal; do not introduce one silently.

## 4b. Suggested code shape (for the later PR)

- `health-questions.ts`: export ids only (`HEALTH_QUESTION_IDS`) and a function `getHealthQuestions(t)`/`getLegalText(t)`; keys `healthDeclaration.q.<id>` and `healthDeclaration.legalText` stay.
- `HealthDeclarationStep`: use `useT(onboarding)` for all; pass `locale` to `submitHealthDeclaration` and compute `textHash` from rendered strings.
- `pdf-service.ts`: select template/font/layout by `declarationTemplateId`; add English template and Latin font; keep the Hebrew path untouched.
- Tests: Hebrew parity unchanged; a record without the new fields still renders; English key parity with he (ICU/placeholder checks).

## 5. Keys to add to `src/messages/en/onboarding.json` once approved

All from section C of the draft (29 `health.*`), the four `healthPage.*`, 13 `healthDeclaration.q.*`, `healthDeclaration.legalText`:

`health.title`, `health.description`, `health.intro.sentence`, `health.intro.name`, `health.intro.sub`, `health.privacyInfo`, `health.fastTrack.cta`, `health.fastTrack.note`, `health.answer.no`, `health.answer.yes`, `health.answer.yesWarning`, `health.signature.title`, `health.signature.subtitle`, `health.signature.placeholder`, `health.signature.clear`, `health.signature.received`, `health.signature.missing`, `health.terms`, `health.blocked`, `health.submitting`, `health.cta.blocked`, `health.cta.submit`, `health.progress`, `health.hint.sign`, `health.hint.terms`, `health.safety.title`, `health.safety.private`, `health.safety.medical`, `health.safety.ok`, `healthPage.loading`, `healthPage.skipFailed`, `healthPage.title`, `healthPage.description`, `healthDeclaration.q.heart_disease`, `.chest_pain_rest`, `.chest_pain_daily`, `.chest_pain_activity`, `.dizziness`, `.fainting`, `.asthma_meds`, `.asthma_symptoms`, `.family_heart`, `.family_sudden`, `.doctor_supervision`, `.chronic_disease`, `.pregnancy`, `healthDeclaration.legalText`.

New keys (English only, if the recommendations are accepted): age confirmation, separate health-data consent, "not medical advice", "a doctor has approved" path. Also the `health.terms` rich-text tags `<terms>`, `<privacy>` and `health.fastTrack.note`'s `<b>` must be kept exactly (parity checker). The English PDF template is a **file**, not a catalog key.
