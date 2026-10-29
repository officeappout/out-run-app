# Add a language (playbook for ONE agent, end to end)

> Trigger: the owner says "add language X" (example below: Spanish, `es`, native "Español", Hebrew "ספרדית").
> One agent runs phases 0 to 9 without stopping, except at the **owner gates**. Based on how English was done
> (PLAN.md wave 6, EN-PILOT-PLAN.md, PRs #887 #893 #894 #912 #915 #916 #917 #920 #922, content locale #902, he-only surfaces #900 #918, makeLiveT #921).
> Project skill with the same checklist: `.claude/skills/add-language/SKILL.md`.

## Owner gates (stop and ask, everything else is yours)

| Gate | When |
|---|---|
| Merge approval of every PR | after CI is green and the independent review is clean |
| Glossary decisions marked **(!)** and the voice/formality choice (tu/usted, du/Sie) | end of phase 1, one short list, then continue with the proposed defaults for the rest |
| Flipping any flag (`enable_i18n`, `enable_locale_<xx>`, `enable_content_locale`, `hide_he_only_onboarding_steps`) | never yourself |
| Functions deploy (push/Kelly server text) | never yourself |
| Production Firestore writes: `apply-import.ts --confirm-production`, push library rows, any `--apply` | owner says go for that exact run |
| Legal text (`legal` namespace, terms, privacy, health declaration) | lawyer; leave Hebrew via fallback |
| Native-speaker review of the UI and of the exercise names | owner arranges |

Never: push to `main`, `vitest -u` unfiltered, full `tsc`, edit the stale main checkout, write Firestore from a tool that is not `apply-import.ts`.

## Phase 0: set up

```bash
cd /Users/calisthenicsltd/Development/appout-1 && git fetch -q origin
git worktree add ../appout-1-add-es -b feat/i18n-es-scaffold origin/main
ln -s ../appout-1/node_modules ../appout-1-add-es/node_modules
cd ../appout-1-add-es
npx tsx scripts/i18n/add-locale-scaffold.ts --check es --native Español --hebrew ספרדית   # what is missing (everything)
```

Every later PR is a new branch off `origin/main`. **Before every merge, `git merge origin/main`** (parallel PRs touch the same files; see lessons).

## Phase 1: scaffold, glossary, voice, exercise names (PR 1: "locale scaffold + terminology")

1. Scaffold (flag default OFF, empty catalogs, no visible change):
   ```bash
   npx tsx scripts/i18n/add-locale-scaffold.ts es --native Español --hebrew ספרדית [--intl es-ES] [--rtl]
   node functions/scripts/vendor-copy-geo-discovery.js          # refreshes functions mirrors (also done by the scaffold)
   ```
   It edits: `locales.ts` (LOCALES, INTL_TAG, LOCALE_NATIVE_NAME, RTL_LOCALES) + functions copy, `catalogs.ts` loader regex, flag `enable_locale_es`
   in `feature-flag-defs.ts` + admin switch card, `locale-resolution.ts`, `LocaleSync.tsx`, `useLanguageSetting.ts`, functions `user-locale.service.ts`
   and `i18n-catalog-mirror.js`, `locale-profiles.ts` (status `partial`), empty `src/messages/es/*.json`, doc skeletons.
   Registry of required sites: `scripts/i18n/locale-registry.ts`. Re-run `--check es` until nothing says MISSING.
2. Fix the follow-ups it prints: test fixtures that build `LocaleFlags` (`enableLocaleDe: ...`) need `enableLocaleEs`. Do not run the real scaffold for a language the owner did not ask for.
3. Write `docs/i18n/ES-GLOSSARY.md`, `ES-VOICE.md`, `ES-EXERCISE-NAMES.md`, derived from `EN-GLOSSARY.md`, `EN-VOICE.md`, `EN-EXERCISE-NAMES.md`
   (same sections and numbering, Hebrew column unchanged, English column re-derived; keep the DNT list: OUT, Kelly, XP, placeholders, emoji).
   Fill the ```` ```lint ```` block of the glossary (read by the validator, format in the skeleton), e.g. `רצף => racha => streak`.
   Decide per language: formal/informal address, regional variant, how gender is handled (ru/es need gendered forms, de often neutral), length risk (de +30%), quote and number conventions, `allowNbsp` in `locale-profiles.ts` if the language needs no-break spaces.
4. Plural check: `node -e "console.log(new Intl.PluralRules('es').resolvedOptions().pluralCategories)"`. ru needs `one/few/many/other`, ar has six, es/fr/pt also list `many` (only reached by 1,000,000: validator warns, not errors).
5. Targeted tests, then PR. Owner gate: the (!) decisions list.

```bash
npx vitest run src/lib/i18n/__tests__/catalogs.test.ts src/lib/i18n/__tests__/locale-catalogs-validate.test.ts \
  src/lib/i18n/__tests__/functions-i18n-mirror.test.ts src/lib/i18n/__tests__/locale-resolution.test.ts \
  src/lib/i18n/__tests__/language-setting.test.ts src/components/system/__tests__/locale-sync-gender.test.tsx scripts/i18n
```

## Phase 2: catalogs, one namespace group per PR (the English order)

Order (smallest and most visible first): `common`+`pages` -> `onboarding` -> `player`+`summary` -> `home`+`profile` -> `map` -> `community`+`social`+`together` -> `library`+`coach`+`wide` -> `schedule` -> `push` (see lessons: server side). `legal` last, lawyer, owner gate.

Per batch (agents translate in chunks of ~250 keys; give each: voice + glossary + exact output contract from EN-PILOT-PLAN §4):

1. Write `src/messages/es/<ns>.json` with the **exact key order** of `he/<ns>.json`. Skip keys that are language-neutral (identical to Hebrew: protocol names, symbols) and keys of he-only surfaces (they fall back to Hebrew on purpose).
2. Validate (blocking errors must be 0; read the warnings):
   ```bash
   npx tsx scripts/i18n/validate-catalog.ts --locale es --partial --ns home,profile
   ```
   Checks: key parity, ICU parse with the locale, placeholders, **plural categories from `Intl.PluralRules`**, select/gender branches, rich tags, Hebrew characters, invented digits, untranslated, banned long dash, zero-width/NBSP, push `@tokens`, glossary lint. For `en` the English-only checks (`validate-en-catalog.ts`) also run.
3. Add a Hebrew-untouched parity test modeled on `src/lib/i18n/__tests__/en-pilot-parity.test.ts` (register the es catalogs, assert Hebrew output is byte-identical). **No per-locale key-count assertions** (that is what conflicted between parallel English PRs); the generic `locale-catalogs-validate.test.ts` needs none.
4. Independent reviewer (a different agent, given the diff only, not your reasoning): checks placeholders, plural branches, gender, glossary terms, tone, truncation risk; reports defects, you fix.
5. `git merge origin/main`, rerun the targeted vitest, push, PR, wait for CI (unit, typecheck, safety, emulator), fix your failures. Owner gate: merge.

When the last batch lands: set `status: 'complete'` in `locale-profiles.ts` (CI then demands every in-scope key) BEFORE the owner flips `enable_locale_es`.

## Phase 3: layout and formatting

- RTL/LTR: `dirOf` comes from `RTL_LOCALES`; LTR languages need nothing else. Wave 4 made layouts logical (`ms/me/ps/pe/start/end`). Components that host LTR content inside Hebrew-oriented code must be checked on a device.
- Numbers, dates, units: `formatNumber/formatDate` use `INTL_TAG`; add the unit and weekday keys to `common` (`units.*`, `weekdays.*`). Test one date and one number in the new locale.
- RTL target locales (e.g. `ar`): pass `--rtl` to the scaffold (adds `RTL_LOCALES`); the validator's direction checks do not cover RTL (it only allows bidi marks), so layout, mirrored icons and bidi text need a manual device pass.
- Long languages (de, ru): check the length warnings (V11 for en; review manually elsewhere) on buttons, chips, tabs.

## Phase 4: he-only surfaces

Army/unit/reserve surfaces and the persona step are hidden for non-Hebrew UIs: `shouldShowHeOnlySteps` (`src/features/user/onboarding/utils/he-only-steps.ts`, flag `hide_he_only_onboarding_steps`), `COMMUNITY_HIDDEN` and `ONBOARDING_SKIPPED` in `validate-en-catalog.ts` (shared by the generic validator). Nothing to build for a new locale; only verify the same keys stay Hebrew (the validator errors if you translate one). The health declaration stays Hebrew until legal text exists (owner gate).

## Phase 5: exercise content pipeline (never writes Firestore until the last step)

Prerequisite PR (code, small): widen the content language types for the new code (`AppLanguage`, `ExerciseLang`, `LocalizedText`, `contentLanguage()` in `src/features/content/shared/content-locale.ts`, the admin importer language option). Flag: `enable_content_locale` (owner).

```bash
W=work/es-exercises   # outside tracked dirs; add to .gitignore if needed
npx tsx scripts/i18n/content/export-exercises.ts --target es --out $W                 # READ-ONLY. export.json + chunks/*.json
# translate every chunks/chunk-NNN.json: fill "target" for each item (agents, ~150 strings per chunk, glossary + ES-EXERCISE-NAMES.md as context)
npx tsx scripts/i18n/content/merge-translations.ts --export $W/export.json --chunks $W/chunks --out $W/import.json
npx tsx scripts/i18n/content/verify-import.ts --export $W/export.json --import $W/import.json --require-complete
```
- The merge fills ONLY empty or corrupt targets (Hebrew characters, "Copy of", "(Copy)"). Existing good targets survive.
- Independent review: a second agent reads `import.json` (not the chunks) against `ES-EXERCISE-NAMES.md`, flags wrong terms, inconsistent names for the same movement, stray source language. Fix in the chunks, merge and verify again.
- Check the corrupt English names first (`grep -c "Copy of" $W/export.json`): they are exported as targets to redo in every language and are also an English data bug to report to the owner.
- Same pipeline for programs, push library rows, gear: not covered by these scripts yet; extend `exercise-bulk.ts` (pure, tested) rather than writing one-offs.

**Owner gate: production write.** Dry run first (reads only), then with the owner's go:
```bash
npx tsx scripts/i18n/content/apply-import.ts --import $W/import.json --export $W/export.json                      # dry run, prints what would change
npx tsx scripts/i18n/content/apply-import.ts --import $W/import.json --export $W/export.json --confirm-production # backup, write, post-verify
```
`apply-import` refuses unless verify passes, skips any exercise whose Hebrew text/structure or a good target changed since the export, backs up every touched document to `backups/` (aborts if it cannot), writes only the target slot (+ `supportedLangs`, `updatedAt`), then re-reads and verifies source slots unchanged, targets equal the import, nothing else changed. Restore = write the backup file's documents back.

Notes: `hasSourceScript` (corrupt-target detection, "no source-language characters") only knows the scripts he, ar and ru; for another source language add its range in `exercise-bulk.ts`. `apply-import` refuses target `he` or the source language, and re-reads every document right before its batch (skips and reports any edited meanwhile; the write is pinned to the fresh `updateTime`). The dirs the scripts write (`work/`, `backups/`) are git-ignored.

## Phase 6: server-side text

Not covered by catalogs of `src/`: Kelly (AI coach prompt language line + guard), push senders (`functions/src`, `push` namespace mirrored by `functions/scripts/i18n-catalog-mirror.js`, flag `push_locale_v1`), emails, SMS. Separate PRs after the catalogs; functions deploy and prompts are owner gates. Keep `@tokens` of push keys byte for byte (validator G20). Hebrew-only server copy (Kelly, push senders) must be audited, not assumed translated.

## Phase 7: store listing, subtitles, legal, QA

Store page text and screenshots (`store-assets/`), video subtitles (VTT), legal documents (lawyer). Layout QA on small phones with the longest strings, RTL/LTR switch back and forth, language picker for the owner (super admin preview of `es` is an owner decision: `effectiveLocaleFlags`).

## Phase 8: handoff to the owner

Final PR comment / report: PR list, counts per namespace, open (!) questions, what the owner must do: native-speaker pass, flag order (`enable_i18n` already on? then `enable_locale_es`), content apply, functions deploy. Never flip flags.

## Lessons learned (English)

- **LTR hosts**: Tailwind `ltr:` variants match ANY ltr ancestor, so a `dir="ltr"` island inside Hebrew (phone, clock) makes `ltr:` classes fire there. Use `ltr:`/`rtl:` only where the host direction is the page direction; verify on a device.
- **Parallel PRs conflict on counts**: tests that assert key counts (`en-pilot-validate.test.ts`) and shared files (`validate-en-catalog.ts`) collide. `git merge origin/main` before EVERY merge, rerun the targeted tests, and avoid new hard-coded counts (the generic test has none).
- **Module-scope `makeT('he', ns)`** freezes the language at import time. Use the live variant (`makeLiveT`, PR #921) or `useT`/`getT` at render time.
- **Server-side Hebrew** (Kelly, push senders, emails) is invisible to the catalog parity checks: audit `functions/src` for Hebrew literals separately.
- **He-only surfaces** (army, persona step, health declaration) stay Hebrew via fallback; do not translate them, the validator errors on it.
- **Corrupt English names** ("Copy of ...") exist in exercise data; the merge treats them as empty so they get a real translation, and the verify step rejects any left.
- **Hebrew must stay byte-identical**: every PR ends with the Hebrew-untouched parity test green.
- **Never `vitest -u` unfiltered**: snapshots are Hebrew parity proofs; update one named test file at a time and read the diff.
- **No "—"** (long dash) anywhere in copy or replies; typographic apostrophes follow the voice doc of the language; no `'` ambiguity with ICU quoting (validate with the real parser, locale passed).
- **Plurals are per language**: ru one/few/many/other, never copy English branches; `=1` instead of `one` is a warning, not a fix.
- **Gender**: Hebrew gender selects may collapse in the target when the language has no gender there; where it does (ru past tense, es adjectives) keep `female/male/other` with `other`. Unknown gender gets neutral phrasing (owner decision).
- **Flags**: all locale flags default OFF and `superAdminValue: false`; the language picker shows only locales whose flag is on.

## Tooling index

| What | Where |
|---|---|
| Locales config (one line per locale in validation) | `src/lib/i18n/locale-profiles.ts` |
| Generic validator | `scripts/i18n/validate-catalog.ts --locale <xx> [--partial] [--ns a,b] [--json]` |
| English validator (unchanged, also run for `en`) | `scripts/i18n/validate-en-catalog.ts` |
| Generic test | `src/lib/i18n/__tests__/locale-catalogs-validate.test.ts` |
| Registry of required sites + check | `scripts/i18n/locale-registry.ts`, `add-locale-scaffold.ts --check <xx>` |
| Scaffold | `scripts/i18n/add-locale-scaffold.ts <xx> --native .. --hebrew .. [--dry-run]` |
| Content pipeline | `scripts/i18n/content/{export-exercises,merge-translations,verify-import,apply-import}.ts`, pure core `exercise-bulk.ts` |
| Admin importer it mirrors | `src/features/content/exercises/services/exercise-translation.utils.ts` |
