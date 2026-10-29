---
name: add-language
description: >-
  Use when the owner asks to add a new app language ("add language X", "add Spanish",
  "תוסיף שפה", "תרגם את האפליקציה ל..."). Runs the whole i18n pipeline end to end:
  scaffold, glossary and voice, catalogs, exercise content, review, verification.
  Stops only at the owner gates.
---

# add-language

Read `docs/i18n/ADD-LANGUAGE.md` first (full commands, lessons). This file is the checklist.

## Inputs
Language code (`es`), native name (`Español`), Hebrew name (`ספרדית`), Intl tag if not the code, RTL yes/no. Ask only if one is missing.

## Rules
- Worktree off `origin/main`, never edit the main checkout, never push to `main`.
- No full `tsc`. Targeted `vitest run <files>` only; never `vitest -u` unfiltered.
- `git merge origin/main` before every merge (parallel i18n PRs collide on shared files and counts).
- Hebrew stays byte-identical (baseline snapshots from main in commit 1). Push with `git branch --unset-upstream` then `git push origin HEAD:refs/heads/<branch>`. No long dash "—". Reply to the owner in Hebrew, masculine for Kelly.
- Independent reviewer agent per PR (give it the diff, not your conclusions).

## Owner gates (stop, ask, wait)
Merge approvals. Glossary (!) decisions + formality. Any flag flip. Functions + Vercel deploy. Production Firestore writes (`apply-import.ts` / `apply-collection-import.ts --confirm-production`, after showing the dry run). Legal text + health declaration PDF. Native-speaker review.

## Phases
1. **Scaffold + terminology (PR 1)**: `npx tsx scripts/i18n/add-locale-scaffold.ts <xx> --native "<N>" --hebrew "<H>"`, then `node functions/scripts/vendor-copy-geo-discovery.js`, `--check <xx>` until nothing is MISSING, fix test fixtures it lists. Write `docs/i18n/<XX>-GLOSSARY.md` (with the `lint` block), `<XX>-VOICE.md`, `<XX>-EXERCISE-NAMES.md` from the EN ones. Check `Intl.PluralRules`. Ask the owner the (!) list once.
2. **Catalogs, batch per PR**, order: common+pages, onboarding, player+summary, home+profile, map, community+social+together, library+coach+wide, schedule, push. Per batch: write JSON in he key order, `npx tsx scripts/i18n/validate-catalog.ts --locale <xx> --partial --ns <list>` (0 errors), Hebrew-untouched parity test, independent review, merge main, CI green (unit, typecheck, safety, emulator). Last batch: `status: 'complete'` in `src/lib/i18n/locale-profiles.ts`.
3. **Layout/format**: INTL_TAG dates and numbers, `units.*`/`weekdays.*` keys, long-string check, LTR host `ltr:` pitfalls.
4. **He-only surfaces**: keep hidden keys Hebrew (`shouldShowHeOnlySteps`, `COMMUNITY_HIDDEN`, `ONBOARDING_SKIPPED`); validator enforces.
5. **Content**: readers FIRST (shapes per collection in the playbook: exercises LocalizedText, programs `*Localized`, stations/run templates/push `{he,xx}` normalized to the source string) and deployed (Vercel + functions) before any write. Pipeline: inventory -> export (`export-exercises.ts`, `export-collections.ts`) -> dedupe/chunk -> names agent first, then parallel chunk agents -> merge -> independent review -> `verify-*` -> dry run -> (owner go) `apply-* --confirm-production` -> post-verify. Backups in `backups/`. Then the owner may flip `enable_content_locale`.
6. **Server side**: Kelly (`ai_coach_locale_v1`, safety patterns + reply guards per language), push (`push_locale_v1`, mirror), TTS (`audio` catalog, lang = spoken text), health PDF (same catalog text as on screen, store `declarationLocale`), app shell `lang/dir` cookie. Separate PRs, Hebrew baseline snapshots first; deploy is an owner gate.
6b. **Audit sweep early**: hard-coded `dir="rtl"`, `he-IL`, Hebrew literals, `makeLiveT`, existing-user rule (device language only for new users).
7. **Store listing, subtitles, legal, QA**: prepare, hand to owner/lawyer.
8. **Handoff report** (Hebrew, short): PRs, counts, open questions, the owner's steps in order (native review, flags, content apply, deploy). Never flip flags yourself.

## Flag turn-on order (owner, never yourself)
`enable_i18n` -> content applied + deployed, then `enable_content_locale` -> `hide_he_only_onboarding_steps` -> functions deployed, then `push_locale_v1`, `ai_coach_locale_v1` -> LAST `enable_locale_<xx>`. Any other order shows a half-language UI.

## Lessons (one line each, details in the playbook)
- Labels used as logic keys: keep logic on the source string, display localized, never persist localized display text (`mainSwap`).
- `ltr:`/`rtl:` match ANY ancestor (#914): inside LTR hosts use `dir={direction}` from `useUiDir()`. Hard-coded `dir="rtl"` needs a codemod (#952).
- Module-scope `makeT('he')` -> `makeLiveT`. Legacy `useAppStore.language` must mirror the locale.
- Existing users must not flip language: device detection only for new users, wait for auth restore (#950).
- TTS lang = language of the text spoken; prewarm catalog. Kelly needs safety patterns (negation, other-person) and reply guards per language.
- Never write a collection before readers support the shape and are deployed; stale sessions; corrupt "Copy of" names get redone.
- He-only surfaces hidden via `shouldShowHeOnlySteps`; health PDF uses the on-screen catalog text; units/dates via `Intl`.
- Count tests collide: no per-locale counts, merge PRs sequentially from fresh main. Never `vitest -u` unfiltered. Flaky `map-w4-drawer-parity`: rerun once.
- Max ~3 parallel agents; names agent separate and first; translation chunks write only their own file.
- Plural categories from `Intl.PluralRules`; no long dash; no ICU-quote traps; no zero-width/NBSP unless the profile allows.
