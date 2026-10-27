# English brand voice — for owner approval

> Status: **proposal.** Companion to [EN-GLOSSARY.md](./EN-GLOSSARY.md) (terms) and [EN-PILOT-PLAN.md](./EN-PILOT-PLAN.md) (procedure). This file is meant to be pasted, in full, as system context to every translating agent.
> Sources: the Hebrew catalogs (`src/messages/he/*.json`), the marketing site's English (`appout-website/content/en.json`), the brand memory (audiences, personas), and the wave-3 formatters (`src/lib/i18n/core/fmt.ts`, `units.ts`).

## 1. Who we are talking to

| Audience | What they need from the copy |
|---|---|
| B2C: people who train outdoors (beginner to advanced; the five site personas: bike commuter, community moms, dad with kids, student, older beginner) | Encouragement without hype; clear next step; zero gym-bro jargon for the cautious beginner ("Ruti", "Start carefully, progress with confidence"). |
| B2G: municipality staff and residents | Calm, factual, civic. "Municipality", "residents", "parks". |
| B2B (later) | Same product voice; "members". |

English users in the first year are mostly English speakers living in Israel and the German pilot's English-speaking staff, so copy must work for **non-native** readers too: short sentences, common words, no idioms that do not travel.

## 2. The voice in one paragraph

**A friendly, capable coach who respects your time.** Warm, direct, a little dry-humored (as in the Hebrew streak messages: "100. Someone here is serious."), never shouting. We speak to one person ("you"), in short sentences, and we tell them what happens next. The site already sounds like this: *"You don't need a thing to train."*, *"Your whole city is your gym."*, *"Start carefully, progress with confidence."*

Four traits, with a test for each:

| Trait | Means | Test |
|---|---|---|
| **Warm** | Encourages effort, never shames a missed day. | Would it still feel kind to someone who just failed a workout? |
| **Plain** | Common words, one idea per sentence. | Could a non-native speaker read it once and act? |
| **Confident** | No hedging ("maybe", "we think you might want to"). | Does the button tell them exactly what happens? |
| **Honest** | No medical promises, no inflated claims. | Could a regulator or a physiotherapist object? |

## 3. Person and address

- **Second person singular, imperative for actions**: "Try again", "Choose a park", "Add a friend". Never "Users can…", never "The user".
- **We** = the OUT team, used sparingly and only where the Hebrew uses `אנחנו`/`בנינו לך` ("We built you a 20-minute route"). The app itself speaks as **OUT** or says nothing ("OUT needs access to Apple Health to show your activity").
- Kelly speaks in **first person singular** ("I'm pausing here for a moment. I'm not a doctor…"). About Kelly, in the app's voice: say **Kelly**, avoid pronouns (open question 6).
- Do not use "please" in routine instructions ("Try again", not "Please try again"). Use it only in errors that are the app's fault and the user must wait ("Please wait a moment").

## 4. Gender: collapsing Hebrew variants into one English string

Hebrew carries gender in verbs, adjectives, imperatives and even labels. The catalogs encode it as `{gender, select, female {…} male {…} other {…}}` (~410 strings: onboarding 155, community 84, map 64, player 27, home 21, profile 19, coach 17, …), as slash forms (`מוכן/ה`, `בצע/י`; ~75 strings), and as plural-neutral `other` branches (`נסו`, `מתחילים`).

**Rule: English has one string and no gender.**

1. **Collapse every gender `select` to a single English sentence** that is correct for all three branches. The `other` branch is the model (it is already the neutral wording); the male/female branches are only checked for *meaning* differences.
2. **Keep the `gender` select only if the branches differ in meaning**, not in grammar (very rare; I found none in the pilot). The `gender` argument is still passed by callers and ignored by the English string: this is allowed (PLAN §2.4).
3. **Never** use `he/she`, `s/he`, `(s)he`, or "he or she". Rephrase to second person or plural.
4. **Imperatives stay imperatives** (they have no gender): `{gender, select, female {נסי שוב} male {נסה שוב} other {נסו שוב}}` → **"Try again"**.
5. **Adjectives and participles that carry gender in Hebrew** (`מוכנה/מוכן`, `חדשה/חדש`, `מתחילות/מתחילים`) → English noun or adjective, no gender: **"Ready?"**, **"New to training or coming back after a long break"**, **"Beginner"**.
6. **Third persons in social strings** (`מי שעוקב אחריך ואת/ה אחריו`) → plural "they" or a role noun: "People who follow you and whom you follow back".
7. **Singular "they"** is acceptable when a person is referred to once and we cannot avoid a pronoun.
8. **Tier labels** (`מתחילים/בינוניים/מתקדמים`) → singular: Beginner, Intermediate, Advanced.
9. **Badges that are gendered on purpose** (the owner's decision log: "badges stay gendered", e.g. `מלכת המתח`) → these are content names, not UI strings. English picks a **single** name per badge (queen/king ⇒ "Pull-up Champ"-style names) and the owner approves each one. They are **not** in the pilot.

Result: the English catalog has far fewer ICU branches than the Hebrew one, and the validator treats a gender `select` that collapsed as valid.

## 5. Inclusivity

- Do not assume age, fitness, body type, religion, family structure or army service. Hebrew copy sometimes does ("בתוך הלו״ז הצבאי השוחק"): in English keep it only inside the audience-specific onboarding branch where the user told us they are in service.
- No weight-loss shaming, no "bikini body" ("להרשים בים" → **"look and feel strong"** or simply drop it), no "no excuses".
- People with different abilities: "Accessibility" persona. Say "stairs", "benches", "shade" when describing parks; avoid "just", "simply", "only 10 minutes".
- Numbers and people: "Join 3 others" not "Join 3 guys". "Parents", "kids" (not "mom" and "dad" except where a persona is named).
- Neighborhood spelling: US English ("neighborhood", "color", "program"). Match the site.

## 6. Punctuation, emoji, exclamation points

| Element | Policy | Why / evidence |
|---|---|---|
| **Exclamation marks** | At most **one per screen**, and only for real celebration moments (level up, first workout, milestones). Never in errors, settings, legal, empty states, or buttons. Hebrew has `!` in ~200 of 7,917 strings (2.5%, mostly onboarding and community): English should not exceed that rate. | Hebrew copy is mostly calm; English with many `!` reads as marketing shouting. |
| **Emoji** | Keep exactly the emoji that exist in the Hebrew string, same position. Never add. 7 in `common`, 36 in `community`: they are intentional (📢 share, ✓ status). Emoji are never part of a button's meaning. | Parity; accessibility. |
| **Em dashes (—)** | Avoid in UI. Hebrew uses `—` as a separator (`ui.accessCode.skip`: "דלג — המשך בלי קוד"). English: use a period or comma ("Skip and continue without a code"), or a middle dot `·` for compact metadata (`Profile · 5-day streak`). | Em dashes read as AI-written or heavy in short UI strings. |
| **Ellipsis** | Single character **…** (U+2026), no space before. The Hebrew mixes `...` and `…`; English uses `…` for loading ("Loading…"). | Consistency. |
| **Apostrophes and quotes** | Typographic **’** (U+2019) for contractions and possessives ("couldn’t", "OUT’s"). Quotes “ ”. | The ICU engine (`i18n-core.ts`, DOUBLE_OPTIONAL) treats an ASCII `'` as a quote starter only before `{`/`}`, and `''` as a literal single apostrophe. A curly apostrophe can never break a placeholder, and the validator bans `'` next to braces. |
| **Contractions** | Use them ("can’t", "you’re", "we’ll"): friendly and shorter. Not in legal text. | Voice. |
| **Oxford comma** | Yes ("sets, reps, and rest"). | One convention. |
| **Colons** | Only before a list or a value ("Goal: 10,000 steps"). | |
| **Sentence-ending periods** | **Buttons, chips, labels, titles, tab names: no period.** Full sentences in body text, toasts, errors: period. Single-sentence toasts keep their period for consistency with the Hebrew. | |
| **Slashes** | `/` only for real alternatives ("Park / court"), never for gender (§4). | |
| **Ranges** | En dash without spaces for numeric ranges (`1–2 minutes`); Hebrew uses hyphen `1-2`. | |

## 7. Capitalization

**Sentence case everywhere**: buttons, titles, menu items, tabs, chips.

- “Start workout”, “Choose a route”, “Add a friend”, “Weekly goal”.
- Capital letters only for the first word, proper nouns (OUT, Kelly, Tabata, Israel), and acronyms (XP).
- Title Case is **only** for: the official feature names we choose to capitalize as brand objects (if the owner decides: “Progression Map”? Current proposal: **no**, keep lowercase "progression map" in sentences, sentence case in titles).
- ALL CAPS only via CSS (`uppercase` class), never typed into catalogs, so a screen reader and a future locale are unaffected. Hebrew has no case, so the codemod could not have introduced typed caps; the translator must not.

Why sentence case: it matches the site, reads friendlier, avoids arguments about "of/and/to", and translates 1:1 to Russian/German later.

## 8. Units, dates, times, numbers

- **Numbers, dates and times are never typed in a translation.** They come from the wave-3 formatters (`formatNumber`, `formatDate`, `formatTime`, `formatRelative`, `formatDistanceKm`, `weekdayName`, `monthName`, `formatDateRange`) via `Intl` with the active locale, and from `withUnit` / `unitLabel` for unit labels. The translator writes only the unit **label** (`km`, `m`, `min`, `h`, `km/h`, `kg`, `min/km`, `steps`).
- **Units: metric by default** (PLAN decision 6: "metric only, imperial only if the US opens"). `distanceUnit` exists today as a user setting in home settings (`settings.tools.unitName`: kilometers / miles), but `formatDistanceKm` only formats km. **This is open question 4**: for English users do we (a) stay metric, (b) default to km but make the miles toggle work, (c) default to miles for `en-US` device locales? Until the owner decides: (a).
- **Dates**: `Intl` long forms for English: “Mon, Oct 27” in compact UI, “October 27, 2026” in full. Week starts **Sunday** in logic (PLAN decision 7); display follows `weekdayName`; weekday strings in `common` (`weekdays.long.0` = Sunday … `short` = Sun, `letter` = S).
- **Time**: the Hebrew app shows a 24-hour clock; `Intl` with `en-US` would produce 12-hour (“7:00 PM”) and the site’s English copy writes “7:00pm”. **Open question 5**: 12-hour for English? Proposal: follow the formatter and device locale, do not force.
- **Thousands**: “10,000 steps”. **Decimals**: dot (“2.9 km”, not “2,9”). **Percent**: “35%” (no space).
- **Duration**: “45 min”, “1 h 20 min”; never “45 minutes” inside chips (length), but “45 minutes” in sentences ("about 45 minutes").
- **Ranges and approximations**: Hebrew `כ־{dur} דקות` → “about {dur} min”.

## 9. Plurals

- English has two plural categories (`one`, `other`); Hebrew has `one`, `two`, `other` (`דקה אחת / שתי דקות / # דקות`, 45+ plural strings). When translating: **drop `two`**, keep the `other` branch correct for 0 and 2+: `{count, plural, one {# minute} other {# minutes}}`.
- `=0` branches in Hebrew (`אין עדיין ...`) stay as `=0` if present.
- A Hebrew `select` that is really a plural (`{left, select, one {אחד} other {שניים}}`, `{count, select, 1 {תרגיל אחד} other {…}}`) must keep **the same select keys** because the calling code passes those exact values; the English text inside each branch is rewritten ("1 exercise" / "{count} exercises"). The validator checks branch keys for non-gender selects (see pilot plan §4).
- “N-day streak” as a compound adjective is **singular** (“a 7-day streak”) but a standalone count is plural (“7 days in a row”). The glossary fixes the pattern per key; do not mix.

## 10. Length limits (English is longer than Hebrew)

English usually runs ~20–40% longer than Hebrew (but sometimes shorter: Hebrew prefixes make short words). The UI was designed for Hebrew width; apply these **hard caps** and tell the owner when a string cannot fit:

| Surface | Max characters | Notes |
|---|---:|---|
| Primary / secondary **button** | **24** (target ≤ 18) | Verb first: “Start workout”. |
| **Chip / filter / tab / segmented control** | **16** (target ≤ 12) | Noun phrases: “Park equipment”. |
| **Navigation label** (bottom bar) | **12** | |
| Screen **title** | **32** | One line. |
| **Subtitle / helper / hint** | **60** | One line where possible. |
| **Toast / inline error** | **90** | Say what happened, then what to do. |
| **Notification (push) title** | **40** | See push library (out of pilot). |
| **Push body** | **110** | |
| Body paragraph | no hard cap; ≤ 2 short sentences per idea | |
| Aria / accessibility label | no cap, but descriptive | |

The translator must output a second JSON report `{key, he_len, en_len, cap, over: true}` for any string over its cap, and rewrite once before reporting. Caps are checked by key family (`*.cta`, `*.button`, `*.chip.*`, `*.tab.*`, `*.title`).

## 11. Words and claims to avoid

**Hype**: “amazing”, “awesome”, “epic”, “crush it”, “smash”, “beast mode”, “unleash”, “supercharge”, “game-changer”, “transform your body”, “no pain no gain”, “revolutionary”. The Hebrew is warm but understated; match it.
**Pressure and shame**: “don’t break your streak!”, “you missed…”, “no excuses”, “lazy”. Hebrew streak-lost copy is gentle: keep it that way.
**Filler**: “simply”, “just”, “easily”, “basically”, “please note”.
**Medical and health claims**: never “treat”, “cure”, “heal”, “prevent injury”, “burn fat”, “lose X kg”, “rehab”, “therapy”, “safe for everyone”. Allowed: “gentle”, “beginner-friendly”, “easy on your joints” only if the Hebrew says it. Kelly’s safety lines must keep the Hebrew meaning exactly (“I’m not a doctor…”). The legal/health-declaration namespaces are lawyer-reviewed, not pilot.
**Jargon without explanation** for beginners: “deload”, “RPE”, “hypertrophy”, “mesocycle”, “AMRAP”. Use the glossary's plain form.
**AI buzzwords**: “AI-powered”, “smart” (except where the Hebrew says `חכם`, which the site already translates as “smart”).
**Hebrew-isms that do not travel**: “yalla”, “sababa”, “achla”, `יאללה`, `כיף`. Translate the feeling (“Let’s go”, “Fun”), not the word.

## 12. Twelve before / after examples (real strings)

Format: **key** — Hebrew — English.

1. **`common:status.error`** (error, tone)
   - he: `משהו השתבש, נסו שוב`
   - en: **Something went wrong. Try again.** (the existing en file has "…wrong, please try again": drop "please"; period, two short sentences.)
2. **`common:greeting.ready`** (gender select collapses)
   - he: `{gender, select, female {מוכנה?} male {מוכן?} other {מוכנים?}}`
   - en: **Ready?**
3. **`common:count.minutes`** (plural: drop `two`)
   - he: `{count, plural, one {דקה אחת} two {שתי דקות} other {# דקות}}`
   - en: **`{count, plural, one {# minute} other {# minutes}}`**
4. **`common:ui.deleteWorkout.bodyXp`** (placeholders, plain wording; “returned back” is redundant)
   - he: `{activity} מ-{date} יימחק לצמיתות, וה-{xp} XP שצברת בזכותו יוחזרו בחזרה.`
   - en: **{activity} from {date} will be deleted permanently, and the {xp} XP you earned from it will be taken back.** (Hebrew says "returned": the intended meaning is that XP is removed; owner confirm.)
5. **`player:levelup.headline.levelup`** (one celebratory `!`, matches the site: “You reached level 5!”)
   - he: `עלית לרמה {level}!`
   - en: **You reached level {level}!**
6. **`coach:note.phrase.DELOAD_WEEK.3`** (jargon → plain; Kelly note)
   - he: `השבוע הוא שבוע הורדת עומס, והגוף מתחזק דווקא במנוחה.`
   - en: **This is a lighter week. Your body gets stronger while it rests.**
7. **`community:leagues.individual.steps.podium`** (imperative, gender collapse)
   - he: `{gender, select, female {פתחי את הליגה ותפסי את הפודיום} male {פתח את הליגה ותפוס את הפודיום} other {פותחים את הליגה ותופסים את הפודיום}}`
   - en: **Open the league and take the podium.**
8. **`onboarding:quiz.tier.beginner.description`** (gendered adjectives)
   - he: `{gender, select, female {חדשה באימונים או חוזרת אחרי הפסקה ארוכה} male {חדש באימונים או חוזר אחרי הפסקה ארוכה} other {חדשים באימונים או חוזרים אחרי הפסקה ארוכה}}`
   - en: **New to training, or coming back after a long break**
9. **`home:settings.error.couponNotFound`** (imperatives; no “please”)
   - he: `{gender, select, male {קוד לא נמצא. בדוק ונסה שוב.} female {קוד לא נמצא. בדקי ונסי שוב.} other {קוד לא נמצא. בדקו ונסו שוב.}}`
   - en: **Code not found. Check it and try again.**
10. **`community:pressure.body`** (a sentence with a gendered opening + placeholder; keep `{contact}`; “פרסים” = prizes → keep only if the product really has prizes; flag)
    - he: `{gender, select, male {בוא נזיז אותם! שלח} female {בואי נזיז אותם! שלחי} other {בואו נזיז אותם! שלחו}} הודעה ל{contact} כדי שיפתחו את הליגה, הדירוגים והפרסים.`
    - en: **Let’s get them moving! Message {contact} so they open the league, the rankings, and the prizes.** (`ל{contact}` = the placeholder carries the preposition: English uses “to {contact}” and the caller passes only the name.)
11. **`home:streakCard.shieldUsed.bodyLeft`** (non-gender select keys must be kept; sentence rewritten)
    - he: `{many, select, yes {הימים בלי פעילות לא שברו} other {היום בלי פעילות לא שבר}} את הרצף. נשאר עוד מגן {left, select, one {אחד} other {שניים}}.`
    - en: **`{many, select, yes {Days} other {A day}} without activity didn’t break your streak. You have {left, select, one {1 shield} other {2 shields}} left.`** (same `many` and `left` keys and values; wording rebuilt for English grammar.)
12. **`coach:safety.opener.injury`** (Kelly first person; medical-claim policy; masculine verb in Hebrew disappears)
    - he: `אני עוצר כאן רגע. אני לא רופא, ופציעה או כאב חד הם סיבה לעצור ולא לאמן את האזור הזה.`
    - en: **I’m pausing here for a moment. I’m not a doctor, and an injury or sharp pain is a reason to stop, not to train that area.**

Bonus (units, handled by formatter): `ui.header.profileStreak` `פרופיל · {streak} ימים ברצף` → **`Profile · {streak, plural, one {# day} other {# days}} streak`**: the Hebrew had no plural; English needs one, so the translator is allowed to **add** a plural/select that the Hebrew lacks (see pilot plan §4: "Hebrew-fixed counts must not be hard-wired to 'days'"). That is the single permitted structural addition.

## 13. What the translating agent must always do (checklist for the system prompt)

1. Use only glossary terms; if a term is missing, translate it plainly and **list it** under `new_terms` in the output.
2. Preserve `{name}`, `{count, plural, …}`, `{x, select, …}`, `<b>…</b>`, `<ltr>…</ltr>` structure (see pilot plan).
3. One output string per key, sentence case, no gendered pronouns, no hype, ≤ the length cap.
4. Never type digits that the Hebrew generated from a placeholder; never convert units; never add or remove emoji.
5. If the Hebrew is ambiguous, output the key with `needs_owner: "<question>"` instead of guessing.
