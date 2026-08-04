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
  extracted), anonymous, `?preset=route` behavior hardcoded via
  `embedPreset="route"` — see `src/features/parks/core/context/MapModeContext.tsx`
  (`MapEmbedPreset`) and `src/features/parks/core/utils/embedPresets.ts`.
  Not yet device-tested by David — pending confirmation before merge.

### `/embed/map` — embedding-site requirements
- **`allow="geolocation"`** must be set on the `<iframe>` tag itself for the
  real-GPS "where am I" flow to work — without it, the browser blocks the
  permission prompt inside the iframe entirely (silently, not an error the
  page can catch) and the map falls back to `AppMap`'s built-in default
  center. Denied/unavailable GPS already degrades gracefully either way (see
  `useGPS.ts`'s fallback chain + `AppMap.tsx`'s hardcoded default center at
  ~34.78,32.09) — `allow="geolocation"` is only needed for the *good* case.
- Optional `?lat=&lng=` query params hint a starting point (drops a pin +
  skips the initial zoom-to-GPS animation) — same params `/map` itself reads,
  see `src/app/embed/map/page.tsx`. `workoutId` is intentionally not
  supported — an anonymous visitor has no saved workouts.
- **Red line enforced in code, not just UI:** every path that would start a
  real session (`logic.startActiveWorkout`, reachable from route cards, the
  free-run drawer, park detail sheet, and the group-session lobby) is
  overridden at a single point in `MapShellInner` (`guardedLogic` in
  `src/app/map/MapShell.tsx`) to open `useEmbedDownloadPromptStore` instead —
  not a UI-only hide, so no code path can accidentally reach a live,
  XP-tracked session from the embed.
- Auth-gated writes unreachable via the 6+1 preset gates (partners, hybrid,
  UGC/`ActionSpeedDial`, saved-places, dev panel, `useCommunityEnrichment`,
  `ParkDetailSheet`'s arrival/join/rate/suggest-edit) all route to the same
  download modal rather than being hidden — verify visually once tested;
  none of this was device-tested, only read-verified against the code.

## Open items
- **CSP `frame-ancestors` is still a placeholder.** `next.config.mjs`'s
  `/embed/:path*` header currently allows `http://localhost:3000` only —
  it needs the real marketing-site domain once that's decided. Update it
  (and `src/lib/embed-config.ts`'s `ALLOWED_EMBED_ORIGINS`, kept in sync by
  hand) as part of the separate domain-consolidation task — don't forget
  this when that work happens. Applies to `/embed/map` too (same `/embed/:path*` scope).
- **`/embed/map` needs a device test before merge** — same as exercises got
  on 2026-08-04, but bigger surface: real MapShell/DiscoverLayer reuse,
  geolocation permission prompt inside a real iframe (not just localhost
  direct-load), and the download-modal red-line substitution for every
  write action.
- **No responsive/desktop layout** — `/embed/map` inherits `/map`'s
  phone-only assumptions (100dvh, safe-area-inset offsets) verbatim per the
  original feasibility research. Fine for a phone-aspect iframe, will look
  cramped in a wide desktop-aspect embed.
- Next embed candidate after map: none currently planned — see the original
  feasibility inventory (workout generator / schedule / progress are all
  "אישי — דורש התחברות", not good anonymous-embed candidates without more work).
