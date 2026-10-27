# English pilot plan — for owner approval

> Status: **approved by the owner 27.10 (12 decisions below); translation in progress.** Wave 6 of [PLAN.md](./PLAN.md): "LLM translation of all `en` catalogs with glossary + brand voice, then an English-speaker check". This file defines a small **pilot** to prove the pipeline and your approval loop before the other ~7,500 keys.
> Read first: [EN-GLOSSARY.md](./EN-GLOSSARY.md), [EN-VOICE.md](./EN-VOICE.md). Hebrew source: `src/messages/he/*.json`. Catalog mechanics: [HOW-TO.md](./HOW-TO.md).

## 1. Where we stand (counts measured on `origin/main` @ `d5e4a7bd`)

| Namespace | he keys | en keys today | gender selects | plurals | other selects | rich tags (`<b>`,`<ltr>`) | words |
|---|---:|---:|---:|---:|---:|---:|---:|
| onboarding | 1,091 | 0 | 155 | 19 | 193 | | 10,001 |
| community | 940 | 0 | 84 | 17 | 141 | | 4,828 |
| player | 912 | 0 | 27 | 12 | 57 | | 3,218 |
| map | 874 | 0 | 64 | 5 | 92 | | 3,661 |
| home | 746 | 0 | 21 | 4 | 35 | 2 | 3,102 |
| profile | 576 | 0 | 19 | 11 | 51 | | 2,248 |
| push | 471 | 0 | 0 | 0 | 0 | | 2,471 |
| library | 448 | 0 | 5 | 6 | 26 | | 1,548 |
| legal | 351 | 0 | 0 | 0 | 0 | | 3,579 |
| coach | 339 | 0 | 17 | 3 | 22 | | 2,226 |
| schedule | 236 | 0 | 6 | 5 | 21 | | 1,574 |
| **common** | **186** | **14** (hand-written) | 8 | 2 | 9 | 2 | 819 |
| summary | 168 | 0 | 2 | 1 | 4 | | 428 |
| wide | 155 | 0 | 0 | 5 | 2 | | 638 |
| legacy-dictionary | 154 | 70 (hand-written) | 0 | 0 | 0 | | 672 |
| together | 129 | 0 | 0 | 5 | 0 | | 386 |
| social | 124 | 0 | 0 | 0 | 0 | | 326 |
| **pages** | **17** | **0** | 0 | 0 | 0 | | 67 |
| **Total** | **7,917** | **84** | 408 | ~95 | ~650 | | ~41.8k |

## 2. Proposed pilot scope

Three pieces, **368 keys, ~1,620 words**, chosen because they are small, appear on nearly every screen, contain the full set of difficult ICU patterns, and need no deep product context:

| Piece | Keys | Words | Why it's in |
|---|---:|---:|---|
| **`common`** | **186** | 819 | Buttons, errors, units, weekdays, streak/flame, header, offline, health-permission copy. Seen on every screen. Contains 8 gender selects, 2 plurals, 2 rich-text keys. 14 keys already have a hand-written English (see §6: free calibration). |
| **`pages`** | **17** | 67 | Global error screen, "refine levels", roadmap, explorer save error. Tiny, lets us test the loop end to end in minutes. |
| **`home` settings** (all keys prefixed `settings.`) | **165** | 735 | The most "owner-visible" English surface (this is where the language picker lives), full of gendered errors, toggles, privacy modes, delete-account flow, units (km/miles). 6 gender selects, 7 other selects, 2 rich-text keys. Also tests the glossary on `notifications`, `streak`, `privacy`. |
| **Total** | **368** | **1,621** | |

**Deliberately not in the pilot:** `legal` (lawyer), `push` (content pipeline, length caps), `coach` (Kelly voice decision still open), `onboarding` (largest, most gendered, retrospective after the pilot), `community`/`map`/`player` (too big for a first loop).

**Batches (≤150 keys each, grouped by feature so context stays coherent):**

| Batch | Contents | Keys |
|---|---|---:|
| P1 | `common` non-`ui.` keys (actions, status, units, weekdays, sync, flame) | 58 |
| P2 | `common` `ui.*` (health, access code, photo, header, offline, streak, system, report…) | 128 |
| P3 | `pages` (all) + `home` `settings.{title,screen,userFallback,loading,perm,privacy,section,account,subscription,notif}` | 17 + 68 = 85 |
| P4 | `home` `settings.{freq,reminders,tools,training,general,logout,danger,version,personal,delete,toast,confirm,error}` | 97 |

Expected cost: 4 LLM calls plus the owner check below; total under 20 minutes of agent time.

## 3. What the owner must check (and how)

You can read English, so your job is **meaning and brand fit**, not grammar. A review sheet is generated per batch: `docs/i18n/en-review/<batch>.md`, a table `key | Hebrew | English | notes`. For each row, mark one of: ✓ / fix: "<better English>" / ?: "<question>".

Look for exactly these seven things:

1. **Meaning drift**: does the English say what the Hebrew says, nothing more? (Especially errors, deletion warnings, privacy modes.)
2. **Glossary use**: workout/program/plan/schedule/level/stage/fitness park... If a term looks wrong, it is the glossary that changes (once), not the one string.
3. **Voice**: warm, plain, no hype, no pressure, at most one `!` per screen.
4. **Medical or legal claims**: nothing the Hebrew does not promise.
5. **Length**: anything the report flags as over its cap — do you prefer shorter English or a layout change?
6. **Gender collapse**: no `he/she`, no weird neutral phrasing.
7. **The "needs owner decision" terms** in the glossary that appear in the pilot batches (the validator report lists exactly which keys use them).

After you approve (or after the agent applies your fixes), the batch is committed. **An independent native English speaker** reviews the pilot once (PLAN §5.3: native freelance reviewer paid per word), not in this loop.

## 4. Translation procedure (per batch)

**Inputs to the agent (system context, in this order):**
1. `EN-VOICE.md` (full), 2. `EN-GLOSSARY.md` (full, with owner decisions applied), 3. the output contract below, 4. the batch: JSON `{ "<key>": "<Hebrew>" }`, plus per-key metadata the script adds: `namespace`, the placeholders found, `kind` (plain / plural / select / gender / rich), length cap, and (for the 14 existing English keys) the current English as a hint.

**Output contract:** a JSON object with the same keys, plus an optional sidecar `{ "needs_owner": {key: question}, "new_terms": [{he, en}] }`. Strings only, no commentary.

**Rules the agent must follow (extract of the voice doc, ICU-specific):**
- **Placeholders:** every `{name}` argument present in the Hebrew must be present in the English, with the same name; no new arguments; no translated argument names.
- **Plurals:** `{n, plural, …}`: keep the same argument; English has `one` and `other` only (drop `two`); keep `=0`/`=1` explicit branches that exist; `#` allowed only inside plural.
- **Gender selects:** may collapse to a single string (the argument `gender` is still passed by the caller). If kept, branches must be `female`/`male`/`other`.
- **Other selects:** `{x, select, a {…} b {…} other {…}}` keep **exactly the same branch keys** (the code passes these values), rewrite the text inside each.
- **Rich tags:** the same set of `<b>`, `<ltr>`, `</…>` in the same nesting.
- **Typographic apostrophe `’`**, never `'`, never `''` (ICU quote rules).
- **Sentence case**, no title case, no ALL CAPS, glossary terms only.
- **No Hebrew characters left**, no Hebrew punctuation (`״`, `׳`), no digits typed where a placeholder or formatter exists.
- The Hebrew text of `legal`/`push` keys is not touched by this pilot.

**Automated validator (specified here, built in the PR that adds the first English):** `scripts/i18n/validate-en.ts`, pure Node + the repo's own ICU parser (`src/lib/i18n/core/icu.ts` / `i18n-core.ts`), no `tsc`, no network. Runs per batch before a human sees anything, and in CI for all `en` catalogs once they exist. Checks, per key:

| # | Check | Fail condition |
|---|---|---|
| V1 | **Key parity** | key sets of `he/X.json` and `en/X.json` differ (missing or extra keys) |
| V2 | **Parseable** | the English string does not parse with the same ICU parser used at runtime |
| V3 | **Placeholder parity** | the set of argument names (including those inside plural/select branches) differs between he and en. Branch-local names are checked after the AST is walked. |
| V4 | **Plural parity** | a `plural` argument in he must be a `plural` in en (not turned into text); `other` branch present; no `two`/`few`/`many` category in English; `=N` explicit branches preserved |
| V5 | **Select parity (non-gender)** | the same `select` arguments, and the **same branch key set** (including `other`). |
| V6 | **Gender select** | either collapsed (no `gender` select left) or branches ⊂ {`female`,`male`,`other`} with `other` present. English text must have no gendered slash forms. |
| V7 | **Rich tag parity** | the multiset and nesting of `<b>`, `<i>`, `<ltr>` tags is equal |
| V8 | **No Hebrew** | any char in U+0590–U+05FF or Hebrew punctuation (`״ ׳`) in the English |
| V9 | **Apostrophes** | no ASCII `'` anywhere, and in particular none adjacent to `{`, `}`, `<`, `>`; no `''` |
| V10 | **No stray digits** | digits in English that the Hebrew did not have (formatters own numbers), with an allowlist (`24/7`, `1–2` ranges the Hebrew also had) |
| V11 | **Length cap** | exceeds the cap for its key family (EN-VOICE §10): warning, not error, listed in the report |
| V12 | **Policy lint** | `!` count per key > 1; banned words from EN-VOICE §11; em dash `—`; Title Case buttons (heuristic); two spaces; leading/trailing space differences from the Hebrew (leading spaces are significant in this app, e.g. `community:group.next.full`) |
| V13 | **Glossary lint** | a Hebrew glossary trigger (`גינת כושר`, `רצף`, ...) appears in the key and the mapped English term is absent (warning, human decides; catches silent synonyms) |
| V14 | **Untranslated** | English string equals the Hebrew string (should only happen for DNT items such as `XP`) |

Output: `validate-en.json` (machine) and the review sheet (human). **Errors (V1–V10, V14) block the batch**; V11–V13 are warnings listed at the top of the sheet.

**Repair loop:** the failing keys (only those) go back to the agent with the validator's message; max 2 rounds; then they appear in the owner sheet as `?`.

**Catalog hygiene reused from the extraction waves:** write to `src/messages/en/<ns>.json` with the exact key order of `he/<ns>.json`; keep the 14 hand-written `common` keys unless the validator or the owner says otherwise (§6); update `catalogs.test.ts` expectations only through the existing generator, never by hand.

## 5. Rollout path

1. **Merge the pilot catalogs** (docs + `en` JSON only). The `enable_locale_en` flag stays **OFF** for everyone. No visible change for anyone.
2. **Super admin preview:** with the flag OFF, the language picker (wave 5A) is already visible to super admins only; switching to English shows English for the three pilot pieces, and **falls back per key to Hebrew** for everything else (fallback chain `en → he`, PLAN §2.7/§5.10). This lets you click through Settings, error screens and the global header in English on a real phone.
3. **Owner pass** on the device (30 minutes): open Settings, trigger an error, rotate the phone, check RTL→LTR layout of those screens, read every string.
4. **Fix round** (glossary changes applied once, then re-run only the affected keys through the pipeline).
5. **Decision point for you:** approve the pipeline. Then wave 6 proper runs the same batches over the remaining catalogs in this order (smallest/most visible first): `wide`, `together`, `social`, `summary`, `library`, `schedule`, `profile`, `home` (rest), `player`, `map`, `community`, `coach` (after Kelly decision), `onboarding`, then `push` and Firestore content through the content pipeline; `legal` last via the lawyer.
6. **Flag flip** `enable_locale_en` happens only when **all** UI catalogs are complete (CI check: no missing keys, PLAN §5.10) and you say so. Nothing in this pilot turns it on.

## 6. Calibration trick: the 14 existing English keys

`src/messages/en/common.json` already holds 14 hand-written strings (e.g. `"status.error": "Something went wrong, please try again"`). Procedure: translate **without** showing the agent those 14; compare. Report the diffs in the review sheet; a quick read of the diffs tells you how close the voice guide gets to what you wrote yourself, before you read 350 other lines. (The existing `legacy-dictionary` English, 70 keys from the Maccabiah challenge page, is a second calibration set, not part of the pilot.)

## 7. What this PR contains / does not contain

Contains: the three markdown files. Does not contain: any catalog change, any code, any flag change, the validator itself (specified above; built in the first PR that adds English, after you approve).

---

## 8. Owner decisions (all 12 APPROVED 27.10)

1. **Outdoor gym terms:** generic place = **"outdoor gym"** (not "fitness park"); calisthenics-specific park (pull-up bars, parallel bars, rings) = **"calisthenics park"**; plain "park" only for ordinary parks (run/walk). (#97)
2. **Program / plan / schedule:** Program = a skill track (e.g. pull-up program); Plan = OUT's weekly plan; Schedule = the user's slots (`לו״ז`). (#10-#13)
3. **Level / stage / step:** Level = rank; Stage = map milestone; Step = a step in a flow. (#31-#33)
4. **Units:** metric only for the pilot (km/miles toggle later).
5. **Time format:** follow the device.
6. **Kelly:** "he"; "your coach Kelly". (#59)
7. **Deload week:** "lighter week". (#16)
8. **`אווטיר`:** "avatar". (#62)
9. **Municipality:** "municipality" everywhere; "city hall" only in the resident-outreach message. (#126-#127)
10. **Streak shield:** "shield". (#77)
11. **`מבדק`:** "quick test". (#24)
12. **Military league units (brigade/battalion/company):** HIDDEN from English users in the pilot; the keys are not translated and fall back to Hebrew (the exact list is in the pilot PR description).

*(Defaults not asked: US spelling; sentence case; no emoji added; `’` apostrophes; `legal`/`push` outside the pilot.)*
