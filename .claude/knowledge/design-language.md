# design-language.md — OUT Design System

> כל הערכים חולצו מהקוד בפועל ומצוינת הפניה לקובץ+שורה.
> ערכים חסרים מסומנים ⚠️ PLACEHOLDER — יש להשלים ידנית.
> עדכן קובץ זה בלבד — אל תשכפל טוקנים ב-CLAUDE.md.

---

## 1. צבעים

### צבעי Brand ראשיים
| Token (Tailwind) | HEX | תפקיד | מקור |
|---|---|---|---|
| `primary` | `#00dcd0` | Cyan ראשי — CTA, אלמנטים אקטיביים | `tailwind.config.ts:17` |
| `secondary` | `#ea1d24` | אדום — warning, danger, badge חשוב | `tailwind.config.ts:18` |
| `out-blue` | `#007aff` | כחול iOS — כפתורים משניים, לינקים | `tailwind.config.ts:19` |
| `out-cyan` | `#00ADEF` | Sky-blue — running player, lap circles, אקסנט | `tailwind.config.ts:24` |

**הערה:** עשרות שימושים inline (`bg-[#00C9F2]`, `text-[#5BC2F2]`) עוד לא קובצו לטוקנים. הצבעים הנפוצים ביותר: `#00C9F2`, `#5BC2F2`, `#4AADE3`, `#00E5FF`.

### צבעי רקע וכרטיסים
| Token (Tailwind) | HEX | תפקיד | מקור |
|---|---|---|---|
| `card-light` | `#ffffff` | רקע כרטיסים — light mode | `tailwind.config.ts:25` |
| `background-light` | `#f5f5f7` | רקע עמוד — light mode | `tailwind.config.ts:26` |
| `card-dark` | `#1E293B` | רקע כרטיסים — dark mode (StrengthDopamine + עתידי) | `tailwind.config.ts:28` |
| `background-dark` | `#0F172A` | רקע עמוד — dark mode | `tailwind.config.ts:29` |

**הערה:** `darkMode: 'manual'` — מצב כהה לא מופעל אוטומטית. (`tailwind.config.ts:4`)

### CSS Custom Properties (`:root`)
| משתנה | ערך | מקור |
|---|---|---|
| `--background` | `#ffffff` | `globals.css:66` |
| `--foreground` | `#171717` | `globals.css:67` |
| `html` fallback bg | `#F8FAFC` | `globals.css:104` |

### צבעי סטטוס (inline — לא טוקנים רשמיים)
| HEX | תפקיד | הערה |
|---|---|---|
| `#10B981` / `#00A86A` / `#00C07A` | הצלחה / פעיל | שמות שונים, תפקיד זהה |
| `#F59E0B` | אזהרה / amber | |
| `#EF4444` / `#FF6B00` | שגיאה / danger | |
| `#CBD5E1` | disabled / muted | |
| `#93C5FD` | dashed-line accent | `globals.css:323` |
| `#EAFBF4` | רקע badge הצלחה | |

⚠️ PLACEHOLDER — צבעי הסטטוס אינם טוקנים מוגדרים ב-Tailwind. יש לאחד ל-tokens ולרשום כאן.

---

## 2. טיפוגרפיה

### פונטים
| שם | Stack | תפקיד | מקור |
|---|---|---|---|
| `font-sans` (default) | `'Simpler Pro', Heebo, sans-serif` | ברירת מחדל | `tailwind.config.ts:50` |
| `font-simpler` | `'Simpler Pro', sans-serif` | utility class | `tailwind.config.ts:52` |
| `font-hebrew` | `'Simpler Pro', Assistant, Rubik, Arial Hebrew, sans-serif` | עברית מועצמת | `tailwind.config.ts:54` |

**קבצי פונט (OTF):**
| משקל | קובץ | מקור |
|---|---|---|
| 400 Regular | `src/app/fonts/SimplerPro-Regular.otf` | `globals.css:23` |
| 600 Semibold | `src/app/fonts/SimplerPro-Semibold.otf` | `globals.css:31` |
| 700 Bold | `src/app/fonts/SimplerPro-Bold.otf` | `globals.css:47` |

**מיפוי משקלים (CSS):**
| `font-weight` | ממופה ל | מקור |
|---|---|---|
| 300 (light) | Regular | `globals.css:36` |
| 500 (medium) | Semibold | `globals.css:44` |
| 800 (extra-bold) | Bold | `globals.css:52` |
| 900 (black) | Bold | `globals.css:60` |

### Utility Classes לטיפוגרפיה
| Class | תפקיד | מקור |
|---|---|---|
| `.font-simpler` | Simpler Pro + RTL אופטימל | `globals.css:175` |
| `.font-simpler-regular` | weight 400 | `globals.css:181` |
| `.font-simpler-semibold` | weight 600 | `globals.css:186` |
| `.font-simpler-bold` | weight 700 | `globals.css:191` |

### גדלי טקסט בשימוש נפוץ
| Tailwind class | גודל | שימוש טיפוסי |
|---|---|---|
| `text-[9px]`–`text-[11px]` | 9–11px | מיקרו-badges, indicators |
| `text-[12px]`–`text-[13px]` | 12–13px | labels, meta text |
| `text-sm` | 14px | גוף ראשי |
| `text-base` | 16px | טקסט סטנדרטי |
| `text-lg`–`text-xl` | 18–20px | כותרות משנה |
| `text-2xl`–`text-3xl` | 24–30px | כותרות סקשן |
| `text-4xl` | 36px | hero / כותרות ראשיות |

**RTL:** line-height `1.6`, letter-spacing `0.01em` לכל טקסט עברי. (`globals.css:160`)

---

## 3. מרווחים, Radius וצללים

### Border Radius (Custom — Tailwind Override)
| Token | ערך | שימוש | מקור |
|---|---|---|---|
| `rounded-lg` | `10px` | כפתורים, chips | `tailwind.config.ts:42` |
| `rounded-xl` | `12px` | שדות קלט, כרטיסים קטנים | `tailwind.config.ts:43` |
| `rounded-2xl` | `14px` | כרטיסים סטנדרטיים | `tailwind.config.ts:44` |
| `rounded-3xl` | `20px` | containers גדולים, bottom sheets | `tailwind.config.ts:45` |
| `rounded-4xl` | `28px` | hero cards — בשימוש מועט | `tailwind.config.ts:46` |

### Box Shadows
| Token | ערך | שימוש | מקור |
|---|---|---|---|
| `shadow-subtle` | `0 1px 3px rgba(0,0,0,0.05)` | עומק עדין, עיטורים | `tailwind.config.ts:33` |
| `shadow-card` | `0 2px 12px rgba(0,0,0,0.04)` | lift לכרטיסים | `tailwind.config.ts:38` |
| `shadow-floating` | `0 4px 12px rgba(0,0,0,0.15)` | elevation בינוני — floating UI | `tailwind.config.ts:34` |
| `shadow-drawer` | `0 -4px 24px rgba(0,0,0,0.08)` | bottom sheet / drawer מלמטה | `tailwind.config.ts:35` |
| `shadow-premium` | `0 4px 20px rgba(91,194,242,0.06)` | אקסנט premium עם גוון cyan | `tailwind.config.ts:36` |
| `shadow-premium-hover` | `0 8px 30px rgba(91,194,242,0.10)` | hover state premium | `tailwind.config.ts:37` |

### מרווחים
גריד 4px סטנדרטי של Tailwind — אין overrides מותאמים. (`gap-1` = 4px, `p-4` = 16px, וכו'.)

---

## 4. Utility Classes מיוחדות

| Class | תיאור | מקור |
|---|---|---|
| `.premium-card` | `bg-white`, `rounded-3xl` (20px), `shadow-premium` | `globals.css:199` |
| `.premium-card-sm` | `bg-white`, `rounded-2xl` (14px), `shadow-card` | `globals.css:211` |
| `.premium-sheet` | bottom sheet + premium shadow | `globals.css:219` |
| `.premium-btn` | כפתור base עם hover/active states | `globals.css:228` |
| `.no-scrollbar` / `.scrollbar-hide` | הסתרת scrollbar cross-browser | `globals.css:239` |
| `.scrollbar-thin` | scrollbar דק — Kanban boards | `globals.css:259` |
| `.dashed-line` | linear-gradient dashed (`#93C5FD`) | `globals.css:323` |
| `.progress-segment` | segment 4px לסרגלי התקדמות | `globals.css:298` |
| `.time-picker-mask` | gradient mask top/bottom לtime picker | `globals.css:305` |

---

## 5. אנימציות ומעברים

### Keyframes מוגדרים
| שם | תפקיד | מקור |
|---|---|---|
| `heroMarkerPulse` | טבעת פולס על marker ראשי במפה | `globals.css:332` |
| `fadeIn` | fade-in כניסה | `globals.css:356` |
| `fadeInUp` | fade + slide-up | `globals.css:365` |
| `swapSpin` | סיבוב רציף 360° | `globals.css:376` |

### Transition classes נפוצים
`transition-all`, `transition-colors`, `transition-opacity`, `transition-transform`
Durations: `duration-100`, `duration-200`, `duration-300`

---

## 6. Z-Index Budget

> מלא — אסור להוסיף ערך חדש בלי עדכון `.cursorrules`. (axioms.md §8)

| ערך | קומפוננטה | מקור |
|---|---|---|
| `z-[-1]` | ParticleBackground | `.cursorrules:31` |
| `z-0` | AppMap (Mapbox canvas) | `.cursorrules:32` |
| `z-20` | Active workout overlay | `.cursorrules:33` |
| `z-30` | ParkPreview card | `.cursorrules:34` |
| `z-40` | BottomJourneyContainer, HUD controls, RunStoryBar | `.cursorrules:36` |
| `z-50` | Mapbox facility popups | `.cursorrules:36` |
| `z-[60]` | WorkoutDrawer, NavigationHub, RoutePreviewCard | `.cursorrules:37` |
| `z-[70]` | Search bars (discover mode) | `.cursorrules:38` |
| `z-[90]` | JITSetupModal | `.cursorrules:39` |
| `z-[95]` | Referral toast | `.cursorrules:40` |
| `z-[100]` | Full-screen overlays (search, sheets, wizards) | `.cursorrules:41` |
| `z-[120]` | Dev-only banners | `.cursorrules:42` |
| `z-[200]` | RunSummary nested UI | `.cursorrules:43` |

---

## 7. קומפוננטות UI — רשימה

### src/components/ (shared)
| שם | נתיב | סוג |
|---|---|---|
| `CircularProgress` | `src/components/CircularProgress.tsx` | Progress |
| `AppLogoLoader` | `src/components/AppLogoLoader.tsx` | Loading |
| `BrandedSplashScreen` | `src/components/BrandedSplashScreen.tsx` | Splash |
| `AuthModal` | `src/components/AuthModal.tsx` | Modal |
| `BottomNavigation` | `src/components/BottomNavigation.tsx` | Nav |
| `ParticleBackground` | `src/components/ParticleBackground.tsx` | Background |
| `ErrorBoundary` | `src/components/ErrorBoundary.tsx` | System |

### src/components/ui/ (primitives)
| שם | נתיב | סוג |
|---|---|---|
| `CollapsingHeader` | `src/components/ui/CollapsingHeader.tsx` | Header |
| `StickyActionButton` | `src/components/ui/StickyActionButton.tsx` | Button |
| `Toast` | `src/components/ui/Toast.tsx` | Notification |
| `WheelPicker` | `src/components/ui/WheelPicker.tsx` | Input |
| `DrumTimePicker` | `src/components/ui/DrumTimePicker.tsx` | Input |
| `AppHeader` | `src/components/ui/AppHeader.tsx` | Header |
| `FeedbackFAB` | `src/components/ui/FeedbackFAB.tsx` | FAB |
| `ProfilePhotoUploader` | `src/components/ui/ProfilePhotoUploader.tsx` | Input |
| `OfflineBanner` | `src/components/ui/OfflineBanner.tsx` | Banner |
| `AnimatedFlame` | `src/components/ui/AnimatedFlame.tsx` | Icon/Animation |
| `AccessCodeGate` | `src/components/ui/AccessCodeGate.tsx` | Gate |
| `HealthConnectDisclosureModal` | `src/components/ui/HealthConnectDisclosureModal.tsx` | Modal |

### פיצ'רים — Drawers, Cards, Badges (דגימה)
| שם | נתיב | סוג |
|---|---|---|
| `WorkoutPreviewDrawer` | `src/features/workouts/components/workout-preview-drawer/` | Drawer |
| `RunDetailsDrawer` | `src/features/home/components/RunDetailsDrawer.tsx` | Drawer |
| `GroupDetailsDrawer` | `src/features/arena/components/GroupDetailsDrawer.tsx` | Drawer |
| `SessionDrawer` | `src/features/arena/components/SessionDrawer.tsx` | Drawer |
| `HeroCard` | `src/features/home/components/HeroCard.tsx` | Card |
| `HeroWorkoutCard` | `src/features/home/components/HeroWorkoutCard.tsx` | Card |
| `ProgressCard` | `src/features/home/components/ProgressCard.tsx` | Card |
| `EventCard` | `src/features/arena/components/EventCard.tsx` | Card |
| `GroupCard` | `src/features/arena/components/GroupCard.tsx` | Card |
| `MapCard` | `src/features/parks/core/components/MapCard.tsx` | Card |
| `PersonaBadge` | `src/app/admin/content-status/components/PersonaBadge.tsx` | Badge |
| `DrawerMuscleBadge` | `src/features/workouts/components/workout-preview-drawer/components/DrawerMuscleBadge.tsx` | Badge |

**סה"כ קומפוננטות בפרויקט:** 442+ (across features/)

---

## 8. נכסים ויזואליים

### לוגו
| נכס | נתיב | פורמט |
|---|---|---|
| Logotype ראשי | `public/assets/logo/Kind=logotype.svg` | SVG |
| PNG variant | `public/assets/logo/logo (1).png` | PNG |

### מסקוט — Lemur
| נכס | נתיב |
|---|---|
| King Lemur (ראשי) | `public/assets/lemur/king-lemur.png` |
| Lemur Doctor | `public/assets/lemur/lemur-doctor.png` |
| Lemur Curious | `public/assets/lemur/lemur_curious_peek.png` |
| Lemur Rest | `public/assets/lemur/lemur-rest.svg` |
| Lemur Avatar | `public/assets/lemur/lemur-avatar.png` |
| Lemur Notepad | `public/assets/lemur/lemur_notepad.png` |

### תמונות Landing
| נכס | נתיב |
|---|---|
| bg-1 | `public/images/landing/bg-1.jpg` |
| bg-2 | `public/images/landing/bg-2.jpg` |
| bg-3 | `public/images/landing/bg-3.jpg` |

### Gateway Cards
| נכס | נתיב |
|---|---|
| card-strength | `public/images/gateway/card-strength.png` |
| card-map | `public/images/gateway/card-map.png` |

### אייקונים (SVG)
| קטגוריה | נתיב |
|---|---|
| UI כלליים | `public/icons/ui/` |
| Running | `public/icons/running/` (speed, endurance, start) |
| Schedule | `public/icons/schedule/` |
| שרירים | `public/icons/muscles/` (shoulders, chest, forearms, abs, calves, etc.) |
| מפה | `public/icons/park-pin.svg`, `public/icons/user-marker.svg` |

---

## 9. PLACEHOLDERs — להשלמה ידנית

| נושא | מה חסר |
|---|---|
| ⚠️ צבעי סטטוס | אין טוקנים רשמיים — רק שימושים inline. יש לאחד ל-Tailwind tokens |
| ⚠️ Cyan variants | `#00C9F2`, `#5BC2F2`, `#4AADE3`, `#00BAF7` — נפוצים מאוד אך לא מוגדרים כ-tokens |
| ⚠️ Brand Kit Canva | תבניות פוסטים לרשתות — לא קיים בקוד |
| ⚠️ צבעי אדמין | panel הניהול משתמש ב-ShadCN — צבעים ב-CSS variables שונים, לא נכנסו לטבלה |
| ⚠️ Motion system | אין velocity/easing מוגדרים כ-tokens; רק class names כלליים |
