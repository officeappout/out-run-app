# Admin Panel Testing Strategy — Browser Smoke Tests

**Status:** Deferred (decided 06.09.2026). Not a rejection of the idea — a cost/benefit call at the current
client profile. See §4 for the explicit trigger to re-open this decision.

## 1. Why this doc exists

Two production breaks happened in one session on the same feature (`/admin/links` QR generator, PR #39):

1. A client bundle leaking `firebase-admin` (Node-only deps) into the browser — caught by `next build`.
2. A `qr-code-styling` constructor crash on drawer-open (`imageOptions.hideBackgroundDots` read on
   `undefined`) — **not** caught by `next build`, `tsc`, or 34 passing unit tests. Only a real browser
   mounting the real component throws it, because it's a runtime error inside third-party library code
   triggered by a specific component lifecycle state (mounted, logo not yet loaded).

That second class of bug is structurally invisible to every check currently run before merge. This doc
records the analysis of what it would take to close that gap, and why the decision right now is not to.

## 2. What would have caught it

A small tier of browser-level smoke tests (Playwright or equivalent) that, for a handful of core admin
pages, navigate to the page, perform one or two key interactions (e.g. "open the first edit drawer"), and
assert zero console errors / no error-boundary text. Not full visual or UX coverage — a coarse "does this
page still load and not throw" gate, run in CI on every PR before merge.

## 3. Cost estimate

**~6-9 hours for a first useful version**, and the breakdown matters more than the total:

- **Auth setup: ~3-4h — this is most of the cost, not the tests themselves.** Every admin page requires a
  real Firebase session. The harness needs either a seeded test-admin login flow or a Firebase-emulator-backed
  test user before a single page can be smoke-tested at all.
- **Writing the actual page checks: ~2h**, once auth works — navigate + interact + assert no console errors,
  for ~5 pages (`/admin/links`, `/admin/links/[id]`, dashboard, authorities, one more).
- **CI wiring: ~1-2h** — a GitHub Actions workflow (none exists in this repo today — confirmed, no
  `.github/workflows` directory) or a job triggered off the Vercel preview URL.

No `.github/workflows` and no Playwright/Cypress dependency exist in this repo as of 06.09.2026 — today,
the *only* pre-merge signal is Vercel's own build, which is a compile/bundle check, not a runtime check.

## 4. Decision — deferred, not rejected

**The math, as of 06.09.2026**: both production breaks together cost about one hour of engineering time to
diagnose and fix, with **zero client-facing impact** — the admin panel's only users right now are internal
(David + the CRM/marketing team). Building the smoke-test tier is a 6-9 hour up-front investment (gross
estimate) to guard against a failure mode that, so far, has been cheap to catch and fix after the fact via
manual click-through + the existing `next build` verification step.

At this client profile, the expected cost of *not* having the tests (occasional short internal-only
incidents, ~1h each) is lower than the cost of building the tests. Decision: **defer**.

This is a point-in-time cost/benefit call, not a verdict that the idea is wrong. Re-derive the same math
if either side of it changes materially (many more admin pages, much more frequent breaks, etc.) — but
there is one specific, unambiguous trigger below that flips the accounting on its own regardless of
incident frequency.

## 5. Trigger to re-open this decision

**The moment any external user outside the internal team — specifically, a municipality (עירייה) employee —
gets real access to the admin panel.**

At that point a crash in the admin panel stops being an internal inconvenience and becomes a client-facing
incident: the "zero client-facing impact" half of the cost math in §4 flips to nonzero, and the account
should be redone from scratch at that time — not assumed to still favor deferral. Do not reuse the §3/§4
numbers as-is when that happens; re-estimate against however many admin pages and municipality-facing flows
exist at that point, since both will likely have grown.

## 6. What's in place instead, in the meantime

- Branch protection on `main` (David, 06.09.2026, in progress).
- Working norm: whoever merges a PR opens the screen(s) it changed before/after merging — the manual
  check that would have caught both incidents in this doc, formalized as a habit rather than automated.
