# /embed/* — iframe-embeddable routes

Routes under this directory render anonymously and chrome-free, for
embedding in an external `<iframe>` (marketing site). See
`src/app/embed/layout.tsx` and `src/app/ClientLayout.tsx`'s `isEmbedRoute`
check for how chrome suppression works.

## Shipped
- `/embed/exercises` — exercise library. Verified working end-to-end
  (David, 2026-08-04): loads clean with no app chrome, 373 exercises with
  no login, filters + search work.
- `/embed/map` (branch `feat/embed-map`, built on top of `feat/embed-exercises`) —
  real map + full route-builder (`MapShell`/`DiscoverLayer` reused as-is, not
  extracted). **Verified working end-to-end (David, 2026-08-04):** loads
  clean with no chrome, real location works, route-building works, and every
  "start"/write action opens the download modal instead of doing anything
  real.

### `/embed/map` — how it's built
- `embedPreset: 'route' | null` on `MapModeContext` (`MapEmbedPreset`, see
  `src/features/parks/core/context/MapModeContext.tsx`) is the single gate —
  allowlist source of truth in `src/features/parks/core/utils/embedPresets.ts`.
- **Red line, enforced in code not UI:** `logic.startActiveWorkout` is
  overridden once in `MapShellInner` (`guardedLogic` in
  `src/app/map/MapShell.tsx`) and threaded to every layer — every "start"
  path (route cards, free-run drawer, park detail sheet, group-session
  lobby) opens `useEmbedDownloadPromptStore`'s modal instead of starting a
  real, XP-tracked session.
- `AppHeader` is hidden entirely in embed (`MapShell.tsx`) — it's chrome
  `MapShell` owns itself, outside `ClientLayout`'s `/embed` suppression;
  its avatar/search/logo links would've navigated the iframe away, its
  bell/chat would've dead-clicked into overlays already unmounted.
- 7 gates in `DiscoverLayer.tsx` (partners — mode-header chip + cross-screen
  deep-link, hybrid entry, UGC/`ActionSpeedDial`, saved-places, dev
  mock-location panel, `useCommunityEnrichment`) plus `usePartnerData`'s new
  `disabled` param (reuses the existing ghost-mode short-circuit so
  anonymous embed traffic doesn't pull other real users' presence data at
  all, not just hide it in the UI).
- 5 write buttons in `ParkDetailSheet.tsx` (start-workout CTA, publish-
  arrival, join-event, rating submit, suggest-edit) route to the same
  download modal instead of silently no-op'ing on a missing profile.
- **`allow="geolocation"`** must be set on the embedding `<iframe>` tag for
  the real-GPS flow — see the geolocation follow-up below for a load-timing
  gap found during device testing. Optional `?lat=&lng=` query params hint a
  starting point (drops a pin + skips the initial zoom-to-GPS animation,
  same params `/map` itself reads) — `workoutId` is intentionally not
  supported, an anonymous visitor has no saved workouts.

## Open items

### FOLLOW-UP 1 — geolocation requested on load, not on a user gesture
Confirmed during device testing (2026-08-04): the GPS permission request
fires as soon as the map mounts (`useGPS.ts`'s watcher), not in response to
a tap. Inside a cross-origin iframe, browsers are stricter about permission
prompts that aren't tied to a user gesture and may silently block it — the
visitor never sees a prompt at all, and the map falls back to `AppMap`'s
default center (graceful, no crash, but the visitor never gets a real
location without it). Needs testing inside an actual third-party iframe
(not a same-origin/localhost load, which doesn't reproduce this). If
confirmed blocked, the fix is to also trigger `requestPermissionNow()` (or
whatever `useGPS`/`useGPSStore` exposes) from the existing recenter/GPS
button tap (`DiscoverLayer.tsx`'s recenter button,
`logic.handleLocationClick()`) so there's a user-gesture-triggered retry
path, not just the on-load one.

### FOLLOW-UP 2 — console noise: verified_global PERMISSION-DENIED
Confirmed during device testing: `usePartnerData`'s `disabled` param (added
for the map embed) does NOT cover this — it's a separate, ungated call site.
`useGroupPresenceListener()` is called unconditionally in `MapShellInner`
(`MapShell.tsx`, feeds `groupPartnerPositions`) → `useGroupPresence.ts` →
in "DISCOVERY" mode calls `acquirePresenceStream()`
(`useGroupPresence.ts:207`), which opens the shared `verified_global`
presence query in `src/features/parks/core/store/usePresenceStore.ts:61-77`
— a query the Firestore rules only allow for an authenticated user, so it
throws `PERMISSION-DENIED` for anonymous embed traffic. Not a functional
bug (the catch path already handles the error, map still works) but it's
wasted Firestore round-trips + console noise on every anonymous embed load,
same category of issue `usePartnerData`'s `disabled` param already fixed.
Fix: extend the same `disabled`-style short-circuit to
`useGroupPresenceListener`/`useGroupPresence`, gated on `embedPreset` —
same pattern, different call site.

### CSP `frame-ancestors` — still a placeholder
`next.config.mjs`'s `/embed/:path*` header currently allows
`http://localhost:3000` only — it needs the real marketing-site domain once
that's decided. Update it (and `src/lib/embed-config.ts`'s
`ALLOWED_EMBED_ORIGINS`, kept in sync by hand) as part of the separate
domain-consolidation task — don't forget this when that work happens.
Applies to both `/embed/exercises` and `/embed/map` (same `/embed/:path*`
scope).

### No responsive/desktop layout
`/embed/map` inherits `/map`'s phone-only assumptions (100dvh, safe-area-
inset offsets) verbatim per the original feasibility research. Fine for a
phone-aspect iframe, will look cramped in a wide desktop-aspect embed.

### Next embed candidate
None currently planned — see the original feasibility inventory (workout
generator / schedule / progress are all "אישי — דורש התחברות", not good
anonymous-embed candidates without more work).
