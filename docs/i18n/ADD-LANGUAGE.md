# Add a language (playbook for ONE agent, end to end)

> Trigger: the owner says "add language X" (example below: Spanish, `es`, native "Español", Hebrew "ספרדית").
> One agent runs phases 0 to 9 without stopping, except at the **owner gates**. Based on how English was done
> (PLAN.md wave 6, EN-PILOT-PLAN.md, PRs #887 to #955: catalogs #893 #912 #915 #916 #917 #920 #936, content #902 #928 #937 #938 #940, he-only #900 #918, makeLiveT #921 #927, LTR hosts #914 #929 #932, Kelly #935 #941, audit #947, existing users #950, TTS #951, dir #952, health PDF #954).
> Project skill with the same checklist: `.claude/skills/add-language/SKILL.md`.

## Owner gates (stop and ask, everything else is yours)

| Gate | When |
|---|---|
| Merge approval of every PR | after CI is green and the independent review is clean |
| Glossary decisions marked **(!)** and the voice/formality choice (tu/usted, du/Sie) | end of phase 1, one short list, then continue with the proposed defaults for the rest |
| Flipping any flag (`enable_i18n`, `enable_locale_<xx>`, `enable_content_locale`, `hide_he_only_onboarding_steps`, `push_locale_v1`, `ai_coach_locale_v1`) | never yourself; hand over the order in "Flag turn-on order" |
| Functions deploy (`sendPushFromQueue`, `onKellyThreadMessage`, push mirror) and Next.js (Vercel) deploy before any content write | never yourself |
| Production Firestore writes: `apply-import.ts` / `apply-collection-import.ts --confirm-production`, any `--apply` | owner says go for that exact run, after the dry run output is shown |
| Legal text (`legal` namespace, terms, privacy, health declaration) | lawyer; leave Hebrew via fallback |
| Native-speaker review of the UI and of the exercise names | owner arranges |

Never: push to `main`, `vitest -u` unfiltered, full `tsc`, edit the stale main checkout, write Firestore from a tool that is not one of the two `apply-*` scripts.

## Phase map (commands, gates, time, parallelism)

Times are from the English run (agent wall-clock, rough; the owner's review and merge latency is NOT included and was the real bottleneck).

| # | Phase | Output | Owner gate | Time | Runs in parallel with |
|---|---|---|---|---|---|
| 0 | Worktree | branch | none | 2 min | |
| 1 | Scaffold + glossary/voice/names | PR 1 | (!) list, formality | 1 to 2 h | |
| 2 | Catalogs (9 batches) | 9 PRs | merge each | 4 to 8 h agent time, translation chunks parallel | 5, 6 prep, 3 |
| 3 | Layout/format | PR | device pass | 1 h (LTR langs) | 2 |
| 4 | He-only check | none | none | 15 min | |
| 5 | Content (exercises + collections) | readers PR, import files | production write | 3 to 5 h pipeline | 2 (separate files) |
| 6 | Server text (Kelly, push, TTS, health PDF) | 3 to 4 PRs | functions deploy, legal | 4 to 6 h | 2, 5 |
| 7 | Audit sweep (hard-coded Hebrew, `dir`, `he-IL`) | PRs | merge | 3 to 6 h | after 2 |
| 8 | Store, legal, QA | docs | lawyer, native speaker | owner | |
| 9 | Handoff | report | flags | 15 min | |

### Parallelization plan (no file conflicts)
- Translation agents: one per chunk of ~250 keys or ~150 strings, each writes ONLY its own output file under `work/`. Safe to run 3 to 4 at once (machine load: max ~3 agents on the 16 GB Mac, check load first).
- Names agent is separate and runs first for exercises (one agent, whole `ES-EXERCISE-NAMES.md` context) so a movement keeps one name everywhere; other agents get its output as the terminology list.
- Independent review agents run after merge of translations, one per batch/PR, diff only.
- PR lanes that touch disjoint files can be open together: catalogs (`src/messages/<xx>/*.json`), content readers (`src/features/content/**`, `functions/src/lib`), Kelly (`src/lib/ai-coach/**`), TTS (`AudioService`, `audio-guidance`), dir/layout codemods (`src/components/**`).
- Conflict hotspots, never in parallel: `locale-profiles.ts`, `validate-en-catalog.ts`, `functions/src/shared/i18n-catalogs.ts` (regenerated mirror), `feature-flag-defs.ts`, catalog count tests. Merge these PRs sequentially, `git merge origin/main` and re-run the targeted tests each time.

## Flag turn-on order (owner; why)

All locale flags default OFF. Half-language UI is the risk: each step must have its data/server side deployed first.
1. `enable_i18n` (master; no visible change except super admin, who sees the new language before its flag).
2. Content applied in production AND Vercel + functions deployed with the readers, then `enable_content_locale`. Without it exercise/program names stay Hebrew inside the new UI.
3. `hide_he_only_onboarding_steps` (else the army/persona step shows in the new language).
4. Functions deployed, then `push_locale_v1` and `ai_coach_locale_v1` (else Hebrew pushes and Kelly for new-language users).
5. Last: `enable_locale_<xx>` (shows the picker; with the #950 rule only new users and explicit pickers change language).
Before step 5 check: existing-user rule (#950) merged, legal text decided, health PDF language decided, TTS merged, `status: 'complete'`.

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

## Phase 5: content pipeline (never writes Firestore until the last step)

Order of work: inventory, export, dedupe/chunk, translate, merge, independent review, verify, dry run, apply with `--confirm-production`, post-verify.

**0. Readers first.** Never write a collection before (a) its readers support the new shape AND (b) that code is deployed (Vercel for the app, functions for `push_messages`). A deployed old reader that meets `{he, xx}` shows `[object Object]` or an empty name. Stale open sessions of users keep the old bundle until reload: another reason to write only after the deploy and to keep the Hebrew string untouched.

Small prerequisite PR: widen `AppLanguage`, `ExerciseLang`, `LocalizedText`, `contentLanguage()` (`src/features/content/shared/content-locale.ts`), admin importer language option, `useContentLanguage()`. Flag `enable_content_locale` (owner).

**1. Inventory** (read-only): `scripts/_inventory-content-text.ts` (#928) lists every collection, field shape, unique Hebrew strings missing the target, word counts. Re-run it; do not assume the English table below is current.

**2. Per-collection shapes (how each was handled)**

| Collection | Stored shape | Reader rule |
|---|---|---|
| exercises, gear_definitions | `LocalizedText {he, xx, ...}` | `exercise-bulk.ts`; `supportedLangs` updated |
| programs, levels, programLevelSettings | Hebrew string, target in `<field>Localized` (#928) | service returns the Hebrew string, pair only when present; `pickProgramText`; saves fold English only if entered |
| gym_equipment, run templates, smart_messages, outdoorBrands, product_tags, level goals, push_messages | `string \| {he, xx}` (#938) | every reader normalizes to the SOURCE string (callers match on it); pair in `<field>Localized`; helpers `content/shared/stored-text-fields.ts` and `functions/src/lib/stored-text.ts` |
| site_content | new documents with locale `xx` (create, fails if id exists) | `CREATE_COLLECTIONS` in `collection-bulk.ts` |
| run player labels | pair carried (`labelLocalized`, `titleLocalized`), display helper `run-block-label.ts` (#940) | regexes and logic stay on the Hebrew label |

New collection or field: add it to `READY_PATHS` only when its reader is done; everything else is listed under `needsCode` and is never written. Hunt for raw readers (`String(data.title)`, Kelly classifiers, CSV importers, admin lists) that would turn an object into `[object Object]` or `''`; #938 found five.

**3. Exercises**
```bash
W=work/es-exercises   # git-ignored
npx tsx scripts/i18n/content/export-exercises.ts --target es --out $W            # READ-ONLY, export.json + chunks/
grep -c "Copy of" $W/export.json                                                 # corrupt admin duplicates, redo them
# names agent first (ES-EXERCISE-NAMES.md), then parallel chunk agents fill "target"
npx tsx scripts/i18n/content/merge-translations.ts --export $W/export.json --chunks $W/chunks --out $W/import.json
npx tsx scripts/i18n/content/verify-import.ts --export $W/export.json --import $W/import.json --require-complete
```
Merge fills ONLY empty or corrupt targets (source-script characters, "Copy of", "(Copy)"); good targets survive. Independent review agent reads `import.json` against the names doc: wrong terms, one movement with two names, stray source language. Fix in chunks, merge, verify again. `hasSourceScript` knows he, ar, ru only: add the range for another source language in `exercise-bulk.ts`.

**4. Other collections** (#937)
```bash
npx tsx scripts/i18n/content/export-collections.ts --collections programs,levels,gym_equipment --out $W   # export/<c>.json + sources/<c>.json (unique Hebrew strings)
# translate sources/<c>.json into translations/<c>.json (Hebrew -> target, null = skip junk); site_content also translations/site_content.creates.json
npx tsx scripts/i18n/content/build-collection-import.ts --collection programs --dir $W
npx tsx scripts/i18n/content/verify-collection-import.ts --export $W/export/programs.json --import $W/programs-import.json [--fresh <new export>]
```
Dedupe is built in: translate each unique Hebrew string once, the build step fans it out to every usage.  The collection scripts and `READY_PATHS` were written for `en`: check their language handling before the first run for another code.

**5. Owner gate: production write.** Show the dry run output, wait for the go for that exact run:
```bash
npx tsx scripts/i18n/content/apply-import.ts --import $W/import.json --export $W/export.json                        # dry run
npx tsx scripts/i18n/content/apply-import.ts --import $W/import.json --export $W/export.json --confirm-production   # backup, write, post-verify
# collections: apply-collection-import.ts --import <c>-import.json --export export/<c>.json [--confirm-production]
```
Both apply scripts: refuse unless verify passes, refuse target `he` and non-ready paths, skip any doc whose Hebrew changed or that already has a good target since the export, re-read right before each batch and pin the write to the fresh `updateTime`, back up every touched doc to `backups/` (git-ignored, under the worktree root; abort if it cannot), write only the target slot (+ `supportedLangs`, `updatedAt`), then re-read and verify source slots unchanged and targets equal to the import. Restore = write the backup documents back. After apply: re-run export and compare with `--fresh`, spot check 10 docs in the admin, then tell the owner the content is ready for `enable_content_locale`.

Admin tool needs `FIREBASE_SERVICE_ACCOUNT_KEY` or the usual `admin.ts` credentials; the local app preview also hits PRODUCTION Firestore, never test writes through it.

## Phase 6: server-side text and spoken output

Not covered by `src/` catalogs. Separate PRs after the catalogs, each with a Hebrew-parity baseline recorded from main in commit 1.

- **Push**: `push` namespace mirrored to `functions/src/shared/i18n-catalogs.ts` by `functions/scripts/i18n-catalog-mirror.js` (regenerate after every catalog change, count tests follow). `push_messages` library rows: if BOTH title and message have the target language, recipients split by `effectivePushLocale` (`enable_i18n` + `push_locale_v1` + `core.locale`); else a single Hebrew group. Keep `@tokens` byte for byte (validator G20). Functions deploy = owner gate.
- **Kelly** (#935, #941): `resolveCoachLocale(user, flags)` returns `he` unless `ai_coach_locale_v1` AND `enable_i18n` AND `users/{uid}.core.locale` is a locale Kelly has copy for; add `coach.json` for the language, a stable prompt with no Hebrew letters, voice rules from `<XX>-VOICE.md`, greeting/quick replies, proactive templates, push title in `onKellyThreadMessage` (needs functions deploy). Add per language: **safety detection patterns** (injury, chest pain, fainting, pregnancy; negation "no pain"; other-person "she/he/they"; false positives like "dizzying", "broke the PR") with a table test, and **reply guards** (ungrounded times/counts/weekdays/levels, false "saved"/"passed to the team" claims; the Hebrew foreign-word strip, feminine self-reference and blind-claim phrase lists do not port). Still Hebrew until done: tool results, workout data names, memory labels, Hebrew intent regexes.
- **Spoken cues / TTS** (#951): an `audio` catalog (`he` byte-identical, natural SPOKEN target text) and TTS `lang` from the locale (`he-IL`, `es-ES`); pick a matching voice when the device has one. The TTS lang must match the text actually spoken (never `en-US` voice reading Hebrew); prewarm the audio catalog so the first cue is not Hebrew.
- **Health declaration PDF** (#954): the PDF must use the SAME catalog text the user saw on screen. Typeset the language (LTR/RTL, font with the glyphs, ligatures off), store `declarationLocale` + `declarationTemplateId` on the record (legacy = Hebrew), self-heal regenerates in the signed language. The screen marks the record with the language only when the rendered legal text is not Hebrew. Lawyer gate.
- **App shell** (#954): `layout.tsx` reads the `out_locale` cookie (written by LocaleSync only while `enable_i18n` is on) for `<html lang dir>` and `og:locale`; no cookie = he/rtl. Manifest stays static he/rtl.
- Emails/SMS: none in `functions/src` (Firebase auth templates live outside the repo); re-check.

## Phase 7: audit sweep (do this BEFORE asking for flags)

The English audit (#947) found four blockers late. Run the same audit on day one of the next language:
```bash
grep -rn 'dir="rtl"' src --include=*.tsx -l | grep -v admin | wc -l        # hard-coded dir
grep -rn "he-IL" src functions/src | grep -v test                           # hard-coded locale formats
npx tsx scripts/i18n/validate-catalog.ts --locale es                        # warnings: length caps (V11 buttons/chips/titles)
```
and scan Hebrew literals reachable in the UI (comments and `i18n-allow-hebrew` lines excluded; ~25% of top files were dead code, check importers). Extract live clusters to catalogs with `makeLiveT` + Hebrew snapshots recorded first (#955, #948). Hard-coded `dir="rtl"` is a codemod per area (#952: remove where no ltr ancestor, `dir={direction}` from `useUiDir()` inside ltr tracks, `text-right` to `text-start`); batch by area, device pass.

## Phase 8: store listing, subtitles, legal, QA

Store text and screenshots (`store-assets/`), video subtitles (VTT), legal (lawyer; leave Hebrew via fallback and keep the draft marked), layout QA on small phones with the longest strings, language switching back and forth, super admin preview (`effectiveLocaleFlags`). First screen has the language pill (#939, `LanguageSwitchButton`, null unless `enable_i18n` + a non-he locale flag); it appears automatically for a new locale.

## Phase 9: handoff to the owner

Report: PR list, counts per namespace, open (!) questions, owner steps in order (native-speaker pass, content apply, functions deploy, Vercel deploy, flags in the order above, device checklist). Never flip flags.

## Lessons learned (one line each: problem, fix)

**Logic and data**
- Labels used as logic keys (run block labels matched by regex, `applyMainSet`, `mainSwap`): keep logic on the SOURCE string, localize only for display (`run-block-label.ts`, `labelLocalized`). Never persist localized display text (e.g. the `mainSwap` label: `applyMainSet` writes Hebrew labels explicitly, `bareSize` parses no unit text, #948).
- Readers normalize `{he, xx}` to the source string; raw readers (`String(x)`) are the bug source. Grep for them per collection.
- Corrupt "Copy of ..." admin duplicates: treated as empty by the merge, redone, and reported to the owner as a data bug.
- Never write content before readers are deployed; stale open sessions keep the old bundle.

**Language resolution**
- Existing users must not flip language (#947 blocker, #950): device detection only for NEW users (no profile, or `createdAt` within 24h, `isNewUserForLocale`); old/legacy profiles resolve to he unless `core.locale` or the stored pref says otherwise; wait for the auth restore before resolving; LocaleSync persists `core.locale` for new users so push and Kelly (no device) agree.
- Legacy `useAppStore.language` mirror: `LocaleSync` must sync the resolved locale into it, or legacy-dictionary screens (live overlay, challenges, old onboarding) stay Hebrew (#947).
- Module-scope `makeT('he', ns)` freezes the language at import: use `makeLiveT` (#921, #927 for module-level constants) or `useT`/`getT` at render.

**Layout**
- Tailwind `ltr:`/`rtl:` variants match ANY ancestor: a `dir="ltr"` island inside Hebrew makes `ltr:` classes fire (#914). Inside LTR hosts use `dir={direction}` from `useUiDir()` and JS conditionals for mirrored icons (#932). Run `wave4-ltr-hosts.ts` + `wave4-snapshot-proof.ts`, record Hebrew snapshots first for files without coverage.
- Hard-coded `dir="rtl"` (~470 sites) keeps greeting rows, toasts, banners RTL (#952).
- Units/numbers/dates via `Intl` and `INTL_TAG` (`he-IL` literals lurk in `LiveHeatMap`, `PlanLengthStep`, ...); no miles layer, week starts Sunday, 24h unless decided.
- Length caps (V11) on buttons/chips; de/ru are longer.

**Surfaces and gating**
- He-only surfaces (army/IDF persona step, unit/reserve leagues, "service" location, Israeli shelters) hidden via `shouldShowHeOnlySteps` / `useShowHeOnlySurfaces` (flag `hide_he_only_onboarding_steps`); existing data never touched, only not offered; hidden keys stay Hebrew.
- First-screen language pill (#939) is the only way a new user picks before auth.
- Legal text is a lawyer gate; health PDF needs its own template (see Phase 6).

**Kelly and speech**
- Safety patterns and reply guards are per language (negation, other-person, false positives); the Hebrew ones do not translate.
- TTS lang must match the text actually spoken; prewarm the catalog.

**Process**
- Count tests conflict between parallel PRs: no per-locale key counts, merge sequentially, `git merge origin/main` each time.
- Worktrees created from `origin/main` track main: `git branch --unset-upstream` and push with `git push origin HEAD:refs/heads/<branch>`.
- Never `vitest -u` unfiltered (runs the whole suite and rewrites Hebrew parity proofs): name one test file, read the diff.
- Flaky `map-w4-drawer-parity` test: re-run once before debugging.
- Hebrew byte-identical: record baseline snapshots from main in commit 1 of every PR, source change after.
- No long dash anywhere; apostrophes per voice doc; validate ICU with the real parser and the locale.
- Plurals per language (`Intl.PluralRules`), gender selects: neutral phrasing for unknown gender (owner decision).
- Flags default OFF, `superAdminValue: false` (except `enable_i18n`, `push_locale_v1`).

## Tooling index

| What | Where |
|---|---|
| Locales config | `src/lib/i18n/locale-profiles.ts` |
| Generic validator | `scripts/i18n/validate-catalog.ts --locale <xx> [--partial] [--ns a,b] [--json]` |
| English validator (also for `en`) | `scripts/i18n/validate-en-catalog.ts` |
| Generic test | `src/lib/i18n/__tests__/locale-catalogs-validate.test.ts` |
| Registry + check, scaffold | `scripts/i18n/locale-registry.ts`, `add-locale-scaffold.ts [--check] <xx> --native .. --hebrew ..` |
| Exercise pipeline | `scripts/i18n/content/{export-exercises,merge-translations,verify-import,apply-import}.ts`, core `exercise-bulk.ts` |
| Collection pipeline | `scripts/i18n/content/{export-collections,build-collection-import,verify-collection-import,apply-collection-import}.ts`, core `collection-bulk.ts` |
| Layout proofs | `scripts/i18n/{wave4-codemod,wave4-ltr-hosts,wave4-snapshot-proof}.ts` |
| Admin importer it mirrors | `src/features/content/exercises/services/exercise-translation.utils.ts` |
