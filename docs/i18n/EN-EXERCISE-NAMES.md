# English exercise names (he → en) — canonical list

> Status: **proposal for owner review.** Companion to [EN-GLOSSARY.md](./EN-GLOSSARY.md) (general vocabulary) and [EN-VOICE.md](./EN-VOICE.md).
> Purpose: every translator (human or LLM) uses these names **verbatim** for exercises, never a word-for-word translation. Example: `סיבוב לאחור על טבעות` is **Skin the Cat**, not "rings back rotation".

## How this was built

- **Hebrew side:** the exercise names in the repo's committed `exercise-inventory.csv` (366 rows, 364 distinct `name_he`), cross-checked against the Hebrew catalogs (`src/messages/he`) for session terms (EMOM, AMRAP, Tabata, superset). No production Firestore was read. Note `firestore_exercises.txt` shows the legacy English-ish names some exercises had (e.g. "Eccentric Skin the Cat"), which confirms the mapping for the skill family.
- **English side:** names only (no prose copied) from: Wikipedia "Front lever"; Antranik "Progression exercises for static holds" (https://antranik.org/progression-exercises-for-static-holds/); GMB "Elements" / rings pages (https://gmb.io/?p=108399, https://gmb.io/rings); the r/bodyweightfitness wiki (skin-the-cat page mirror, https://twt.omada.cafe/r/bodyweightfitness/wiki/exercises/skin-the-cat); common usage in Overcoming Gravity, Calisthenicmovement and StartBodyweight. **Verification caveat:** reddit.com and some mirrors blocked automated fetching, so the Recommended Routine ladders and Overcoming Gravity names are stated from standard community usage, not re-fetched this session. Rows marked "(std)" rest on that.
- **Confidence:** unmarked = confident. `?` = plausible reading of the Hebrew, needs a Hebrew-reading check by the owner. Anything uncertain is in section 12 (UNMAPPED) or section 11 (OWNER CHOICE).

---

## 0. Rules (read first)

1. **Never translate literally.** Look the Hebrew up here; if it is missing, ask (add to UNMAPPED), do not improvise.
2. **Stage words come before the skill, in this fixed order:** `[Stage] [Skill]` → "Advanced Tuck Front Lever", one stage per name, so never "One-Leg Straddle Planche". Stage ladder (easy to hard): **Tuck → Advanced Tuck → One-Leg → Straddle → Half Lay → Full**. "Full" is dropped in names ("Front Lever" = the full version) except when contrasting stages ("Full Front Lever" in a progression list).
3. **Order of modifiers:** `[Assist/Level] [Grip/Width/Angle] [Base exercise] [Variant]`: "Band-Assisted Wide-Grip Pull-Up", "Negative Archer Pull-Up".
4. **Capitalization:** exercise names are **Title Case** wherever they appear as a name (titles, labels, buttons, chips, lists): "Front Lever", "Pull-Up", "Bulgarian Split Squat". In running sentences use lowercase for generic movements ("do three pull-ups", "a front lever hold") but proper adjectives stay capitalized always (Bulgarian, Cossack, Romanian, Nordic, German, Australian, Copenhagen). Small words stay lowercase in Title Case ("Skin the Cat", "Toes-to-Bar", "L-Sit to Pike Press").
5. **Hyphens:** Pull-Up, Push-Up, Chin-Up, Muscle-Up, Sit-Up, Step-Up, V-Up, L-Sit, V-Sit, One-Arm, One-Leg, Toes-to-Bar, Cat-Cow, Band-Assisted. Never "Pullup", "Muscle Up".
6. **Angles and heights:** keep the number and degree sign: "Push-Up (45° Incline)", "Pull-Up Hold at 90°". Hebrew `גובה אגן / ברך / שוק` = **Hip-Height / Knee-Height / Shin-Height** (box/foot elevation).
7. **Bands:** `בעזרת גומייה / עם גומייה` (helps you) → **Band-Assisted X**. `בהתנגדות גומיה / כנגד גומייה` (makes it harder) → **X with Resistance Band** (or "Banded X" in tight UI). Thickness: דקה = Light, בינונית = Medium, עבה = Heavy.
8. **Holds vs reps:** `החזקת X` = **X Hold**; `הרמות / עליות X` (raises) = **X Raises**; `הליכות X` = **X Walks**; `... אקצנטרי` / `... שלילי` = **Negative** (owner decided 27.10); `... טווח חלקי` = **Partial Range**; `... מוגבה` = **Elevated**.
9. **Do not expand abbreviations the sources keep short:** EMOM, AMRAP, HSPU only if the Hebrew uses them; otherwise write "Handstand Push-Up".
10. **Gotchas:** `דגל` alone = **Human Flag** (not Dragon Flag; that is `דרגון פלאג`). `פלאנץ׳` = **Planche** (with a geresh), `פלאנק` = **Plank**; they are different movements. `מתח` = **Pull-Up** (it also means "tension" in other Hebrew; here always the exercise). `סמוך קום` = **Burpee**. `מקבילים` = **Dips** (the bars are "Parallettes/Parallel Bars", the movement is the dip).

---

## 1. Pulling: pull-ups, rows, hangs

| Hebrew | English canonical | Alternates | Notes / source |
|---|---|---|---|
| מתח | Pull-Up | pullup | Standard everywhere |
| מתח סופינציה | Chin-Up | Supinated Pull-Up | Owner decided 27.10 |
| מתח באחיזה מעורבת | Mixed-Grip Pull-Up | Alternating-Grip Pull-Up | |
| מתח צר | Close-Grip Pull-Up | Narrow-Grip | |
| מתח רחב | Wide-Grip Pull-Up | | |
| מתח עם גומייה דקה / בינונית / עבה | Band-Assisted Pull-Up (Light / Medium / Heavy Band) | | Rule 7 |
| מתח אקצנטרי | Negative Pull-Up | Eccentric Pull-Up | Owner decided 27.10: Negative |
| מתח אקצנטרי עם תמיכה / עם החזקות | Assisted Negative Pull-Up / Negative Pull-Up with Holds | | |
| מתח עם החזקות | Pull-Up with Holds | Pull-Up with Pauses | Pauses at set positions |
| מתח טווח עליון / תחתון | Top-Range Pull-Up / Bottom-Range Pull-Up | Partial Pull-Up (top/bottom half) | `?` check meaning |
| מתח מתפרץ | Explosive Pull-Up | High Pull-Up | "מתפרץ גבוה" = High Pull-Up (chest-to-bar) `?` |
| מתח מתפרץ עם טבעות / גומייה | Explosive Ring Pull-Up / Band-Assisted Explosive Pull-Up | | |
| מתח סופינציה מתפרץ | Explosive Chin-Up | | |
| מתח קשתים | Archer Pull-Up | | Standard |
| מתח קומנדו | Commando Pull-Up | | Standard |
| מתח מכונת כתיבה (Typewriter) | Typewriter Pull-Up | | Hebrew already gives the English |
| מתח יד אחת עם גומייה | Band-Assisted One-Arm Pull-Up | | |
| מתח יד אחת בעזרת אצבעות | Finger-Assisted One-Arm Pull-Up | | Assist hand holds the working wrist/fingers `?` |
| מתח יד אחת עם חולצה | Towel-Assisted One-Arm Pull-Up | Shirt-Assisted | Hebrew says "shirt"; towel is the common English drill `?` |
| מתח לא שוויוני עם טבעות | Uneven Ring Pull-Up | | `?` |
| מתח שכמות (תלייה אקטיבית פסיבית) | Scapular Pull-Up | Scap Pull-Up, Scapular Shrug | OWNER CHOICE #12 (vs Active Hang) |
| מתח שכמות יד אחת / עם תמיכה / קשתים | One-Arm Scapular Pull-Up / Assisted Scapular Pull-Up / Archer Scapular Pull-Up | | |
| תלייה פסיבית | Dead Hang | Passive Hang | Standard |
| תלייה פסיבית בתמיכת הרגליים | Feet-Assisted Dead Hang | | |
| החזקת מתח ב-15° / 90° / 120° | Pull-Up Hold at 15° / 90° / 120° | Flexed-arm hang (90°) | Angle = elbow angle `?` |
| החזקת מתח ... עם תמיכה | Assisted Pull-Up Hold at ... | | |
| החזקת מתח יד אחת ב-... | One-Arm Pull-Up Hold at ... | | |
| מתח אוסטרלי ב-15° / 30° / 60° | Australian Pull-Up (15° / 30° / 60°) | Inverted Row | Owner decided 27.10: Australian Pull-Up |
| חתירות ב-15° ... 75° | Australian Pull-Up (15° ... 75°) | Inverted Row, Bodyweight Row | Owner decided 27.10: Australian Pull-Up for both Hebrew names |
| חתירות ב-15° עם ברכיים כפופות | Bent-Knee Inverted Row (15°) | | |
| חתירות יד אחת ב-45° | One-Arm Inverted Row (45°) | | |
| חתירות קשתים ב-30° / 45° | Archer Row (30° / 45°) | | |
| חתירות בעמידה בהתנגדות גומיה | Standing Band Row | | |
| החזקת חתירה ב-90° מעלות במרפק | Row Hold at 90° | Isometric Row Hold | |
| משיכות פנים | Face Pulls | | |
| משיכות Y | Y Pulls | Y-Raises | `?` |
| פולי עליון על הריצפה עם מגבת | Towel Lat Pulldown (Floor) | | `?` |
| חתירות פרונט לבר בטאק / בטאק מתקדם | Tuck Front Lever Row / Advanced Tuck Front Lever Row | | Section 3 |
| תלייה באחיזה עמוקה / חתירות באחיזה עמוקה | UNMAPPED | | See §12 |

## 2. Pushing: push-ups, dips, handstand

| Hebrew | English canonical | Alternates | Notes / source |
|---|---|---|---|
| שכיבות סמיכה | Push-Up | Press-Up (UK, do not use) | US spelling per EN-VOICE |
| שכיבות סמיכה ברכיים | Knee Push-Up | | |
| שכיבות סמיכה ב-15° ... 75° | Incline Push-Up (15° ... 75°) | | Degrees of incline from vertical-ish; keep the number |
| שכיבות סמיכה רחבות | Wide Push-Up | | |
| שכיבות סמיכה מרפקים צמודים | Close-Elbow Push-Up | Narrow Push-Up | |
| שכיבות סמיכה יהלום | Diamond Push-Up | Close-Grip Push-Up | Standard |
| שכיבות סמיכה שיפוע שלילי | Decline Push-Up | | |
| שכיבות סמיכה קשתים | Archer Push-Up | | |
| שכיבות סמיכה קשתים עם רצועות | Archer Push-Up (Straps) | Ring/Strap Archer Push-Up | |
| שכיבות סמיכה קשתים בפישוק | Straddle Archer Push-Up | | `?` |
| שכיבות סמיכה פסודו פלאנץ׳ | Pseudo Planche Push-Up | | BWF spelling "Pseudo" |
| הישענות פסודו פלאנץ׳ | Pseudo Planche Lean | | |
| שכיבות סמיכה פלאנץ׳ טאק / טאק מתקדם | Tuck Planche Push-Up / Advanced Tuck Planche Push-Up | | |
| שכיבות סמיכה פייק | Pike Push-Up | | |
| שכיבות סמיכה פייק גובה אגן / ברך / שוק | Feet-Elevated Pike Push-Up (Hip / Knee / Shin Height) | | Rule 6 |
| שכיבות סמיכה פייק עמוקות גובה אגן | Deep Pike Push-Up (Hip Height) | | |
| שכיבות סמיכה בעמידת ידיים חזה לקיר | Chest-to-Wall Handstand Push-Up | HSPU | Short form only if the Hebrew uses it |
| שכיבות סמיכה שלילי בעמידת ידיים חזה לקיר | Negative Chest-to-Wall Handstand Push-Up | | |
| שכיבות סמיכה לשכמות | Scapular Push-Up | Push-Up Plus | |
| שכיבות סמיכה ספינקס | Sphinx Push-Up | | Forearm triceps extension |
| שכיבות סמיכה על טבעות 75 | Ring Push-Up (75°) | | |
| שכיבות סמיכה מתפרץ | Explosive Push-Up | Plyo Push-Up | |
| שכיבות סמיכה אקצנרטי (sic) | Negative Push-Up | Eccentric Push-Up | Hebrew typo "אקצנרטי"; OWNER CHOICE #1 |
| שכיבות סמיכה טווח עליון / תחתון | Top-Range / Bottom-Range Push-Up | | `?` |
| שכיבות סמיכה בהתנגדות גומיה | Push-Up with Resistance Band | | |
| שכיבות סמיכה רצועות ב-45° | Strap Push-Up (45°) | | |
| שכיבות סמיכה סופינציה | Reverse-Grip Push-Up | Supinated Push-Up | `?` |
| שכיבות סמיכה בפישוק | UNMAPPED | | See §12 |
| מקבילים | Dips | Parallel Bar Dip | Singular "Dip" for the exercise name |
| מקבילים על מוט | Straight Bar Dip | | |
| מקבילים על טבעות | Ring Dip | | Standard |
| מקבילים בולגריים | Bulgarian Dip | Bulgarian Ring Dip | Standard ring term `?` |
| מקבילים אקצנטרי | Negative Dip | Eccentric Dip | OWNER CHOICE #1 |
| מקבילים טווח עליון / תחתון | Top-Range Dip / Bottom-Range Dip | | |
| מקבילים עם גומייה דקה / בינונית / עבה | Band-Assisted Dip (Light / Medium / Heavy) | | |
| מקבילים על טבעות בעזרת גומיה דקה | Band-Assisted Ring Dip | | |
| החזקת מקבילים | Dip Support Hold | Parallel Bar Support Hold | |
| החזקת מקבילים ב-15° / 90° / 120° (עם גומייה) | Dip Hold at 15° / 90° / 120° (Band-Assisted) | | |
| החזקות מקבילים אקצנטרי | Negative Dip Holds | | |
| החזקת תמיכה על טבעות (עם עזרה) | Ring Support Hold (Assisted) | RTO Support Hold | Ring support; "RTO" = rings turned out |
| החזקת שכיבת סמיכה ב-90° במרפק | Push-Up Hold at 90° | Bottom Push-Up Hold | |
| עמידת ידיים | Handstand | | |
| עמידת ידיים חזה לקיר (ב-45°) | Chest-to-Wall Handstand (45°) | | |
| הליכות קיר | Wall Walks | | |
| פשיטת מרפקים על הרצפה / ספסל | Bodyweight Triceps Extension (Floor / Bench) | | |
| פשיטת מרפקים למתקדמים | Advanced Bodyweight Triceps Extension | | |
| פשיטת מרפקים בהתנגדות גומיה | Triceps Extension with Resistance Band | | Overhead variant = "יד מאחורי הראש": Overhead Triceps Extension |
| כפיפת מרפקים במשקל גוף 30° / 45° | Bodyweight Biceps Curl (30° / 45°) | Inverted Biceps Curl | `?` |
| כפיפת מרפקים בהתנגדות גומיה | Biceps Curl with Resistance Band | | |
| לחיצת חזה בשכיבה בהתנגדות גומיה | Band Chest Press (Lying) | | |
| לחיצת כתפיים בהתנגדות גומייה | Band Shoulder Press | | |
| פרפר הפוך | Reverse Fly | Rear Delt Fly | |
| פרפר רצועות ב-45° | Strap Fly (45°) | | `?` |

## 3. Skills: levers, planche, flag, muscle-up

Stage ladder for all lever/planche skills: **Tuck → Advanced Tuck → One-Leg → Straddle → Half Lay → Full** (OWNER CHOICE #6 for One-Leg / Half Lay spelling).

| Hebrew | English canonical | Alternates | Notes / source |
|---|---|---|---|
| פרונט לבר | Front Lever | FL | Wikipedia "Front lever"; Antranik |
| פרונט לבר בטאק | Tuck Front Lever | Tucked | |
| פרונט לבר בטאק מתקדם (עם גומייה) | Advanced Tuck Front Lever (Band-Assisted) | | |
| פרונט לבר רגל אחת (בעזרת גומייה) | One-Leg Front Lever (Band-Assisted) | Single-Leg, One-Legged | OWNER CHOICE #6 |
| פרונט לבר בפישוק (עם גומייה) | Straddle Front Lever (Band-Assisted) | Straddled | OWNER CHOICE #6 |
| פרונט לבר חצי גוף | Half Lay Front Lever | Half-Layout | OWNER CHOICE #6 |
| פרונט לבר מלא | Full Front Lever | Front Lever | |
| פרונט לבר יהלום (עם גומייה) | Diamond Front Lever | | OWNER CHOICE #7 (non-standard term) |
| הרמות פרונט לבר (בטאק / בטאק מתקדם / בפישוק / חצי גוף / רגל אחת) | Front Lever Raises (stage) e.g. "Tuck Front Lever Raise" | | |
| בק לבר | Back Lever | | |
| בק לבר בטאק / בטאק מתקדם | Tuck Back Lever / Advanced Tuck Back Lever | | |
| בק לבר בפישוק | Straddle Back Lever | | |
| פלאנץ׳ בטאק / בטאק מתקדם | Tuck Planche / Advanced Tuck Planche | | Antranik |
| פלאנץ׳ בטאק (מתקדם) בעזרת גומייה דקה | Band-Assisted (Advanced) Tuck Planche | | |
| פלאנץ׳ יהלום בעזרת גומייה דקה | Band-Assisted Diamond Planche | | OWNER CHOICE #7 |
| לחיצה מישיבת L לפלנאץ׳ בטאק (sic) | L-Sit to Tuck Planche Press | | |
| דגל אנושי | Human Flag | | Standard |
| דגל בטאק | Tuck Human Flag | | |
| דגל בפישוק | Straddle Human Flag | | |
| דגל אקצנטרי בטאק | Negative Tuck Human Flag | | |
| דגל בעזרת גומייה | Band-Assisted Human Flag | | |
| דגל ב-45° | Human Flag (45°) | | `?` |
| דגל נמוך / דגל פלאנק צידי | UNMAPPED | | See §12 |
| עליית כוח | Muscle-Up | Bar Muscle-Up | Bar assumed unless "על טבעות" |
| עליית כוח עם טבעות | Ring Muscle-Up | | |
| עליית כוח בעזרת גומייה / על טבעות בעזרת גומייה | Band-Assisted Muscle-Up / Band-Assisted Ring Muscle-Up | | |
| עליית כוח בקפיצה (עם טבעות) | Jumping Muscle-Up (Ring) | | |
| עליית כוח בעזרת תנופה | Kipping Muscle-Up | | |
| עליית כוח אקצנטרי על מוט / עם טבעות | Negative Muscle-Up (Bar / Rings) | | OWNER CHOICE #1 |
| נדנוד הכנה לעליית כוח | Muscle-Up Swing Drill | | `?` |
| סקין דה קאט | Skin the Cat | | GMB, BWF wiki. Hebrew `סיבוב (לאחור) על הטבעות` = this |
| סקין דה קאט בטאק | Tuck Skin the Cat | | |
| סקין דה קאט טאק מתקדם | Advanced Tuck Skin the Cat | | |
| סקין דה קאט חצי גוף | Half Lay Skin the Cat | | OWNER CHOICE #6 |
| סקין דה קאט אקצנטרי | Negative Skin the Cat | | OWNER CHOICE #1 |
| תלייה גרמנית (not in inventory) | German Hang | | GMB |
| אחיזת שקר | False Grip | | GMB; not in the inventory, here for future content |
| ישיבת L | L-Sit | | |
| ישיבת L על הרצפה | Floor L-Sit | | |
| ישיבת L ברכיים כפופות | Tuck L-Sit | Bent-Knee L-Sit | Antranik: "Tucked" |
| ישיבת L בתמיכת הרגליים | Foot-Assisted L-Sit | | |
| ישיבת L רגל אחת | One-Leg L-Sit | | |
| לחיצה מישיבת L לפייק | L-Sit to Pike Press | | `?` |
| ישיבת V / מאנה (not in inventory) | V-Sit / Manna | | Future content; sources: GMB, Overcoming Gravity (std) |

## 4. Core

| Hebrew | English canonical | Alternates | Notes / source |
|---|---|---|---|
| החזקת הולו באדי | Hollow Body Hold | Hollow Hold | Standard (GMB, BWF) |
| החזקת קשת (not in inventory) | Arch Hold | | Not in inventory; here for future content |
| דרגון פלאג בטאק / בטאק מתקדם | Tuck Dragon Flag / Advanced Tuck Dragon Flag | | Do not confuse with `דגל` |
| דרגון פלאג בפישוק | Straddle Dragon Flag | | |
| גליל בטן עם תמיכת הברכיים | Ab Wheel Rollout (Kneeling) | | |
| גליל בטן אקצנטרי | Negative Ab Wheel Rollout | | |
| פלאנק | Plank | | |
| פלאנק על הברכיים | Knee Plank | | |
| פלאנק גבוה טבעות | High Plank on Rings | | `?` |
| פלאנק עליות ונגיעות בכתפיים | Plank Shoulder Taps | | |
| פלאנק רגל ויד נגדית | Opposite Arm and Leg Plank | | |
| עמידת כלב רגל ויד נגדית | Bird Dog | | |
| קופנהגן פלאנק | Copenhagen Plank | | |
| כפיפות בטן | Sit-Up | Crunch | `?` Israeli usage covers both; OWNER CHOICE #10 |
| קראנץ | Crunch | | |
| כפיפות בטן אלכוסונים | Oblique Crunch | | |
| כפיפות בטן חצי טווח | Half Sit-Up | | |
| אופניים | Bicycle Crunch | | |
| עליות l בתלייה | Hanging L-Sit Raise | Hanging Leg Raise (straight leg) | |
| עליות ברכיים כפופות בתלייה | Hanging Knee Raise | | |
| כפיפות ברכיים בתלייה אלכסונים | Hanging Knee Raise (Oblique) | | |
| רגליים למתח | Toes-to-Bar | T2B | `?` OWNER CHOICE #11 |
| עליות רגליים בשכיבה | Lying Leg Raise | | |
| עליות ספר רגליים ישרות | V-Up | Jackknife | `?` |
| עליות מספרים בשכיבה / מספרים בשכיבה | Scissor Kicks | Flutter Kicks | `?` |
| מספריים אופקיים בשכיבה | Horizontal Scissor Kicks | | |
| עליות נגיעה בבהונות בשכיבה | Toe Touch Crunch | Reaching Crunch | |
| הרמות רגליים בישיבת פייק/L | Pike / L-Sit Leg Lifts | Pike Compression | |
| מטפס הרים | Mountain Climbers | | |
| כפיפות ברכים בפלאנק על trx | TRX Plank Knee Tucks | | Keep "TRX" |
| כפיפת ברכיים כנגד טבעות | Ring Knee Tuck (Banded?) | | `?` |
| סיבובי רגליים בשכיבה | Lying Leg Circles | | Windshield wipers (`מגבים`) would be "Windshield Wipers" |
| שולחן הפוך | Reverse Tabletop | | |
| שחיין חזה / פינגווינים / ספר ברכיים כפופת | UNMAPPED | | See §12 |

## 5. Legs

| Hebrew | English canonical | Alternates | Notes / source |
|---|---|---|---|
| סקוואט | Squat | Bodyweight Squat | |
| סקוואט קפיצה | Jump Squat | | |
| סקוואט עמוק | Deep Squat | | |
| סקוואט טווח חלקי | Partial Squat | Quarter Squat | |
| סקוואט כנגד קיר / סטטי כנגד קיר | Wall Squat / Wall Sit | | |
| סקוואט כנגד קיר רגל אחת | One-Leg Wall Squat | | |
| סקוואט כנגד גומייה | Banded Squat | | |
| סקוואט בעזרת רצועות | Strap-Assisted Squat | | |
| סקוואט קשתים | Cossack Squat | Archer Squat | Owner decided 27.10 |
| סומו סקוואט | Sumo Squat | | |
| דרגון סקוואט (+ וריאציות) | Dragon Squat | | Known term; check content before reuse `?` |
| פיסטול סקוואט | Pistol Squat | | Standard |
| פיסטול סקוואט מוגבה | Elevated Pistol Squat | | |
| פיסטול סקוואט שלילי ימין / שמאל | Negative Pistol Squat (Right / Left) | | OWNER CHOICE #1; use "Right"/"Left" |
| החזקת פיסטול סקוואט | Pistol Squat Hold | | |
| שרימפ סקוואט | Shrimp Squat | | Standard |
| שרימפ סקוואט בלי ידיים | No-Hands Shrimp Squat | | |
| שרימפ סקוואט בתמיכת רגל / עמוד | Assisted Shrimp Squat (Foot / Pole) | | |
| סיסי סקוואט | Sissy Squat | | |
| לאנג׳ קדמי / אחורי | Forward Lunge / Reverse Lunge | | |
| לאנג׳ בהצלבה | Curtsy Lunge | | |
| לאנג׳ עמוק | Deep Lunge | | |
| לאנג׳ בולגרי | Bulgarian Split Squat | | OWNER CHOICE #8 |
| דדליפט רומני | Romanian Deadlift | RDL | Spell out; RDL only if Hebrew uses it |
| דדליפט רגל אחת | Single-Leg Deadlift | One-Leg | Rule: "One-Leg" for skills, "Single-Leg" for lifts (std) |
| כפיפת נורדיק | Nordic Curl | Nordic Hamstring Curl | |
| כפיפת נורדיק אקצנטרי / טווח חלקי / בעזרת גומייה | Negative Nordic Curl / Partial Nordic Curl / Band-Assisted Nordic Curl | | |
| נורדיק אחורי | Reverse Nordic Curl | | |
| היפ טראסט | Hip Thrust | | |
| היפ טראסט רגל אחת / מוגבה | Single-Leg Hip Thrust / Elevated Hip Thrust | | |
| הרמות תאומים טווח מלא | Calf Raise (Full Range) | | `תאומים` is the calf (twin muscle) |
| עליות תאומים (על מדרגה) | Calf Raise (on Step) | | |
| עליית מדרגה גובה אגן / ברך / קרסול | Step-Up (Hip / Knee / Ankle Height) | | |
| קפיצה גובה אגן / ברך / שוק | Box Jump (Hip / Knee / Shin Height) | | |
| קפיצה על רגל אחת גובה ברך | Single-Leg Box Jump (Knee Height) | | |
| לחיצת רגליים כנגד עמוד | Leg Press Against Pole | | `?` |
| כפיפת ברך כנגד גומייה | Banded Leg Curl | Hamstring Curl with Band | |
| פשיטת ירך אחורית | Hip Extension | | |
| הליכות דוב | Bear Crawl | | |
| הליכת סרטן | Crab Walk | | |
| הליכות זחל | Inchworm | | `?` |
| הליכות היפ טראסט | Hip Thrust Walks | | `?` |
| סמוך קום (מתחילים / חצי / עם שכיבת סמיכה) | Burpee (Beginner / Half / with Push-Up) | | Rule 10 |

## 6. Mobility, stretching, warm-up

| Hebrew | English canonical | Alternates | Notes / source |
|---|---|---|---|
| מתיחת חתול פרה | Cat-Cow | Cat-Cow Stretch | |
| מתיחת כלב מביט מבט | Downward Dog | Down Dog | Hebrew has a typo (מבט מבט) |
| מתיחת מתפלל | Prayer Stretch | Child's Pose | `?` |
| מתיחת פרפר | Butterfly Stretch | | |
| מתיחת ישיבה בפייק | Seated Pike Stretch | Seated Forward Fold | |
| מתיחת המסתרינג בשכיבה | Lying Hamstring Stretch | | |
| מתיחת ירך קדמית | Quad Stretch | | |
| מתיחות שורש כף יד | Wrist Stretches | Wrist Prep | |
| מתיחת קרסול ושוקיים / גמישות קרסול לעמוד | Ankle and Calf Stretch / Standing Ankle Mobility | | |
| מתיחת כתף / מתיחות יד אחורית | Shoulder Stretch / Triceps Stretch | | |
| מתיחת ראש לצדדים | Neck Side Stretch | | |
| גוד מורנינג בישיבה | Seated Good Morning | | |
| סיבוב חיצוני של הכתף | Shoulder External Rotation | | |
| חימום סיבובי ידיים / ירך / אגן / ברכיים / קרסול / מפרקים | Arm / Hip / Pelvic / Knee / Ankle / Joint Circles (warm-up) | | |
| חימום ריצה במקום | Running in Place (Warm-Up) | | |
| חימום קפיצות כוכב | Jumping Jacks (Warm-Up) | Star Jumps | |
| חימום הנפות | Leg/Arm Swings (Warm-Up) | | `?` |
| חימום כפיפות לפנים / צידיות | Forward Bends / Side Bends (Warm-Up) | | |
| חימום פשיטה וכפיפת עמוד השדרה | Spinal Flexion and Extension (Warm-Up) | | |
| חימום רוטציות לצדדים עמוד השדרה | Spinal Rotations (Warm-Up) | | |
| סשן התאוששות #N | Recovery Session #N | | A session name, not an exercise |
| הרחקת כתף ימין / שמאל | UNMAPPED | | See §12 |

## 7. Session and rest terms (shared with EN-GLOSSARY)

| Hebrew | English | Notes |
|---|---|---|
| EMOM / AMRAP | EMOM / AMRAP | Keep as-is; first mention may add "(every minute on the minute)" / "(as many rounds as possible)" in explainer copy only |
| טבטה | Tabata | Proper noun |
| סט / חזרות | set / reps | EN-GLOSSARY #5, #6 |
| סופרסט | superset | EN-GLOSSARY #8 |
| החזקה | hold | Timed isometric |
| מנוחה | rest | EN-GLOSSARY #20 |

## 8. Progression words

| Hebrew | English | Notes |
|---|---|---|
| טאק / בטאק | Tuck | Stage word (rule 2) |
| טאק מתקדם / בטאק מתקדם | Advanced Tuck | |
| רגל אחת | One-Leg | Skills; "Single-Leg" for lifts/lunges |
| בפישוק | Straddle | Not "Straddled" |
| חצי גוף | Half Lay | OWNER CHOICE #6 |
| מלא | Full | Dropped except in ladders |
| אקצנטרי / שלילי | Negative | OWNER CHOICE #1 |
| בעזרת גומייה / עם גומייה (assist) | Band-Assisted | Rule 7 |
| עם תמיכה / בתמיכת ... | Assisted | |
| טווח חלקי | Partial Range | |
| מוגבה | Elevated | |
| מתפרץ | Explosive | |
| יד אחת | One-Arm | |
| החזקה / החזקות | Hold / Holds | |

---

## 11. OWNER CHOICE (sources disagree, or the app has a product decision to make)

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | `אקצנטרי` and `שלילי`: **Negative** or **Eccentric**? The app uses both words for the same idea. | Negative (BWF/Overcoming Gravity usage, friendlier) vs Eccentric (more technical, GMB/physio usage) | **DECIDED 27.10: Negative.** |
| 2 | `מתח אוסטרלי` vs `חתירות`: the app has both. **Australian Pull-Up** vs **Inverted Row**? | Australian Pull-Up (popular, confusing for non-natives); Inverted Row (BWF/OG standard) | **DECIDED 27.10: Australian Pull-Up** (for both Hebrew names). |
| 3 | Pull-up angle holds (`החזקת מתח ב-120°`): is the number the elbow angle? | "Pull-Up Hold at 120°" (angle) vs descriptive ("Bottom / Mid / Top Hold") | Keep the angle, confirm it is elbow angle. |
| 4 | `מתח סופינציה`: **Chin-Up** or **Supinated Pull-Up**? | Chin-Up (universal) vs Supinated (precise, matches the grip name) | **DECIDED 27.10: Chin-Up.** |
| 5 | `סקוואט קשתים`: **Archer Squat** or **Cossack Squat**? | Same movement family; Cossack is the more common name | **DECIDED 27.10: Cossack Squat.** |
| 6 | Stage spelling: **One-Leg / Single-Leg / One-Legged**; **Straddle / Straddled**; **Half Lay / Half-Layout / Half Lay**. Sources split (Antranik: One Legged, Straddled, Half-Lay; Wikipedia: single leg, straddle, half lay). | see left | **One-Leg**, **Straddle**, **Half Lay**: shortest, no tense. |
| 7 | `יהלום` on front lever / planche (Diamond): not a standard progression term. | "Diamond" (literal, matches app) vs drop into an existing stage name | Keep **Diamond** (it is the app's own progression step); owner to confirm the position. |
| 8 | `לאנג׳ בולגרי`: **Bulgarian Split Squat** (standard) vs "Bulgarian Lunge". | | **Bulgarian Split Squat**. |
| 9 | Title Case vs sentence case for exercise names in UI. | Title Case ("Front Lever") vs sentence ("Front lever") | **Title Case** for names (rule 4); sentence case in prose. |
| 10 | `כפיפות בטן`: **Sit-Up** or **Crunch**? Hebrew covers both. | | **Sit-Up** for `כפיפות בטן`, **Crunch** for `קראנץ`. Owner to confirm the video. |
| 11 | `רגליים למתח`: **Toes-to-Bar** vs "Legs to Bar" vs "Hanging Leg Raise". | | **Toes-to-Bar** (std). Confirm the movement reaches the bar. |
| 12 | `מתח שכמות (תלייה אקטיבית פסיבית)`: **Scapular Pull-Up** or **Active Hang**? The Hebrew label contains both ideas. | | **Scapular Pull-Up** for the movement; **Active Hang** for the static hold. |
| 13 | Hold vs raise in lever training (`הרמות פרונט לבר`): "Front Lever Raise" vs "Front Lever Lift". | | **Raise**. |

## 12. UNMAPPED (could not map confidently; need an owner decision or a video look)

| Hebrew | Best guess | Why unsure |
|---|---|---|
| דגל נמוך | Low Human Flag? | Not a standard name |
| דגל פלאנק צידי | Side Plank Flag? | Not a standard name |
| תלייה באחיזה עמוקה / חתירות באחיזה עמוקה | Deep-Grip Hang / Row? | "Deep grip" may mean false grip or a different handle |
| תלייה מספרים | Hanging Scissor Kicks? | Unclear leg action |
| בננה סופרמן על המתח | Banana / Superman Hang? | Name from a copy of "passive hang" item |
| שכיבות סמיכה בפישוק | Wide-Stance Push-Up? | "Straddle" for a push-up is unusual |
| פשיטת ירך / פשיטת ירך אחורית | Hip Extension? | Standing or lying unknown |
| כפיפת נורדיק בירך | Nordic Hip Hinge? | Unclear |
| ספר ברכיים כפופת | Tuck V-Up? | "ספר" = book-closing motion; guess V-Up |
| פינגווינים | Penguin Crunches? | Israeli ab drill name |
| שחיין חזה | Prone Swimmer? | |
| סיסי לאנג׳ | Sissy Lunge? | Not a standard term |
| סקוואט בהונות | Toe Squat? | Unclear |
| דדליפט הפוך | Reverse Deadlift? | Unclear |
| הרחקת כתף ימין / שמאל | Shoulder Abduction (Right/Left)? | Mobility drill, details unknown |
| מתיחת דוגמנית | Model Stretch? | Unclear |
| מתיחות פלג גוף עליון לבדיקה / חימום פלג גוף עליון לבדיקה | (QA test items) | Look like test placeholders; delete from content |
| עותק של פיסטול סקוואט שלילי שמאל | (duplicate) | Copy artifact "עותק של" = "Copy of"; delete |
| qHy5Te1jSPSi5jA3W9d6 | (blank name) | An ID in the name column |
| פולי עליון על הריצפה עם מגבת | Towel Lat Pulldown? | Mapped with `?` in §1 |
| נדנוד הכנה לעליית כוח | Muscle-Up Swing Drill? | Mapped with `?` in §3 |
| חימום דנימי קפיצות כוכב (sic) | Jumping Jacks | Typo "דנימי"; fix in Hebrew |
| סקוואט בולגרי עם קפיצה על ספה, סקוואט+לחיצת כתפיים, סקוואט וכפיפת ברך לחזה | Compound drills | Describe, do not name: translate as a plain description |
