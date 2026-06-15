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
| CRM agent playbook | `.cursoragents/CRM_Agent.md` |

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
| `isActiveClient` | **Never modify** without explicit confirmation — gates league access for real users |
| Paying clients | אשקלון, קריית ים have `isActiveClient: true` — do not touch |
| Valid statuses | Only 8: `draft → lead → meeting → quote → follow_up → closing → active → upsell` |
| Array append | `FieldValue.arrayUnion` — never overwrite the whole array |
| Array delete | Direct `getDoc` → filter → `updateDoc` — `arrayRemove` silently fails on objects |
| Timestamps in arrays | `Timestamp.now()` — `serverTimestamp()` is invalid inside array elements |
| Document `updatedAt` | Always `FieldValue.serverTimestamp()` |

---

## CRM Agent Safety Rules
These govern the daily automated CRM scan (see `.cursoragents/CRM_Agent.md` for full playbook):

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
