# CLAUDE.md — OUT / OUTRUN Admin Panel

## Project
OUT is a fitness app (calisthenics parks, XP progression) for Israel municipalities.
This repo (`appout-1`) is the **Next.js admin panel** (CRM + Drive integration)
and the **React/Capacitor mobile app**. Owner: David, Calisthenics Ltd (office@appout.co.il).

## Reference Files (load on demand — do NOT duplicate here)
| Domain | File |
|--------|------|
| Security + Firestore rules | `SECURITY.md` |
| Product + feature overview | `PRODUCT_TECHNICAL_REPORT.md` |
| File/folder map | `PROJECT_STRUCTURE.md` |
| Schedule algorithm | `src/features/schedule/out-run-schedule-logic-v1.3.md` |
| Workout engine rules | `.cursoragents/Workout_Engine_Truth.md` |
| XP / Level / Coins rules | `.cursoragents/XP_Progression_Truth.md` |
| CRM agent playbook | `.claude/agents/crm-agent.md` |
| Live session state | `.claude/knowledge/project-state.md` |
| Immutable ground truths | `.claude/rules/axioms.md` |

---

## Agent Operating Rules (7 laws)

1. **Audit-before-code**: Before writing code for any domain task, load the truth file for that domain (XP → `.cursoragents/XP_Progression_Truth.md`; Workout → `.cursoragents/Workout_Engine_Truth.md`; CRM → `.claude/agents/crm-agent.md`). If the truth file is missing — stop and say so.
2. **No self-grading**: The agent/session that writes code does not review its own output. Code review is a separate step, separate session.
3. **Emulator-before-deploy** (⚠️ unverified as hard law — see `.claude/rules/axioms.md` §14): When modifying `firestore.rules`, use `firebase emulators:start --only firestore` to verify before deploying.
4. **All-or-nothing writes**: Multi-document Firestore writes use transactions. Partial success is silent data corruption.
5. **Field-guards**: Never assume a Firestore field exists. Always use optional chaining (`?.`) and explicit defaults.
6. **Pixel-by-pixel UI safety**: Before changing any UI component, read adjacent components for z-index conflicts and shared state. See `.cursorrules` Z-Index Budget table.
7. **Domain-agnostic**: `src/features/{domain}/` is self-contained. No cross-domain direct imports. Shared utilities belong in `src/lib/`.

---

## Verification-First Rules (learned from recurring bugs)

**עיקרון-על: "נבנה" / "TSC נקי" ≠ עובד. תמיד לאמת על הקוד החי לפני שמסמנים done.**

1. **אמת קומפוננטה חיה לפני חיווט UI.** לפני הוספת רכיב למסך — ודא איזו קומפוננטה *באמת* מרונדרת במצב היעד (trace `mode` + mount-log זמני). יש כפילי legacy ששמם מטעה (דוגמה: `FreeRunActive` ↔ `FreeRunLayer`). אל תסמוך על שם הקובץ בלבד.
2. **אמת מקור-אמת לפני קריאת state.** לפני קריאת שדה מ-store — grep לכל ה-setters שלו. אם אף קוד חי לא כותב אליו, זה לא מקור האמת (דוגמה: `useRunningPlayer.activityType` תמיד `'running'` — ה-setter מוגדר אבל אף אחד לא קורא לו).
3. **בדוק על המסך, לא רק TSC.** אחרי שינוי UI — smoke ידני: הרכיב מופיע? הערך הנכון עובר? קומפילציה נקייה לא מוכיחה רינדור.
4. **stale code = החשוד מספר 1.** אם משהו "לא עובד" — קודם ודא שהקוד החדש נטען: restart dev, hard-refresh, ו-`git status` שהשינוי בעץ העבודה ובענף הנכון.
5. **מדוד, אל תנחש.** לבאג UI/CSS — קרא ערכים אמיתיים (computed DOM, `getBoundingClientRect`) לפני שמציעים תיקון.
6. **זהה ונקה legacy.** כשנוגעים בפיצ'ר — סמן מי חי ומי מת, ונקה כפילים. קוד מת עם שם דומה לקוד חי הוא פצצת זמן.
7. **אסור להחליש חוקי Firestore.** תקן בצד הנתונים / query / join, לא בחוקים. זכור: "rules are not filters" — ה-query חייב לתאום לצורת החוק.
8. **§17 triple-write.** כל נתיב join עובר דרך `joinEngine` וכותב `user_memberships` *לפני* presence. אל תיצור נתיב join חדש שעוקף את זה.
9. **היגיינת git.** אל תקמט לוגים / debug / קבצי `.claude/knowledge` לקומיט.

---

## Tech Stack
- **Frontend:** Next.js 14.2 App Router, TypeScript, Tailwind, ShadCN
- **Mobile:** React + Capacitor (iOS/Android), Mapbox GL, HealthKit bridge plugin
- **Backend:** Firebase (Auth, Firestore, Storage), Vercel (Node serverless)
- **Integrations:** Google Workspace (Gmail + Drive via service-account delegation), Bunny CDN
- **Key env vars:** `GMAIL_SERVICE_ACCOUNT_KEY_PATH`, `AGENT_API_KEY`, `ADMIN_SECRET`

## Architecture Patterns
- API routes: `src/app/api/admin/<domain>/route.ts` — always guard with `requireAdminApi(request)`
- Firebase Admin: `getAdminDb()` / `getAdminAuth()` from `src/lib/firebase-admin.ts`
- Google APIs: **dynamic `await import('googleapis')` only** — never top-level (hangs webpack on this machine)
- Service account helper: `getCombinedClient(email)` in `src/lib/google-service-account.ts`
- Mailboxes constant: `ALL_MAILBOXES` = david@, office@, matan.danan@ (all appout.co.il)

---

## Firestore Rules — NEVER VIOLATE

| Rule | Detail |
|------|--------|
| `isActiveClient` | **Never modify** on any authority without David's written approval — gates league access |
| Paying clients | See `.claude/knowledge/product-context.md` for current list — city names are data, not law |
| Valid statuses | Only 8: `draft → lead → meeting → quote → follow_up → closing → active → upsell` |
| Array append | `FieldValue.arrayUnion` — never overwrite the whole array |
| Array delete | Direct `getDoc` → filter → `updateDoc` — `arrayRemove` silently fails on objects |
| Timestamps in arrays | `Timestamp.now()` — `serverTimestamp()` is invalid inside array elements |
| Document `updatedAt` | Always `FieldValue.serverTimestamp()` |

---

## CRM Agent Safety Rules
These govern the daily automated CRM scan (see `.claude/agents/crm-agent.md` for full playbook):

1. **Panel writes** (Firestore, Drive): autonomous — no confirmation needed
2. **Gmail drafts**: allowed — agent creates drafts, never sends
3. **Sending email or WhatsApp**: **FORBIDDEN** without explicit approval from David
4. **Pipeline auto-advance**: forward only; `closing → active` requires David's confirmation
5. **Personal / 1-on-1 threads**: skip entirely — CRM processes authority↔company only
6. **Broker / commission threads**: skip — patterns defined in `CRM_Agent.md`
7. **New lead creation**: only when authority name + business intent are both clearly present

---

## Git / Deploy Rules
- Never push to `main` without explicit request
- Never `--force` push or `--no-verify`
- Never commit `.env.local`, `secrets/`, or service-account key files
- CI: Vercel deploys on merge to `main`

## Code Standards
- TypeScript strict; avoid `any` except for Firebase/Google API return types
- Components → `src/features/admin/components/`, services → `src/features/admin/services/`
- No top-level `googleapis` / `google-auth-library` imports anywhere in the codebase
- iCloud Drive is active — never delete `.next/` or `node_modules/` without checking iCloud status
- Do not modify the `next.config.mjs` webpack cache settings (caused startup hangs previously)
