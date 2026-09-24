## HealthMetricsRow / WhoTile — רכיב WHO-150-דקות בנוי במלואו, לא מורכב בשום מקום — 24.09.2026

**Opened:** 24.09.2026 · **Source:** ביקורת הרשאות בריאות (Google Play rejection על ActiveCaloriesBurned), תת-שאלה על מעקב WHO. נרשם לפי בקשת דוד — לא למחוק.

`src/features/home/components/rows/HealthMetricsRow.tsx` — קומפוננטה שלמה ותקינה (`WhoTile` + `StepsTile`, טבעת+אחוזים, מחובר ל-`useWeeklyProgress`/`useHealthWithDisclosure` בדיוק כמו המסך החי). גרפ מלא של `<HealthMetricsRow` בכל bases.tsx/ts מחזיר **אפס** תוצאות — הקומפוננטה מיוצאת (`export default HealthMetricsRow`) אבל אף עמוד לא מרנדר אותה. שתי הפניות היחידות אליה בכל הריפו הן הערות בקוד בקבצים אחרים (`CompactMetricTile.tsx`, `StepsSummaryCard.tsx`) שמניחות שהיא בשימוש.

**המסלול החי בפועל הוא אחר לגמרי:** `ActivityCard` בתוך `src/app/home/page.tsx` (`:256-283`, מורכב ב-`:2892` תחת טאב "מדדי בריאות"). אותו מקור-נתונים בדיוק (`useWeeklyProgress().summary.categoryTotals`), אותו יעד `150` דק' WHO, קוד שונה, ויז'ואל שונה. שני מימושים מקבילים לאותו פיצ'ר בדיוק — אחד חי, אחד מת.

זה בדיוק דפוס "שם דומה, קוד שונה" שמוזכר ב-verification-first rules של הפרויקט (בדוק איזו קומפוננטה *באמת* מרונדרת, אל תסמוך על שם קובץ). לא נמחק, לא תוקן — רק תועד.
