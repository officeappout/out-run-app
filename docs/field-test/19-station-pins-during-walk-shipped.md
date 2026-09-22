# A — פינים בזמן הליכה, כולל סינון כפילויות — נכתב ונבדק — 22.09.2026

## תשובה ישירה לשתי השאלות שנשאלו פעמיים

**א. תיקון הקריסה (מסלול אי-זוגי) — כן, נכתב, בענף נפרד, עם טסטים.** `fix/route-odd-geometry`, קומיט `89836568` מעל `origin/main@d78feab6`, לא merge, לא push. (חזר ואומת שוב עכשיו ישירות מול הגיט: `git diff origin/main..fix/route-odd-geometry --stat` → 2 קבצים, התיקון עצמו + הסקריפט המוכיח.)

**ב. ענף התחנות עודכן מול origin/main (28 קומיטים) — כן.** 25/25 קומיטים, אפס קונפליקטים, אפס קבצי אבטחה/הרשאות נגועים (נבדק במפורש ודווח — מסמך 16). 212/214 טסטים ירוקים.

---

## A — פינים בזמן הליכה: נכתב, נבדק על נתונים אמיתיים

**3 קבצים שונו, בענף `feat/route-stops-existing-route-fallback` (אחרי ה-rebase):**

1. **`start-hybrid-session.ts`** — `parkId` (שכבר קיים על כל stop שנפתר, `route-stops.service.ts:163`) עכשיו זורם עד לרשימת-הפינים שמגיעה למפה: שני ה-interfaces (`ComposedHybridSession`, `HybridRoutePreview`) קיבלו שדה `parkId?: string` על `stations`/`station`; כל 5 נקודות-הבנייה (4 מ-`oab.station.parkId` — full_park_workout + preview, ו-1 מ-`markerStations` — route_stops) מעבירות אותו הלאה.
2. **`AppMap.tsx`** — `excludedParkIds` (memo חדש): איחוד `selectedParkId` (כבר היה קיים) + `parkId` של כל תחנה היברידית. `parkPinsFilter` (הפין הרגיל) ו-`parkMinorPinsFilter` (החדש — הפין הקטן) שניהם עכשיו מסננים לפי הרשימה המאוחדת, לא רק לפי הפארק-הנבחר הבודד כמו קודם. **זה קריטי**: אזור 1 שבחרת ("תחנת כוח") הוא כמעט בוודאות urban_spot מסוג minor (לא מדרגות) — בלי התיקון ל-`park-minor-pins` הוא היה עדיין מכפיל.
3. **`FreeRunLayer.tsx`** — שורה אחת: `hybridStations={((groupRoute ?? logic.focusedRoute) as any)?.stationMarkers ?? null}`, בדיוק כמו ש-`MapShell.tsx:548` כבר עושה במסך הסקירה. זה מה שגורם לפינים להישאר גלויים בזמן ההליכה עצמה (לא רק לפני שהיא מתחילה) — הפער שתועד במסמך 17.

## הרצה על נתונים אמיתיים — `scripts/_verify-station-pin-dedup.ts`

רץ מול המסלול והפארקים האמיתיים של שדרות (`official_routes/YVx4pgJjOOXR8j497pPF`, `authorityId=CdiRk1QP5UrUGSbGjCkU`):

```
Resolved 2 real stops: פארק כושר הכרמים - שדרות(1lEIGxReLzJkRuaDeYXF), פארק הבריאות - נאות השקמה(W2BrOhXzngOSUOOsyNvx)

✅ שני ה-stops נושאים parkId אמיתי (לא undefined)
✅ excludedParkIds תואם בדיוק לשני ה-parkId האלה
✅ שני הפארקים האלה — הפין הרגיל שלהם מוסתר (רק הפין הציאן מוצג)
✅ בקרת-שלילה: פארק שלישי אמיתי בעיר ("כושר פתוח עלומים", לא תחנה במסלול הזה) — הפין הרגיל שלו נשאר גלוי, כמו שצריך
```

**tsc:** 448 שגיאות — זהה למספר לפני השינוי, אפס רגרסיה על 3 הקבצים שנגעתי בהם.
**vitest:** 212/214 ירוקים — אותם 2 כשלונות מוסברים-מראש (אמולטור לא רץ; test-isolation ידוע), אפס כשלון חדש.

**לא merge, לא push.**
