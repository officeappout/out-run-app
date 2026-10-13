# Accessibility backlog (items found, not yet scheduled)

## arena/create — 7 labels without an associated control (jsx-a11y/label-has-associated-control)
`src/app/arena/create/page.tsx` lines 278 (שם הקבוצה), 288 (קטגוריה), 307 (תיאור קצר), 355 (יום בשבוע), 374 (שעת התחלה), 384 (תדירות), 405 (מיקום – אופציונלי).
Fix: plain inputs → `htmlFor` + `id`; button-group ones (קטגוריה / יום / תדירות) → `role="group"` + `aria-labelledby`. Recorded 13.10.2026 (David: handle separately).

## Brand-blue TEXT on white (1.9–2.4:1) — separate from fills
e.g. home tab labels "התקדמות שבועית" 1.88:1 / "מדדי בריאות" 2.42:1; onboarding program-path card labels 2.05:1.

## Emerald #10B981 / emerald-600 with white or on white (2.5–3.8:1)
SummaryStep pressed, RunningScheduleStep running day, StickyActionButton success, photo-release "✓ נחתם".

## Loader text `text-black/30` on `/` (2.09:1)

## gray-400 / gray-300 / slate-300 (non-4a files), placeholders (PR 5), keyboard pass (home/profile/workout/onboarding)
Tracked in the wave plan.
