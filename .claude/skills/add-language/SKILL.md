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
- Hebrew stays byte-identical. No long dash "—". Reply to the owner in Hebrew, masculine for Kelly.
- Independent reviewer agent per PR (give it the diff, not your conclusions).

## Owner gates (stop, ask, wait)
Merge approvals. Glossary (!) decisions + formality. Any flag flip. Functions deploy. Production Firestore writes (`apply-import.ts --confirm-production`). Legal text. Native-speaker review.

## Phases
1. **Scaffold + terminology (PR 1)**: `npx tsx scripts/i18n/add-locale-scaffold.ts <xx> --native "<N>" --hebrew "<H>"`, then `node functions/scripts/vendor-copy-geo-discovery.js`, `--check <xx>` until nothing is MISSING, fix test fixtures it lists. Write `docs/i18n/<XX>-GLOSSARY.md` (with the `lint` block), `<XX>-VOICE.md`, `<XX>-EXERCISE-NAMES.md` from the EN ones. Check `Intl.PluralRules`. Ask the owner the (!) list once.
2. **Catalogs, batch per PR**, order: common+pages, onboarding, player+summary, home+profile, map, community+social+together, library+coach+wide, schedule, push. Per batch: write JSON in he key order, `npx tsx scripts/i18n/validate-catalog.ts --locale <xx> --partial --ns <list>` (0 errors), Hebrew-untouched parity test, independent review, merge main, CI green (unit, typecheck, safety, emulator). Last batch: `status: 'complete'` in `src/lib/i18n/locale-profiles.ts`.
3. **Layout/format**: INTL_TAG dates and numbers, `units.*`/`weekdays.*` keys, long-string check, LTR host `ltr:` pitfalls.
4. **He-only surfaces**: keep hidden keys Hebrew (`shouldShowHeOnlySteps`, `COMMUNITY_HIDDEN`, `ONBOARDING_SKIPPED`); validator enforces.
5. **Exercise content**: widen content language types (small PR), then `export-exercises.ts` (read-only) -> translate chunks -> `merge-translations.ts` -> independent review -> `verify-import.ts --require-complete`. Stop at the gate; with the owner's go: dry run, then `apply-import.ts --confirm-production`.
6. **Server side** (Kelly language line, push senders, `push_locale_v1`): separate PRs, audit Hebrew literals in `functions/src`; deploy is an owner gate.
7. **Store listing, subtitles, legal, QA**: prepare, hand to owner/lawyer.
8. **Handoff report** (Hebrew, short): PRs, counts, open questions, the owner's steps in order (native review, flags, content apply, deploy). Never flip flags yourself.

## Lessons (one line each)
`ltr:` variants match ANY ltr ancestor, so LTR islands inside Hebrew fire them. Count assertions conflict between parallel PRs: avoid new counts, update from main before merge. Module-scope `makeT('he')` -> `makeLiveT`. Server-side Hebrew needs its own work. He-only surfaces stay hidden/Hebrew. Corrupt "Copy of" names get redone, never kept. Plural categories come from `Intl.PluralRules` (ru: one/few/many/other). Typographic apostrophes, no ICU-quote traps, no zero-width/NBSP unless the profile allows.
