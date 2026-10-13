# slate-400 / slate-300 → per-background — wave 4a (home + app routes)

13.10.2026. Rules (David): slate-400→slate-600 / slate-300→slate-500 per background; `dark:` and dark surfaces untouched; unknown background → leave + log (live axe decides); icons → slate-500; default slate-600, drop to slate-500 per Preview if hierarchy flattens.

## Changed (51 lines)
Text → `slate-600`: community tabs (561, 576), search tab (606), delete-data (82/130/239/267), gateway (120/384), home loaders (2667/2675), privacy (144/286/289), progress (108/116), photo-release (289/350), RunDetailsDrawer ×7, WorkoutLocationSuggestions text, NextRunWorkoutCard ×7, RunProgressCircle ×5, WeeklyExecutionCard.
Informational icons / de-emphasised state → `slate-500`: home chevron (193), checklist circle (212, was slate-300), completed line-through item (214), root-page close X on slate-100 (207), RunProgressCircle chevrons ×3, WorkoutLocationSuggestions chevron, HeroWorkoutCard / WorkoutSelectionCarousel placeholder icon, PushForegroundToast close-X (non-system branch only — both branches were `slate-400`; system toast is the dark one), NextRunWorkoutCard text button `slate-400 hover:slate-600` → `slate-500 hover:slate-700` (keeps a visible hover step).

## Deliberately NOT changed
| file:line | why |
|---|---|
| app/home/page.tsx 3641, 3643, 3667 | slate-300/400 on a dark card |
| components/system/PushForegroundToast.tsx 87, 102 (system branch) | system toast is the dark variant |
| app/public/forms/photo-release 326 | disabled button (exempt) |
| app/page.tsx 236 | decorative spinner next to text |
| app/community/page.tsx 1168 | competition-mode tab: background not determinable statically → check live |

## Noted, out of scope
- photo-release 289: `text-emerald-600` "✓ נחתם" on white is ~3.8:1 (fails AA) — separate colour wave.
