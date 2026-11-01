# תוכנית עבודה: הנגן המאוחד (מהקנבס לקוד)

## הקשר
בקנבס אושרו העיצובים הסופיים לנגן אחד לכל מצב: ניווט, מסלול, ריצה חופשית, ריצה מתוכננת, הליכה/ריצה, היברידי, גינה, משולב, יחד.
המיפוי של origin/main (4e880fe9) מראה שרוב השלד כבר קיים ומשותף:
- `players/shared/v2/run-chrome/`: `RunHeaderChrome`, `RunFloatingButtons`, `RunDrawerSheet`, `RunTopLayers`. משמשים גם את הריצה החופשית (`FreeRunOverlayV2`) וגם את הריצה המתוכננת (`PlannedRunLiveV2`).
- `StoryBars` (`src/components/ui/v2/StoryBars.tsx`) הוא פס הסיפור היחיד.

לכן המשימה היא לשדרג את השלד הקיים לעיצוב הסופי, לא לבנות נגן חדש.

הפערים שנמצאו מול העיצוב:
1. **סדר הכותרת:** הסדר צריך להיות שם, פסים, שורת רמז. בריצה חופשית הפס הוא `HeaderProgressBar` ולא `StoryBars`.
2. **כפתורים:**
   - הקפה היא היום דגל מצויר כחול. צריך להיות `lap.svg` (קיים, לא בשימוש).
   - השהייה היא היום כתומה. צריך להיות גרדיאנט כחול.
   - "המשך" הוא היום תכלת. צריך להיות כתום.
3. **מגירה:** אין נקודות דפים, אין כיתוב דף, ואין אייקוני הגדרות/שותף בפינה.
4. **ריצה מתוכננת:** שכבת ההשהיה הישנה ודיאלוג הסיום הישן עדיין עולים מעל הנגן החדש (`PlannedRunActive.tsx:464-592`).
5. **צבעים:** הפסים והשובל על המפה מגיעים משתי פלטות שונות. `V2_BLOCK_COLORS` מול `ZONE_TRAIL_COLORS`, למשל טמפו כתום מול תכלת.
6. **היברידי:**
   - לא מקבל את השלד. יש לו כרטיס כותרת צף במקום גרדיאנט.
   - המגירה היא `ParkWalkDrawer` הנפרדת.
   - שלושה מסכי פתיחת תחנה: `ParkStationIntro`, `BodyweightStationIntro`, `StationWelcomeScreen`.
7. **מצבים חסרים:**
   - מנוחה עם קצב.
   - הגעה ליעד וסוף מסלול.
   - GPS אבד.
   - הליכה/ריצה והליכה בקצבים.

## עקרונות
- **דגל חדש אחד:** `enable_unified_player_v1`.
  - fail-closed: `defaultValue: false`, `superAdminValue: true`.
  - כרטיס בפאנל: `src/app/admin/system-settings/page.tsx`, ב־`FlagState` וב־`FLAG_CARDS`.
  - כל שינוי נראה רק כשהדגל דולק. כיבוי מחזיר את המצב הנוכחי במדויק.
- **ענף חדש** `feat/unified-player` מ־origin/main, ב־worktree נפרד. ה־worktree הנוכחי מחזיק את פערי המחולל (ba181627, לא נדחף).
- **PR נפרד לכל שלב.** עצירה אחרי כל commit להצגת diff. push רק כשדוד אומר.
- **לא נוגעים:**
  - בפנים של `StrengthRunner`. המסירה נשארת ב־`HybridStationLayer.tsx:301`.
  - בקבצי המפה/ניווט של דוד (`AppMap`, `MapShell`, `DiscoverLayer`, `TurnCarousel`) בלי לשאול קודם.
- **לוגיקה טהורה בקבצי `.ts` עם בדיקות vitest** (סביבת node, בלי jsdom).
- **טקסט חדש דרך `t()`**, בשני הקטלוגים (he/en).
- **Tailwind לוגי**, כדי שיעבוד בשני הכיוונים.
- **z-index רק מטבלת `.cursorrules`.**

## שלבים

### שלב 0: דגל
- `enableUnifiedPlayerV1` ב־`src/hooks/feature-flag-defs.ts`, וכרטיס בפאנל.
- hook `useUnifiedPlayerV1` לצד `useRunPlayerDrawerV1.ts`.

### שלב 1: השלד (ריצה חופשית וריצה מתוכננת יחד, כי זה אותו קוד)
- **`RunHeaderChrome`:**
  - סדר: שם, `StoryBars` עם תווית הנתון, שורת רמז בלי קופסה.
  - בריצה חופשית: פס יחיד ב־`StoryBars` במקום `HeaderProgressBar`.
- **`RunFloatingButtons`:**
  - הקפה = `lap.svg` (עיגול 64, #00BAF7).
  - השהייה = גרדיאנט #00baf7 → #0284c7 עם פסים לבנים.
  - במושהה: "סיים" אדום, "המשך" כתום. אייקונים לבנים, בלי שחור.
- **`RunDrawerSheet`:**
  - נקודות דפים כחולות וכיתוב קטן ("נתונים כלליים" / "הקפה נוכחית" / "החזרה הזו" / "אני מול שותף").
  - הגדרות ושותף בפינה.
  - מצב קטן של שורה אחת. משיכה למעלה פותחת עוד נתונים. הלוגיקה ב־`snap-drawer-logic.ts` / `run-drawer-logic.ts`.
- **לוגיקה טהורה חדשה:** `unified-chrome-logic.ts`, שקובע לכל מצב את הדפים, את הנתון בפסים ואת הכפתורים. כולל בדיקות.

### שלב 2: ריצה מתוכננת
- כשהדגל דולק, לא מרכיבים את שכבת ההשהיה הישנה ואת דיאלוג הסיום (`PlannedRunActive.tsx:464-592`).
- כרטיס מנוחה עם קצב יעד וטווח: ירוק בטווח, כתום משני הצדדים.
- הליכה/ריצה והליכה בקצבים: פסים לפי סוג הקטע.
- **פלטה אחת:** `workout-palette.ts` חדש שמחזיר צבע לפי סוג קטע.
  - הפסים וגם השובל (`zoneTrailColorExpression` ב־`mapLayersConfig.ts`) קוראים ממנו כשהדגל דולק.
  - נגיעה ב־`mapLayersConfig` דורשת שאלה לדוד קודם (קובץ מפה).

### שלב 3: ניווט, מסלול, חופשי, יחד
- **מצבים:**
  - הגעה ליעד.
  - סוף מסלול.
  - GPS אבד: שורת רמז ונקודה, מבוסס על `gpsStatus` ב־`useRunningPlayer`.
- **דף "אני מול שותף"** במגירה. החומר מגיע מ־`useRunTogetherChrome`, במקום הלוח הנפרד.

### שלב 4: היברידי וגינה
- **`HybridOverlayV2`** מקבל את השלד: גרדיאנט עליון ו־`StoryBars` במקום `PlayerHeaderCard`, ואותם כפתורים.
- **`ParkWalkDrawer`** הופכת לדפים של `RunDrawerSheet`: נתוני הליכה, ותחנה הבאה עם "הגעתי" ב־300 המטרים האחרונים.
- **פתיחת תחנה אחידה:**
  - `ParkStationIntro` הכחול לכל תחנת מתקנים, גם כשמתחילים בגינה. `ParkWelcomeHeading` ו־`ParkAfterRow` כבר קיימים ב־`v2/park/ParkWelcome.tsx`.
  - `StationWelcomeScreen` לא עולה כשהדגל דולק.
- **אחרי התחנה האחרונה:** לסיים או להמשיך חופשי. כבר קיים ב־`StationCompleteScreen`; רק להתאים לעיצוב.

### שלב 5: ניקוי
אחרי שבוע יציבות עם הדגל דלוק לכולם, מוחקים את הנתיבים הישנים:
- `PlayerHeaderCard` בנגנים.
- `ContinuousRunCardV2` / `PlannedLiveCardV2` (הגרסאות בלי מגירה).
- `SideRail`.
- `StationWelcomeScreen`.
- הקוד המת: `NavigateLayer`, `TogetherPlayerLayer`, `PlannedRunPaused`, `FreeRunPaused`, `IntervalRunView`, `RunDashboard`.

## מחוץ לתוכנית (צריך החלטה או עיצוב נפרד)
- **"איפה כל מתקן בגינה?":** לא קיים בקוד. אין מיקום למתקנים בתוך הגינה. נשאר כקישור שפותח את כרטיסי המתקנים, בלי מפה, עד שיהיו נתונים.
- **המשך אחרי הפעלה מחדש, אזהרת נעילה, בטיחות:** לא עוצבו.
- **AMRAP/טבטה עם ריצה בתוך סבב:** חי בתוך `StrengthRunner`, לא נוגעים.

## אימות לכל שלב
- `npx vitest run` על תיקיות `players/shared/v2/__tests__` ו־`players/running/lib/__tests__`, והבדיקות החדשות.
- `bash scripts/ci/tsc-baseline.sh check`.
- `npx tsx scripts/i18n/validate-en-catalog.ts`.
- `bash scripts/safety-check.sh`.
- בדיקה על מכשיר אצל דוד, עם הדגל דלוק לסופר־אדמין בלבד: האם מה שעל המסך תואם ללוח בקנבס (לוחות 1 עד 9ג). לא מריצים dev server.
- **הדלקה לכולם רק אחרי אישור דוד**, והכיבוי הוא דרך הכרטיס בפאנל.
