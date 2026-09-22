# 37 — כלי מיקום מדומה (עיר) — למה נעלם, ואיך להחזיר בבטחה

**תאריך:** 22.09.2026
**סטטוס:** READ-ONLY בלבד. לא מומש קוד.

---

## 1-2. מצאתי אותו — הוא לא "נעלם", הוא אף פעם לא היה נגיש מחוץ ל-dev מקומי

**הרכיב:** `src/features/dev/components/MockLocationPanel.tsx` — כפתור 🧪 בפינה שמאלית
תחתונה (`fixed bottom-28 left-3 z-[60]`), שנפתח לכרטיס עם רשימת 17 ערים (`CITY_PRESETS`,
שורות 6-24: ת"א, ירושלים, חיפה, ראשל"צ, אשדוד, אשקלון, באר שבע, נתניה, פ"ת, רחובות, הרצליה,
**שדרות**, אופקים, נתיבות, בית שמש, כפר סבא, רמת גן) + כפתורי "הפעל"/"כבה". מציג טבעת
כתומה + נקודה פועמת כשמצב בדיקה פעיל (שורות 81-86) — בדיוק הסימון הוויזואלי שביקשת.

**המקום שמרנדר אותו:** `src/app/map/layers/DiscoverLayer.tsx:1992`.

**השער:** `MockLocationPanel.tsx:123-126`:
```ts
export default function MockLocationPanel(props) {
  if (process.env.NODE_ENV === 'production') return null;
  ...
}
```
**זהו — אין שום בדיקת הרשאה.** אין `isSuperAdmin`, אין allowlist. השער היחיד הוא
`NODE_ENV !== 'production'`. מכיוון ש-`next build` (גם Preview וגם Production ב-Vercel)
תמיד מקמפל עם `NODE_ENV=production`, הרכיב הזה **מעולם לא היה נגיש בשום URL אמיתי** — רק
תחת `next dev` מקומי. זה ההסבר: הוא לא הוסר ולא נשבר — הוא נראה רק על המכשיר/סשן שבו מישהו
הריץ שרת dev מקומי.

## 3. הוסר? לא — מעולם לא נגע בו commit נוסף

בדקתי את כל ההיסטוריה (`git log -S`, `--follow`): קובץ ה-panel והשדות התומכים ב-`useDevSimulation.ts`
(`CityPreset`, `setCityPreset`, `selectedCity`) נוצרו **יחד, בקומיט אחד**:
`3af130a0` (01.05.2026, "chore: repository cleanup — gitignore, untrack build artifacts,
stage all src") — קומיט sweep רחב שהעלה עבודה מקומית לא-committed. מאז — **אף שינוי**, לא
ב-gating, לא ב-הרשאות, כלום.

## 4. ההצעה הכי קטנה — לא מומשה

**הכל כבר בנוי חוץ מ-3 דברים:** הרשאה, שמירה בין רענונים, ושדה lat/lng ידני בתוך הפאנל עצמו
(קיים היום רק כ-long-press על המפה — `MapShell.tsx:554`).

| מה חסר | המנגנון הקיים הכי מתאים |
|---|---|
| הרשאה ל-super-admin בלבד | `profile?.core?.isSuperAdmin` — **בדיוק אותו שדה** ש-`DiscoverLayer.tsx:683-684` כבר בודק, **באותו קובץ** שמרנדר את הפאנל. שדה Firestore, לא env — לא ניתן לזיוף מהלקוח כמו env var. (חלופה: `isRootAdmin`/`ADMIN_ALLOWED_EMAILS` מ-`feature-flags.ts:413-473` — אבל זה מיועד לפאנל הניהול, לא למסך המפה; ה-super-admin flag הוא ההתאמה הטבעית כאן.) |
| שמירה בין רענונים | היום `useDevSimulation` הוא `useState` טהור — נעלם ברענון. תוספת קטנה: `localStorage`/`sessionStorage` (או `onboardingPrefs.ts` אם רוצים גם ב-native, לפי axioms.md §19). |
| הזנת lat/lng ידנית בפאנל | קיימת כבר כ-long-press על המפה (`onLongPress={devSim.isMockEnabled ? devSim.setMockLocation : undefined}`) — רק צריך שדה טקסט/שני inputs בפאנל עצמו שקוראים לאותו `setMockLocation`. |
| כיבוי בלחיצה | קיים — כפתור "כבה" (`devSim.toggleMock`). |

**היקף השינוי המוצע (לא מומש):** בערך 15-20 שורות ב-3 מקומות — עטיפת `MockLocationPanel`'s
export עם בדיקת `profile?.core?.isSuperAdmin` (במקום/בנוסף ל-`NODE_ENV`), 2 שדות input +
כפתור בתוך `MockLocationPanelInner` לקואורדינטות ידניות, ו-hook קטן ל-persist/restore
ל-`localStorage`. **שעות: 1-2.** סיכון: נמוך — קוד מבודד, לא נוגע בשום נתיב production קיים
(הרכיב היום ממילא לא מגיע לאף בילד production).

**⚠️ נקודה שחייבת החלטה מפורשת שלך לפני מימוש (סעיף 5 מסביר למה):** האם הכלי צריך
להיות נגיש/פעיל **גם כשיש סשן אימון חי** (הליכה/ריצה בפועל), או שצריך לחסום/להזהיר
אז במיוחד? הסבר מלא למטה.

## 5. איפה זה משפיע — ומה נשבר

עקבתי את `effectivePos` (התוצאה של `devSim.effectiveLocation(realPos)`) בכל `MapShell.tsx`:

**כן, עובר לכל מי שקורא מיקום, ברוחב מלא:**
- **מפה/נוכחות עצמית:** `usePresenceLayer(effectivePos, ...)` — הנוכחות המשודרת שלך במפה מזויפת.
- **מסלולים/route_stops:** `logic.setEffectiveUserPos(effectivePos)` → `useRouteGeneration.ts:97`,
  `proximityPos = effectiveUserPos ?? currentUserPos` — **זה בדיוק הערך שמזין את חיפוש
  המסלולים הקרובים**, כולל resolveRouteStopsBackbone (הכי-קרוב-לנקודה). בחירת "שדרות" בפאנל
  תגרום למנוע להתייחס אליך כאילו אתה עומד שם.
- **אימון חי (FreeRunLayer):** `effectivePos` מועבר ישירות כ-prop (`MapShell.tsx:668`).
- **GPS אמיתי — נהרס לגמרי, לא רק מוזנח:** `useGPS.ts` — כש-`simulationActive===true`,
  ה-watch האמיתי (`navigator.geolocation.watchPosition`/Capacitor) **נסגר לגמרי**
  (`clearWatch`, שורה 257) וכל callback חוזר מיידית (`if (simulationActive) return`, שורות
  465/479/525/531/546). זה לא "מתעלם מ-GPS אמיתי ברקע" — זה **מכבה את המאזין לגמרי**.
- **הזרקה לסשן אימון פעיל, בכוונה:** `MapShell.tsx:200-202` — יש קוד ייעודי ("SimInject")
  שכש-`isWorkoutActive===true` **מזריק** את המיקום המדומה לתוך מעקב הסשן החי
  (`logic.injectSimPosition`). זה בנוי בכוונה לצורך בדיקת אימונים — אבל המשמעות היא: **אם
  תפעיל את הכלי באמצע הליכה אמיתית, המרחק/הקצב/ההתקדמות של אותו סשן יתחילו להיגזר מהמיקום
  המדומה, לא מ-GPS האמיתי, עד שתכבה.**

**סיכום מעשי:** זה לא כלי "רק למפה" — הוא **מחליף את מקור האמת של המיקום בכל האפליקציה**,
כולל בתוך אימון חי. בדיוק בגלל זה הדרישה שלך ל"סימון ויזואלי ברור" ו"כיבוי בלחיצה" קריטית —
הכלי כבר עונה על שניהם ויזואלית, אבל **אין היום שום הגנה מפני הפעלה בטעות באמצע הליכה
אמיתית**. שווה להחליט מראש (לא היום, לא מומש): לחסום את ההפעלה כש-`isWorkoutActive===true`,
או רק להציג אזהרה בולטת יותר במקרה הזה.

---

## החלטה

לא מומש. ממתין להחלטתך אם זה PR קטן לפני ההשקה.
