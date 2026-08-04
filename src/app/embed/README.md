# /embed/* — iframe-embeddable routes

Routes under this directory render anonymously and chrome-free, for
embedding in an external `<iframe>` (marketing site). See
`src/app/embed/layout.tsx` and `src/app/ClientLayout.tsx`'s `isEmbedRoute`
check for how chrome suppression works.

## Shipped
- `/embed/exercises` — exercise library. Verified working end-to-end
  (David, 2026-08-04): loads clean with no app chrome, 373 exercises with
  no login, filters + search work.

## Open items
- **CSP `frame-ancestors` is still a placeholder.** `next.config.mjs`'s
  `/embed/:path*` header currently allows `http://localhost:3000` only —
  it needs the real marketing-site domain once that's decided. Update it
  (and `src/lib/embed-config.ts`'s `ALLOWED_EMBED_ORIGINS`, kept in sync by
  hand) as part of the separate domain-consolidation task — don't forget
  this when that work happens.
- **This is the reusable pattern for the next embed.** `/embed/map` should
  follow the same shape: a route under `src/app/embed/`, no changes needed
  to `HIDDEN_NAV_ROUTES`/`isEmbedRoute` in `ClientLayout.tsx` (already
  matches on the `/embed` prefix), same CSP scoping in `next.config.mjs`.
  The map feature itself is a much bigger lift than exercises was — see the
  original feasibility research (page-level, ~10 Zustand stores, no
  responsive/desktop layout exists yet) before starting.
