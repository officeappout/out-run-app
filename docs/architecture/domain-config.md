# Domain config — inventory, single source of truth, migration table

Prep work only — no domain flip performed, no deployed behavior changed.
Branch `chore/domain-config`. Goal: a future domain migration becomes
"change env vars + rebuild," not a grep-and-replace across the repo.

## Single source of truth

`src/lib/config/domain-config.ts` exports `ROOT_DOMAIN`, `SITE_URL`,
`APP_URL`, `ADMIN_URL`, `API_URL`, and `AUTHORITY_PORTAL_URL` (see below for
why the 6th was added). Each reads `process.env.NEXT_PUBLIC_*` with a
default equal to today's real, deployed value — setting no env vars at all
reproduces current production behavior exactly. `.env.example` documents
all six (commented out, since none need to be set today).

`capacitor.config.ts` mirrors `ROOT_DOMAIN`/`APP_URL`'s defaults by hand
(via `dotenv`, same env var names) rather than importing the TS module —
the Capacitor CLI's own TS loader isn't guaranteed to resolve this
project's tsconfig path aliases the way Next.js does, and a broken native
build isn't something I could verify locally. Same var names though, so
setting the env vars once affects both.

## Domain table — interim (today) vs. target (post-migration)

| Role | Interim (today, from code) | Target (subdomain shape) |
|---|---|---|
| אתר (site) | `outrun.co.il` — same as the app, no split yet | `ROOT` (bare, no sub) — becomes the marketing site specifically |
| אפליקציה (app) | `outrun.co.il` — capacitor's `server.url`, same origin as the site | `app.<root>` |
| אדמין (admin) | `admin.outrun.co.il` — **already live**, gated in `src/middleware.ts` | `admin.<root>` (unchanged pattern) |
| פורטל רשויות (authority portal) | `portal.outrun.co.il` — **already live**, same gate | `portal.<root>` (unchanged pattern) — not one of the 5 originally-requested vars, added as `AUTHORITY_PORTAL_URL` since middleware already hardcoded this alongside the admin one |
| API | `outrun.co.il` (same origin as the app — no separate API domain exists) | undecided — defaults to APP_URL until a dedicated API subdomain exists |

The final root domain is David's decision — this config only turns picking
one into a single-value change.

## Inventory — every hardcoded domain string found

### Refactored (now read from `domain-config.ts` / `app-urls.ts`)
| File:line | Was | Now |
|---|---|---|
| `capacitor.config.ts` (`server.url`, `allowNavigation`) | `'https://outrun.co.il'`, `['outrun.co.il', '*.outrun.co.il']` | `APP_URL`, `[ROOT_DOMAIN, `*.${ROOT_DOMAIN}`]` (mirrored via dotenv, see above) |
| `src/middleware.ts:137-138` | `'admin.outrun.co.il'`, `'portal.outrun.co.il'` literals | `new URL(ADMIN_URL).hostname`, `new URL(AUTHORITY_PORTAL_URL).hostname` — the `.local` dev-alias literals are untouched, see "intentionally not touched" below |
| `src/lib/config/app-urls.ts:25` (`WEB_BASE_URL`) | `'https://outrun.co.il'` | `APP_URL` |
| `src/app/booth/display/page.tsx:11,297` | `'https://outrun.co.il/challenge/LSIT26'`, display text `'outrun.co.il'` | `` `${SITE_URL}/challenge/LSIT26` ``, `{ROOT_DOMAIN}` |
| `src/app/challenge/[inviteCode]/done/page.tsx:21` (`IOS_STORE_URL` placeholder) | `'https://outrun.co.il'` | `SITE_URL` |
| `src/app/api/invite/run-session/route.ts:31` (`WEB_BASE`) | `'https://outrun.co.il'` | `APP_URL` |
| `src/features/home/components/SmartWeeklySchedule.tsx:1381` (SSR fallback host) | `'outrun.co.il'` | `new URL(APP_CONFIG_LINKS.WEB_BASE_URL).host` |

### Resolved (David's call, 2026-08-04)

**Legacy Vercel URL cluster — `out-run-app.vercel.app`, now routed through `SITE_URL`**
Decision: this was a correctness fix, not a behavior-preserving refactor —
`SITE_URL` currently equals the same real value (`outrun.co.il`), and the
old URL was already marked "do not use in new code." Swapped in:
`src/app/layout.tsx:14` (`metadataBase`), `src/app/workouts/[id]/page.tsx:34,41`
(`metadataBase` + OpenGraph `url`), `useFavoritesActions.ts:124,142`
(WhatsApp/native-share fallback text), `GroupDetailsDrawer.tsx:1210,1275` +
`CreateGroupWizard.tsx:510,527` (SSR-only fallback for
`window.location.origin` — the runtime path, when `window` exists, was
already correct and is unaffected), `legal-content.ts:422,435` (the two
delete-data form URLs in the Hebrew privacy-policy body text).
**Intentionally still left as-is:** `app-urls.ts`'s `LEGACY_VERCEL_URL`
constant itself (its whole purpose is documenting the old value) and
`middleware.ts`'s comment mentioning the same URL (prose, not a functional
value). `tsc --noEmit` confirmed clean after the swap.

### Found, intentionally NOT touched (flagged, not guessed)

**Firebase Auth `authDomain` — `src/lib/firebase.ts:35`**
`authDomain: "appout-1.firebaseapp.com"`. This is tied to the **Firebase
project** (`appout-1`), not to `ROOT_DOMAIN` — it does not move together
with a future domain flip. Changing it for real requires Firebase Console
(Authorized domains) + Google/Apple OAuth redirect-URI allowlist changes,
not a code edit. Folding it into `domain-config.ts` as if it were "just
another domain to flip" would be actively misleading. **Left untouched —
confirm with David whether/how he wants this tracked before anyone touches
it.**

**`.local` dev-DNS aliases — `src/middleware.ts:137-138`**
`'admin.outrun.local'`, `'portal.outrun.local'`. A separate, dev-only
local-hosts-file convention, unrelated to the `ROOT_DOMAIN` model (no
`NEXT_PUBLIC_LOCAL_DOMAIN` var was requested). Left as literals.

**Capacitor CORS origins — `src/middleware.ts` `CAPACITOR_ORIGINS`**
`'capacitor://localhost'`, `'https://localhost'`, `'http://localhost'`.
These are fixed WebView **scheme identifiers** Capacitor always uses
(`capacitor://localhost` on iOS, `https://localhost` on Android with
`androidScheme: 'https'`) — not one of our domains, and always `localhost`
regardless of what `APP_URL`/`ROOT_DOMAIN` resolve to. Not a
domain-config candidate at all.

**Company email/business domain — `appout.co.il`**
`office@appout.co.il`, `david@appout.co.il`, `matan.danan@appout.co.il`,
`gal@appout.co.il` — across `src/app/privacy/page.tsx`,
`src/app/delete-data/page.tsx`, `src/config/feature-flags.ts`,
`src/features/home/components/SettingsModal.tsx`,
`src/features/social/components/ChatInbox.tsx`,
`src/features/legal/legal-content.ts`, `src/lib/google-service-account.ts`,
`src/lib/firestore.service.ts`, `src/lib/firebase-admin.ts`, plus a couple
of one-off scripts. **A deliberately different domain** — the company's
email/business brand (`appout.co.il`), not this product's web domain
(`outrun.co.il`). Out of scope for this module by design, not an oversight.

**`outapp.il` — `src/app/admin/marketing-hub/page.tsx:85`**
Display-only sublabel referencing the Instagram handle `@outapp.il` (a
third distinct brand string, per marketing memory — not a web domain at
all). Out of scope.

**`files.appout.co.il` — `src/features/admin/services/park-import.service.ts:35`**
`OLD_FILES_HOST`, used only to detect URLs from a defunct legacy
file-storage host in one-off import scripts. Legacy/historical-data
concern, not live routing — left untouched.

**`onelink.to/appout` — `src/lib/config/app-urls.ts:22`**
Third-party OneLink smart-link service domain — not one of our domains at
all.

## Follow-ups

### CSP `frame-ancestors` — 2-line fix, do at merge time (not done here)
`next.config.mjs`'s `/embed/:path*` CSP header only exists on
`feat/embed-exercises`/`feat/embed-map` — not on `main`, and therefore not
on this branch. Building it here would duplicate/conflict with those
branches. Once merged, replace the `http://localhost:3000`-only
`frame-ancestors` value with:
```js
import { SITE_URL } from '@/lib/config/domain-config'; // or process.env.NEXT_PUBLIC_SITE_URL —
// next.config.mjs is loaded by Node before the TS/webpack pipeline exists,
// so it reads the env var directly rather than importing the module
// (same constraint already documented in embed-config.ts).
{
  key: 'Content-Security-Policy',
  value: `frame-ancestors 'self' ${process.env.NEXT_PUBLIC_SITE_URL || 'https://outrun.co.il'} http://localhost:3000`,
},
```
`SITE_URL` (bare root, `outrun.co.il`) is the right value here — not a
placeholder marketing-site domain — because per the target domain table
above, `ROOT_DOMAIN` bare *is* the future marketing site once the app
itself moves to `app.<root>`, so this becomes correct with zero further
changes once that flip happens. `http://localhost:3000` stays alongside it
unconditionally, for local dev testing.

**Recommended merge order (David's call, 2026-08-04):**
`feat/embed-exercises` → `feat/embed-map` → `chore/domain-config` → then
this 2-line CSP follow-up.

## tsc

`npx tsc --noEmit` — zero new errors introduced by this branch's changes
(pre-existing unrelated errors elsewhere untouched, same baseline as main,
re-verified after the vercel.app swap in the follow-up commit).
