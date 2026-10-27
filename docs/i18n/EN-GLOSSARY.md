# English glossary (he → en) — for owner approval

> Status: **owner-approved decisions applied (27.10); pilot translation in progress.** Part of wave 6 ("English content"). Companion docs: [EN-VOICE.md](./EN-VOICE.md), [EN-PILOT-PLAN.md](./EN-PILOT-PLAN.md).
> Written for David (Hebrew speaker, reads English). Hebrew columns are the source of truth; English is what an LLM translator will be told to use **every single time**.

## How this list was built

- Frequency analysis (unigrams + bigrams, ICU placeholders stripped) over all 18 `src/messages/he/*.json` catalogs (7,917 keys, ~42k words), then manual reading of every hit in context.
- English reference: the marketing site's existing English copy (`appout-website/content/en.json`, ~92 KB). Where the site already settled a term, I kept it, so the app and site read as one product ("fitness parks" (the site; the app uses "outdoor gym" per owner decision), "streak", "municipalities", "neighborhood", "Level 4").
- Brand/product facts from the brand memory (calisthenics + running + walking in public parks, B2C / municipalities / future B2B).
- US spelling everywhere (matches the site: "neighborhood", "color").

**Status values:** `proposed` = I am confident, owner just glances. `needs owner decision` = a real product/brand choice; the "Alternatives" column lists the options. The 10 most important decisions are marked **(!)**.

---

## 0. DO-NOT-TRANSLATE list

| Item | Rule | Why |
|---|---|---|
| `OUT` (also written `Out`, `out`, `אאוט`) | Always **OUT**, all caps, never "Out". In Hebrew copy where it appears as `Out` (e.g. `community:pressure.message`), English uses `OUT`. | Brand wordmark. |
| `Kelly` / `קלי` / `קלי AI` | **Kelly**, **Kelly AI**. Never "Kelly the coach" unless the Hebrew says it. | Persona name. See terms #56-59. |
| `Calisthenics Ltd.` (`קליסטניקס בע"מ`, ח.פ.) | Legal entity: keep company number, English form decided by the lawyer. Legal namespace is **not** in the LLM pilot. | Legal. |
| `XP` | **XP** | Already English in the Hebrew strings. |
| Product proper names: `Tabata`, `Fartlek`, `HealthKit`, `Health Connect`, `Apple Health`, `Google`, `WhatsApp`, `Mapbox`, `OpenStreetMap`, `Maccabiah` | Keep as is (Tabata/Fartlek capitalized). | Names. |
| Place names / cities (`תל אביב`, `הרצליה`) | Data, not catalog text: come from the locations data's `name_en`. If a catalog string hard-codes one, ask. | Data. |
| Units written as words in the catalog (`ק״מ`, `מ׳`, `דק׳`, `שע׳`, `קמ״ש`, `ק״ג`) | **Do translate the unit label** (`km`, `m`, `min`, `h`, `km/h`, `kg`), but numbers are never typed by the translator: formatters (`withUnit`, `formatDistanceKm`, `formatNumber`) supply them. The `*Ascii` unit keys (`units.kmAscii` etc.) exist only to keep Hebrew byte-parity, so in English they equal the normal key. | `src/lib/i18n/units.ts`. |
| `{placeholders}`, `<b>`, `<ltr>…</ltr>`, ICU syntax | Untouched (see pilot plan validator). `<ltr>` wrappers stay (harmless in English). | Format safety. |
| Emoji and symbols (📢 ✓ ·) | Keep exactly (policy in EN-VOICE §6). | Not language. |
| Exercise / program / push-library names stored in **Firestore** | Out of scope here: translated through the content pipeline (wave 6, second half), not through catalogs. | Different pipeline. |
| Email, URLs, legal section numbers, version strings | Untouched. | |

---

## 1. Core product vocabulary

| # | Hebrew | Proposed English | Rationale | Alternatives considered | Status |
|---|---|---|---|---|---|
| 1 | אימון (a session) | **workout** | The thing you do today; matches the site ("counts as a workout"). | session, exercise session | proposed |
| 2 | אימון (the activity in general), להתאמן | **training** / **train** ("train in the park") | Natural English split: a *workout* is countable, *training* is the habit. | exercise, work out | proposed |
| 3 | אימונים (the list/plural) | **workouts** | | | proposed |
| 4 | תרגיל | **exercise** | Standard. | move, drill | proposed |
| 5 | סט / סטים | **set / sets** | Standard. | | proposed |
| 6 | חזרות | **reps** | Standard gym English. The site uses "rep target". | repetitions (too formal) | proposed |
| 7 | סבב (generic) | **round** | `סבב טבטה` = "Tabata round". | circuit, cycle | proposed |
| 8 | סופרסט | **superset** | Standard. | | proposed |
| 9 | טבטה | **Tabata** | Proper noun. | | proposed |
| 10 | תוכנית (a track like Pull-ups, or "the program you chose") | **program** | `תוכנית {program} רמה {level}` is the app's core object. | plan, track, routine | **APPROVED** (owner 27.10): Program = a skill track (e.g. pull-up program). |
| 11 | תוכנית השבוע / תוכנית שבועית | **this week's plan** / **weekly plan** | A *plan* is time-based (what to do when); a *program* is skill-based (what you progress in). | schedule, weekly program | **APPROVED** (owner): Plan = OUT's weekly plan. |
| 12 | תוכנית ריצה | **running plan** | Time-based (weeks of runs), so "plan", like #11. Site says "running". | running program | **APPROVED** (owner): follows Plan rule. |
| 13 | לו״ז / לוח זמנים / לוח שבועי | **schedule** (calendar *view* = "weekly planner") | `לו"ז` = the user's availability and slots ("schedule"); `תוכנית` = what OUT built for them ("plan"). Never use "plan" for `לו״ז`. | timetable, calendar | **APPROVED** (owner): Schedule = the user's slots (לו״ז). |
| 14 | תוכנית אב / תוכנית בת | **main program / sub-program** | Only used in the profile explainer. | parent program / child program | proposed |
| 15 | מחזור (training cycle) | **cycle** ("week 3 of the cycle") | Mesocycle jargon avoided. | block, phase, mesocycle | proposed |
| 16 | שבוע הורדת עומס (deload) | **lighter week** | The user-facing string is "הורדת עומס", never "התאוששות". "Deload" is jargon to a beginner (Ruti persona). | deload week, recovery week, easy week | **APPROVED** (owner): "lighter week"; "deload" only if user asks why. |
| 17 | שבוע שיא | **peak week** | Mirrors #16. | big week, push week | proposed |
| 18 | שבוע בנייה | **build week** | Mirrors #16. | | proposed |
| 19 | יום התאוששות | **recovery day** | | rest day (that is `מנוחה`) | proposed |
| 20 | מנוחה (between sets) / יום מנוחה | **rest** / **rest day** | | break | proposed |
| 21 | מנוחה פעילה | **active recovery** | | | proposed |
| 22 | חימום | **warm-up** | | | proposed |
| 23 | מתיחות (cooldown section) | **cool-down** (section title) / **stretching** (exercise type) | `library:preview.section.title.cooldown`. | stretches | proposed |
| 24 | מבדק / מבדק כוח / מבדק קצר | **quick test** ("a one-minute strength test") | A short test to place the user's level; not medical, not a "check-up". | assessment, check, fitness check | **APPROVED** (owner): "quick test". |
| 25 | שאלון (short questionnaire) | **quiz** in onboarding; **questionnaire** for the running one | "Quiz" is friendlier; keep "questionnaire" where the Hebrew sounds formal. | survey | proposed |
| 26 | יעד | **goal** ("weekly goal", "step goal") | One word for goal everywhere. | target | proposed |
| 27 | מטרה | **goal** | Same word as #26 in English. | aim, objective | proposed |
| 28 | התקדמות | **progress** | | progression (only for "progression map") | proposed |
| 29 | מפת התקדמות | **progression map** | Brand feature name on the site. | skill tree, progress map | proposed |
| 30 | אלמנט / מיומנות (e.g. front lever, planche) | **skill** | Calisthenics community says "skill"; "element" is gymnastics-Hebrew. `האלמנט שבחרת` → "the skill you chose". | element, move | proposed |
| 31 | רמה | **level** | `רמה 4`, `עלית לרמה 5` → "Level 4", "You reached level 5!" (the site already says it). | tier | **APPROVED** (owner): Level = rank. |
| 32 | שלב (step in a flow) | **step** | "Step 2 of 5", "at this point" → "right now". | stage | **APPROVED** (owner): Step = a step in a flow. |
| 33 | שלב (stage of a progression, `שלב {index} מתוך {count}`) | **stage** | Reserve "stage" for progression maps so "level" (your overall rank) and "stage" (a milestone on the map) never collide. | milestone, step | **APPROVED** (owner): Stage = map milestone. |
| 34 | מתחילים / בינוניים / מתקדמים | **Beginner / Intermediate / Advanced** | Tier labels are singular adjectives in English. | Novice | proposed |
| 35 | מסע | **journey** | `המסע האישי שלך` → "your journey". Used sparingly (see voice: hype). | path | proposed |
| 36 | גוף מלא | **full body** | | whole body | proposed |
| 37 | פלג גוף עליון / תחתון | **upper body / lower body** | | | proposed |
| 38 | ליבה | **core** | | abs | proposed |
| 39 | דחיפה / משיכה | **push / pull** | Standard. | | proposed |
| 40 | רגליים | **legs** | | | proposed |
| 41 | כוח (type of workout) | **strength** (noun: workout type) / **power** only in `עליית כוח` | `אימון כוח` → "strength workout". `כוח` as plain force/energy ("שומרים כוח") → "save your energy". | | proposed |
| 42 | אירובי | **cardio** | App-wide chip/tab name; "aerobic" is lab-speak. | aerobic | proposed |
| 43 | קליסטניקס | **calisthenics** | Same word. Site already uses it. | bodyweight training | proposed |
| 44 | משקל גוף | **bodyweight** | | | proposed |
| 45 | ציוד | **equipment** | Consistent. Site's casual "no gear" may appear in marketing copy only. | gear | proposed |
| 46 | ציוד פארק / מאולתר / אישי | **park equipment / improvised equipment / your own equipment** | | | proposed |
| 47 | עמידת ידיים | **handstand** | | | proposed |
| 48 | שכיבות סמיכה | **push-ups** (hyphen) | | press-ups (UK) | proposed |
| 49 | שכיבות סמיכה בעמידת ידיים | **handstand push-ups** | | HSPU (never abbreviate) | proposed |
| 50 | מתח (the exercise) | **pull-ups** | `מתח` alone is ambiguous with "tension" only for a person, not in the catalog. | chin-ups | proposed |
| 51 | מקבילים | **parallel bars** (the station) / **dips** (the exercise) | Context decides; the translator is told which key family is which. | bars | proposed |
| 52 | עליית כוח | **muscle-up** | Standard. | | proposed |
| 53 | פלאנץ׳ | **planche** | | | proposed |
| 54 | טבעות | **rings** | | gymnastic rings | proposed |
| 55 | סולם (to a skill) | **ladder** ("a ladder for each skill") | | progression path | proposed |

## 2. Kelly, brand voice words, people

| # | Hebrew | Proposed English | Rationale | Alternatives considered | Status |
|---|---|---|---|---|---|
| 56 | קלי | **Kelly** | Persona name, do not translate. | | proposed |
| 57 | קלי AI | **Kelly AI** | | | proposed |
| 58 | המאמן שלך / מאמן דיגיטלי | **your coach** / **digital coach** | Do not write "AI coach" unless the Hebrew says AI; replies are marked AI elsewhere. | virtual coach | proposed |
| 59 | Kelly's pronoun (Hebrew grammar forces masculine: `לו`, `הוא`) | **he** ("your coach Kelly"; masculine, consistent with the Hebrew decision). Avoid the pronoun when a rephrase is just as natural. | English has no grammatical need, so the safest is to avoid. | they, it | **APPROVED** (owner): "he". |
| 60 | OUT referring to itself (`OUT מבקשת`, feminine) | **OUT** as subject ("OUT needs access to…"); team voice = **we** | English does not gender the app. | the app | proposed |
| 61 | הצוות של OUT | **the OUT team** | | | proposed |
| 62 | אווטיר (a user of the app, `אני אווטיר ב-Out`) | **avatar** | I only see it in `community` (6 hits). A brand word the owner coined: I cannot guess the English. | OUT member, athlete, Outer | **APPROVED** (owner): "avatar". |
| 63 | מתאמן / מתאמנים | **people training** / **members** / **you** (never "trainees") | "Trainee" sounds clinical. | exerciser, athlete | proposed |
| 64 | חבר / חברים (friends) | **friends** | | buddies | proposed |
| 65 | חברים (members of a league/group, `leagues.picker.members`) | **members** | Context: league/group membership. | | proposed |
| 66 | שותפים / שותף | **training partners** (first mention) / **partners** (UI labels) | Social graph in the app: people you follow and who follow back (`social.partner.*`). | buddies, connections, friends | needs owner decision |
| 67 | עוקב / עקבי | **follow** (verb) / **following** (state) | | | proposed |
| 68 | משתמש | **user** (admin/system only) — in UI say **you / member** | | | proposed |
| 69 | אורח | **guest** | | | proposed |
| 70 | קהילה | **community** | | | proposed |
| 71 | קבוצה | **group** | | team (that is `נבחרת`) | proposed |
| 72 | נבחרת (e.g. "the Herzliya team") | **team** | | squad | proposed |
| 73 | מפגש (group meeting) | **meetup** | "Session" would collide with a workout session. | session, event, gathering | needs owner decision |
| 74 | אתגר | **challenge** | `L-sit Challenge` already English in the legacy en file. | | proposed |

## 3. Gamification, leagues, social

| # | Hebrew | Proposed English | Rationale | Alternatives considered | Status |
|---|---|---|---|---|---|
| 75 | רצף | **streak** | Site: "10-day streak". Defined in the motivation spec as consecutive days with a counted workout. | run (collision with running) | proposed |
| 76 | X ימים ברצף | **{n}-day streak** (as a noun phrase); "a {n}-day streak" in sentences | Plural-aware; see voice §9. | N days in a row | proposed |
| 77 | מגן (streak shield, saves a missed day) | **shield** ("streak shield" first time) | | freeze, protector, safety | **APPROVED** (owner): "shield" (first mention "streak shield"). |
| 78 | להבה | **flame** | `flame.level.*` accessibility strings. | | proposed |
| 79 | ליגה | **league** | | | proposed |
| 80 | ליגת העיר / ליגת השכונה / ליגת הארגון | **city league / neighborhood league / organization league** | Organization = the B2B/tenant league (`tenant`). | company league, workplace league | proposed |
| 81 | דירוג | **ranking** | | leaderboard (use for the screen title only if the Hebrew is `לוח תוצאות`, not present) | proposed |
| 82 | פודיום | **podium** | | top three | proposed |
| 83 | קרב / קרב השבוע | **battle** / **this week's battle** | Mild competitive tone matches the Hebrew. | duel, match-up | needs owner decision |
| 84 | יריב / יריבה | **opponent** | | rival | proposed |
| 85 | יחידה (military unit league) | **unit** | `תחרות בין יחידות` → "Unit competition". | | proposed |
| 86 | חטיבה / גדוד / פלוגה | **brigade / battalion / company** | Standard English renderings of IDF structure. Note: in the app this is a league for soldiers; the owner may not want these exposed to non-Israeli English users. | **APPROVED** (owner): HIDE brigade/battalion/company/unit-league wording from English users in the pilot (military terms); keys stay Hebrew via fallback. |
| 87 | נקודות | **points** (`נק׳` → "pts") | | | proposed |
| 88 | XP | **XP** | | | proposed |
| 89 | מטבעות / קרדיטים | **coins** (virtual currency); **credits** only where the Hebrew says `קרדיטים` | Legal `termsDoc` section 5 uses both words in one sentence ("points and credits (hereinafter coins)"): lawyer territory. | tokens | needs owner decision (legal) |
| 90 | הישגים | **achievements** | | trophies | proposed |
| 91 | תג | **badge** | | | proposed |
| 92 | בונוס | **bonus** | | | proposed |
| 93 | שיא / שיא אישי | **record** / **personal best** | `השיא: {best}` → "Best: {best}"; "PR" never (jargon for non-lifters). | PR, PB | proposed |
| 94 | פוסט / שיתוף / לשתף | **post / share** | | | proposed |
| 95 | רוח (privacy mode "Ghost") | **Ghost** ("Invisible to everyone") | The Hebrew is the pun. Modes: Ghost / Friends / Global. | Stealth, Hidden | proposed |
| 96 | פרסונה / הפרסונות שלי (home settings) | **my personas** (placeholder) | I could not infer the feature from the strings alone. | my profiles, private details | needs owner decision (what is it?) |

## 4. Places, routes, running, walking

| # | Hebrew | Proposed English | Rationale | Alternatives considered | Status |
|---|---|---|---|---|---|
| 97 | גינת כושר / גינות כושר | **outdoor gym** (generic place); **calisthenics park** (specific: pull-up bars, parallel bars, rings); plain **park** only for ordinary parks (run/walk) | Already the site's term ("{n} fitness parks"). 'Garden' (literal) reads as horticulture; "outdoor gym" is a different (and gym-like) image. | outdoor gym, calisthenics park, fitness garden, workout park | **APPROVED** (owner): replaces the earlier "fitness park" proposal. |
| 98 | גינה (short, in search `תרגיל, גינה, חבר`) | **park** | | | proposed |
| 99 | פארק | **park** | | | proposed |
| 100 | מתקן / מתקני כושר | **equipment** (a piece) / **station** (on a route) | Ambiguous in Hebrew; see #101. | facility, apparatus | proposed |
| 101 | תחנה (a stop on a hybrid route, `תחנה 2, כוח`) | **stop** in running text; **station** only as a UI label for the exercise point | | station everywhere | needs owner decision (minor) |
| 102 | מגרש | **court** / **field** (from `facilityType: court`) | | pitch | proposed |
| 103 | מסלול | **route** | | trail, path | proposed |
| 104 | מסלול מעגלי | **loop** ("a loop that returns to the start") | | circular route | proposed |
| 105 | הקפה | **lap** | | | proposed |
| 106 | ריצה | **run** (noun, countable) / **running** (activity) | | jog | proposed |
| 107 | ריצה קלה | **easy run** | Same label across the app. | jog (only for zone key `jogging`) | proposed |
| 108 | ריצה ארוכה | **long run** | | | proposed |
| 109 | ריצת טמפו | **tempo run** | | | proposed |
| 110 | אינטרוולים | **intervals** | | repeats | proposed |
| 111 | פרטלק | **fartlek** | | | proposed |
| 112 | שחרור | **recovery jog** (zone `recovery`) | | cool-down jog | needs owner decision (minor) |
| 113 | הליכה | **walk** (noun) / **walking** | | | proposed |
| 114 | הליכה מהירה | **brisk walk** | Natural English for the Hebrew. | fast walk, power walk | proposed |
| 115 | צעדים | **steps** | | | proposed |
| 116 | קצב (running) | **pace** | `בקצב שלך` (idiom, "at your own pace") also "pace". | rhythm, tempo | proposed |
| 117 | דק׳ לק״מ | **min/km** | Metric default (see voice §8). | | proposed |
| 118 | תחזית למרוץ | **race prediction** | | forecast | proposed |
| 119 | ספסל / צל / מים (route filters) | **bench / shade / water** | Fitness-park filters: shade, benches, free access (site). | | proposed |
| 120 | שכונה | **neighborhood** | US spelling, as on the site. | neighbourhood | proposed |
| 121 | עיר | **city** | | | proposed |
| 122 | בית / בבית / אימון ביתי | **home** / **at home** / **home workout** | | indoor | proposed |
| 123 | חדר כושר | **gym** | | fitness room | proposed |
| 124 | משרד | **office** | | | proposed |
| 125 | צבא / שירות | **military service** (labels), **army** casual | `צבא/שירות` is a location choice for people in service (bases, short sessions). | | proposed |

## 5. Municipalities, accounts, system words

| # | Hebrew | Proposed English | Rationale | Alternatives considered | Status |
|---|---|---|---|---|---|
| 126 | רשות / רשות מקומית | **municipality** (singular); "local authority" only in legal text | The site's B2G page says "Municipalities" and "For municipalities". | local authority, council, city | **APPROVED** (owner): "municipality" everywhere. |
| 127 | עירייה (`שלח הודעה לעירייה`) | **your municipality** everywhere; **city hall** only in the resident-outreach message (`שלח הודעה לעירייה`) | "Message city hall" is the natural call to action for a resident. | the municipality | **APPROVED** (owner). |
| 128 | הצהרת בריאות | **health declaration** | Israeli legal term (fitness-center law). Legal namespace goes through a lawyer. | health statement | proposed |
| 129 | תנאי שימוש / מדיניות פרטיות | **Terms of Use / Privacy Policy** | | Terms of Service | proposed |
| 130 | קוד גישה | **access code** | | invite code | proposed |
| 131 | קופון | **coupon** | | promo code | proposed |
| 132 | מנוי | **membership** (city-sponsored) | `הצטרף לעיר שלך` implies sponsored access. | subscription | needs owner decision |
| 133 | חשבון | **account** | | | proposed |
| 134 | התראות / התראות פוש | **notifications / push notifications** | | alerts | proposed |
| 135 | הודעות | **messages** | | | proposed |
| 136 | הגדרות | **settings** | | | proposed |
| 137 | פרטיות / נראות | **privacy / visibility** | | | proposed |
| 138 | תקלה / משהו השתבש | **Something went wrong** | | an error occurred | proposed |
| 139 | נייטיב (in settings, `perm.native`) | **native app** | | | proposed |
| 140 | הזמנת חברים | **invite friends** (button) | | | proposed |

---

## 6. Idioms and recurring phrases (translate as phrases, never word by word)

| Hebrew | Proposed English | Notes |
|---|---|---|
| `הכל מתחיל מבסיס חזק` | **It all starts with a strong foundation.** | 45 occurrences in `onboarding`, one sentence, must be identical everywhere. |
| `נתחיל במבדק קצר של דקה` | **We'll start with a quick one-minute test.** | |
| `כל הכבוד` | **Nice work** (not "Well done!") | Volume: see voice §6. |
| `בקצב שלך` | **at your own pace** | |
| `נסו שוב` / `נסה שוב` | **Try again** | 33 occurrences; one string, imperative, no "please". |
| `לא הצלחנו לטעון` | **We couldn't load…** | |
| `מתאמנים לידך` | **people training near you** | |
| `קוד גישה` / `אפשר לדלג` | **access code** / **you can skip this** | |
| `בלי ציוד` | **no equipment needed** | |
| `יופי של התחלה` | **Good start** | |

## 7. Terms I could not settle from strings alone (owner please say what they mean)

- (resolved 27.10: see APPROVED rows) `פרסונות` in `home:settings.screen.personas` (my personas): what does the user enter there?
- `אווטיר`: APPROVED "avatar".
- `מגן` (streak shield): is "shield" the in-app visual (an icon)? APPROVED: "shield".
- `ארנה`/`arena` appears only in keys (`arenaCreate.*`), never in Hebrew text, so no term needed. Confirm.


## 8. Owner decisions of 27.10 (units, time, Kelly)

- Units: metric only for the pilot (km/miles toggle later).
- Time format: follow the device locale.
- Kelly: "he"; "your coach Kelly".
- Hidden from English users in the pilot: brigade/battalion/company/unit-league wording (military terms). Those keys stay untranslated and fall back to Hebrew.
- Remaining `needs owner decision` rows that are not in the 12 (#66, #73, #83, #89, #96, #101, #112, #132): the proposed English applies provisionally; they are not in the pilot scope except where noted by the English-speaker review.

### Keys hidden from English users (decision 12)

None of these is in the 368-key pilot; when `community` is translated they must stay untranslated (fallback to Hebrew) or be gated by locale:
`community:leagues.units.range.myBattalionCompanies`, `community:leagues.units.range.myBrigadeBattalions`, `community:leagues.units.range.allCompanies`, `community:leagues.units.range.allBrigades`, `community:communityPage.leagues.v2.tab.units`, `community:communityPage.reserve.scopeLabel`, `community:communityPage.cards.reserve`, `community:arenaCreate.card.military.label`, `community:group.location.military`.
| `התנתקות` / `התחברות` | **Sign out** / **Sign in** | Never "log out" / "log in". |
| `מתקן` | **station** (workout flow, "Find the station") / **equipment** (generic gear) | |
| `{count} אימונים ממתינים` | ICU plural: **1 workout / N workouts waiting to sync** | Policy: any `{n}` next to a noun gets an English `one`/`other` plural; Hebrew key unchanged, same argument name. |
| שם פארק גנרי בפוסטים | **place** | Generic park names in feed copy, e.g. "place name". |
| `אפליקציה בלבד` (perm.native) | **App only** | Not "Native". |
