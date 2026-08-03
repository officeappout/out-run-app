# Hybrid "Workout Overview" — Component Inventory + Lego Map

> **Status:** READ-ONLY design research — no source file changed, no branch merged.
> **Date:** 2026-07-13 · **Method:** 4 parallel static traces (strength preview / running preview /
> walking-route preview / design tokens). **Every row cites `file:line`.**
> **Goal:** build the combined (aerobic+strength) "overview before start" page by **assembling
> existing Lego bricks**, not inventing a new language. Aerobic = green · Strength = amber.
> **Deliverable pair:** this doc + `.claude/previews/hybrid-workout-overview.html`.

---

## 0. TL;DR — the three surfaces already share one skeleton

All three "overview" surfaces are the **same shape**: a `rounded-t-[32px]` bottom-sheet/drawer →
hero (image or map) → a **metadata pill row** (difficulty bolts + duration) → **section groups with
a header** ("סופר סט Nx" / "אינטרוולים" / "הליכה למסלול") → **content cards** (exercise row / pace
row / route segment) → a **sticky gradient CTA** ("התחל אימון"). The hybrid page is a *fourth*
instance of this skeleton with two content-card types alternating on one vertical axis.

The ONE genuinely missing brick is a **vertical mixed-modality axis** (run-leg ↔ strength-station).
Everything else is reuse. See §D.

---

## A. Component Inventory

### A1 — Strength preview (`src/features/workouts/components/workout-preview-drawer/`)

| Component | file:line | Renders | Tokens | Reuse? |
|---|---|---|---|---|
| `WorkoutPreviewDrawer` | `.../WorkoutPreviewDrawer.tsx:69` | Draggable bottom sheet 95vh; hero + body + footer | `fixed bottom-0 z-[100] bg-white rounded-t-[32px] shadow-2xl` | Y (wrapper) |
| `DrawerHeader` | `.../components/DrawerHeader.tsx:38` | Sticky collapsing header: close (ArrowRight) + title + edit pencil | `absolute top-0 z-50 bg-white border-b border-gray-200` | Y |
| `DrawerFooter` | `.../components/DrawerFooter.tsx:50` | "N מתאמנים קרוב אליך" + Start (cyan-teal gradient) + edit + audio | `absolute bottom-0 z-50 bg-white/95 backdrop-blur-md border-t` | Y |
| `GeneratedWorkoutExerciseList` | `.../exercise-list/GeneratedWorkoutExerciseList.tsx:79` | Action row (bolts+duration) + equipment pills + muscle badges + sections | pill: `bg-white shadow-sm rounded-lg px-3 py-1.5 border-[0.5px] #E0E9FF` | Y |
| **`SectionHeader`** | `.../exercise-list/SectionHeader.tsx:43` | **Block header** — superset icon + "סופר סט" + round count `Nx`; warmup branch adds Active/Skip pill | superset: `text-cyan-600`; warmup active: `bg-cyan-50 text-cyan-600 border-cyan-300` | Y ★ |
| **`ExerciseCard`** | `.../exercise-list/ExerciseCard.tsx:34` | 70px thumbnail + name + reps/time + `SwapIcon`; goal ex. gets cyan ring | `h-[70px] w-[70px]`; goal: `ring-2 ring-cyan-400 bg-cyan-50/30`; normal: `border-[#E0E9FF] shadow-sm` | Y ★ |
| `PyramidStepCard` | `.../exercise-list/PyramidStepCard.tsx:43` | Per-step row (thumb+name+"סט N"+swap) for pyramid protocol | same card classes as `ExerciseCard`; swapped: `text-cyan-700` | Y |
| **`DifficultyBolts`** | `src/features/workout-engine/components/DifficultyBolts.tsx:68` | 3 `Bolt.svg` icons (filled=level) + label קל/בינוני/קשה | filled bolt = cyan SVG filter; `inline-flex gap-1.5` | Y ★ |
| `DrawerEquipmentBadge` | `.../components/DrawerEquipmentBadge.tsx:19` | Frosted pill: equipment SVG (18px) + label; PersonStanding fallback | `bg-white shadow-sm rounded-lg px-4 py-2 border-[0.5px] #E0E9FF` | Y |
| `DrawerMuscleBadge` | `.../components/DrawerMuscleBadge.tsx:33` | Muscle icon (3-tier SVG fallback → cyan letter) + label | `gap-1.5`; fallback letter `text-cyan-500 w-7 h-7` | Y |
| **`SwapIcon`** | `src/features/workout-engine/components/SwapIcon.tsx:16` | Refresh/reroll button, spins on click, cyan when active | swap.svg + rotate anim; active = cyan SVG filter | Y ★ |
| `StrengthOverviewCard` | `src/features/workout-engine/components/StrengthOverviewCard.tsx:55` | Legacy fallback: time+difficulty+equipment+muscles+desc | pill: `px-4 py-2 bg-white border rounded-full shadow-sm` | Y |
| **`section-grouping.utils.ts`** | `.../utils/section-grouping.utils.ts` | `groupExercisesIntoSections()` → warmup/superset/pyramid/regular/cooldown | titles: `'חימום':147` `'סופר סט':92` `'סט רגיל':115` `'מתיחות':151` | Y ★ (logic) |

### A2 — Running preview (`src/features/workout-engine/players/running/`)

| Component | file:line | Renders | Tokens | Reuse? |
|---|---|---|---|---|
| `RunBriefingDrawer` | `.../components/RunBriefingDrawer.tsx:217` | Full preview drawer: hero + pill row + intensity graph + sections + "where to run" + GO | `rounded-t-[32px] bg-white shadow-2xl`; spinner `border-[#00BAF7]` | Y |
| **`RunBlockBriefingCard`** | `.../components/RunBlockBriefingCard.tsx:21` | **Pace-segment card** — colored left bar + label + duration/pace meta + effort badge + drill link | `w-1 rounded-full` (colored border); effort: `text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full`; drill `text-[#00BAF7]` | Y ★ |
| **Intensity graph** ("תקציר קצבים") | `.../components/RunBriefingDrawer.tsx:425-437` | Vertical bar chart: height=intensity rank, width=duration, `block.colorHex` per bar | `rounded-t-sm`; inline `backgroundColor: colorHex`; container `flex items-end gap-[3px] h-12` | N (inline, extractable) |
| `RunStoryBar` | `.../components/PlannedRun/RunStoryBar.tsx:14` | **Horizontal** stacked segment bar (done/current/upcoming), drill dots | `h-1.5 rounded-full`; base `#E2E8F0`; glow `0 0 6px ${color}80` | Y (see §D) |
| `PaceGauge` | `.../components/PlannedRun/PaceGauge.tsx:38` | Live gauge: target band (emerald) + marker dot; effort variant | `rounded-2xl bg-white shadow-sm`; band `rgba(16,185,129,0.18)`; effort `#F59E0B/#EF4444/#DC2626` | Y |
| `WorkoutPreviewScreen` | `.../components/PlannedRun/WorkoutPreviewScreen.tsx:22` | Map-overlay compact preview: dark header + story bar + pills + block list + start | header `rgba(15,23,42,0.95)`; start `bg-gradient-to-l from-[#00C9F2] to-[#00AEEF]` | Y |
| Section header (run) | `.../components/RunBriefingDrawer.tsx:445` | Section bar חימום/אינטרוולים/מתיחות + lap-count pill | `bg-slate-50 border-b`; pill `rounded-full border-[0.5px] #E0E9FF` | Y |
| Difficulty / Duration / Quality pills | `.../RunBriefingDrawer.tsx:382-411` | bolts+label / clock+duration / "אימון איכות" | `bg-white shadow-sm rounded-lg px-4 py-2 border-[0.5px] #E0E9FF`; quality `bg-emerald-50 text-emerald-600` | Y |
| Sticky GO button | `.../RunBriefingDrawer.tsx:522-528` | "התחל אימון" + Play | `rounded-full`; `linear-gradient(to left,#0CF2E3,#00BAF7)`; `active:scale-[0.97]` | Y ★ |
| Surface cards (where-to-run) | `.../RunBriefingDrawer.tsx:473-482` | Track/Trail/Road cards; header tint `${color}10` | Track `#00BAF7` · Trail `#10B981` · Road `#F59E0B` | N (hardcoded) |

### A3 — Walking-with-route preview (`src/features/parks/`)

| Component | file:line | Renders | Tokens | Reuse? |
|---|---|---|---|---|
| **`AppMap`** (map hero) | `src/features/parks/core/components/AppMap.tsx:115` | `react-map-gl` Map + GeoJSON `Source`/`Layer` route line + `Marker` pins | route line `#00ADEF` w3.5; glow `#00E5FF`; walk-to-route dashed `#9CA3AF` `line-dasharray:[2,2]` | Y ★ (map) |
| `FreeRunDrawer` | `.../core/components/FreeRunDrawer.tsx:649` | Activity/goal config sheet + "התחל חופשי / עם מסלול" CTAs | `rounded-t-3xl shadow-2xl bg-white`; accent `#00ADEF` | Y (flow) |
| `RouteCarousel` / RouteCard | `.../core/components/RouteCarousel.tsx:1007` | Swipeable route card: name + stars + distance + duration + start | `w-[85vw] max-w-[340px] rounded-3xl p-5`; focus ring `shadow-[0_0_0_2.5px_rgba(0,229,255,.85)]` | Y |
| `BottomJourneyContainer` | `.../core/components/BottomJourneyContainer.tsx:1` | Compact route card: **stat chips** + walk-to-route row + journey CTA | chip `text-xs font-bold text-gray-700` icon `text-[#00E5FF]` | Y ★ |
| **Distance/Time/Kcal chips** | `.../BottomJourneyContainer.tsx:316-332` | MapPin+distance, Timer+duration, kcal | `flex items-center gap-1`; `gap-3` separator | Y ★ |
| **Walk-to-route row** | `.../BottomJourneyContainer.tsx:335-342` | "🚶 N דק' הליכה למסלול" collapsible | `bg-gray-50 rounded-lg px-4 py-3 text-[13px] font-bold text-gray-700` | Y ★ |
| Segment rows | `.../route-preview/RouteDetailSheet.tsx:752-937` | הליכה למסלול / המסלול / סיום — turn-by-turn | `bg-gray-50 rounded-lg px-4 py-3`; emoji + text | Y |
| Circular-route label | `.../RouteCarousel.tsx:1020-1141` | "מסלול מעגלי חוזר אליך" / "סיבוב מעגלי" | text-only | Y |
| **Feature/facility chips** | `.../RouteDetailSheet.tsx:863-1003` | סלול / עירוני / מואר / גינת כושר | `px-3 py-1 bg-gray-100 rounded-full text-[11px] font-bold text-gray-600` | Y ★ |
| **`IconChip`** (shared pill) | `src/features/parks/client/components/park-detail/IconChip.tsx:46` | Reusable amenity pill: icon/emoji + label | `bg-white shadow-sm rounded-lg px-3` h30 `border-[0.5px] #E0E9FF` | Y ★★ |

★ = load-bearing for the hybrid. ★★ = the single most-reused primitive (chip).

---

## B. Real Design Tokens (from `tailwind.config.ts` + `globals.css`)

**Font** — `'Simpler Pro', Heebo, sans-serif` (`tailwind.config.ts:50`). OTF weights 400/600/700 in `src/app/fonts/`. Fallback stack documented: `Assistant, Rubik, Arial Hebrew`. RTL: line-height 1.6, letter-spacing 0.01em.

**Icon library (actual)** — `lucide-react`, **~497 imports, 0 Tabler, 0 react-icons**. Custom SVGs for muscles (`/icons/muscles/*.svg`), equipment, and `Bolt.svg`.
> ⚠️ The mockup uses **Tabler** (per brief) as a *stand-in* for lucide — shapes match 1:1 (run, barbell, bolt, clock, flame, refresh, map-pin). If ever productionized, swap Tabler→lucide names.

**Radius** (`tailwind.config.ts:42-46`) — lg `10px` · xl `12px` · **2xl `14px`** (cards) · 3xl `20px` (sheets) · 4xl `28px`. Drawers use `rounded-t-[32px]`.

**Color tokens:**
| Role | Hex | Source |
|---|---|---|
| primary cyan | `#00dcd0` | `tailwind.config.ts:17` |
| out-cyan (running) | `#00ADEF` | `tailwind.config.ts:24` |
| bright cyan / map line | `#00E5FF` | AppMap line-color |
| CTA gradient | `#0CF2E3 → #00BAF7` | RunBriefingDrawer:525 |
| **aerobic green (easy/recovery)** | `#4CAF50` / `#10B981` | running zone palette / emerald success |
| aerobic long-run (deep green) | `#2E7D32` | running zone palette |
| **strength amber (effort/tempo)** | `#F59E0B` | effort chip / surface-road |
| hard red / max | `#EF4444` / `#DC2626` | effort colors |
| card bg / screen bg | `#ffffff` / `#f5f5f7` | `tailwind.config.ts:25-26` |
| pill border | `0.5px solid #E0E9FF` | `IconChip` `PILL_BORDER` |
| effort badge | `text-amber-600 bg-amber-50 rounded-full` | `RunBlockBriefingCard:54` |

**Shadows** — card `0 2px 12px rgba(0,0,0,.04)` · drawer `0 -4px 24px rgba(0,0,0,.08)` · sheet uses `shadow-2xl`. **Interaction** — `active:scale-[0.97]` on CTAs.

> Note: the **live** app codes both running AND walking in **cyan** (`#00ADEF`). The green/amber
> modality split is a **hybrid-only convention** (see §D-2) — the tokens exist, the *pairing* is new.

---

## C. Lego Map — every hybrid part ← an existing brick

| Hybrid part | Reuse | Source file:line | Adaptation |
|---|---|---|---|
| **Hero map** (route + station pins) | `AppMap` GeoJSON line + `Marker` | `AppMap.tsx:115` | recolor route line per-segment (green legs), add numbered amber station markers |
| **Summary chips** (distance/time/kcal/volume) | Distance/Time/Kcal chips + `IconChip` | `BottomJourneyContainer.tsx:316`, `IconChip.tsx:46` | add a 4th "N תרגילים" amber chip |
| **Intensity/pace glance** | Intensity graph "תקציר קצבים" | `RunBriefingDrawer.tsx:425` | optional; color bars green (run) / amber (station) |
| **Metadata row** (bolts + duration) | `DifficultyBolts` + Duration pill | `DifficultyBolts.tsx:68`, `RunBriefingDrawer.tsx:394` | unchanged |
| **Run-leg card** (green node) | `RunBlockBriefingCard` | `RunBlockBriefingCard.tsx:21` | left bar → green; meta = distance + pace |
| **Strength-station block** (amber node) | `SectionHeader` ("סופר סט Nx") + `ExerciseCard`×N + `SwapIcon` | `SectionHeader.tsx:43`, `ExerciseCard.tsx:34`, `SwapIcon.tsx:16` | header + bar → amber; a mini section |
| **Section grouping logic** | `groupExercisesIntoSections()` | `section-grouping.utils.ts` | reuse to build each station's superset/regular set |
| **Facility/feature chips** | Feature chips / `IconChip` | `RouteDetailSheet.tsx:863` | עירוני/סלול/מואר on the run legs |
| **"X מטר עד ההתחלה" row** | Walk-to-route row | `BottomJourneyContainer.tsx:335` | unchanged (approach leg) |
| **Circular-route note** | Circular-route label | `RouteCarousel.tsx:1020` | "מסלול מעגלי — חוזר לנקודת ההתחלה" |
| **CTA** "התחל אימון" | Sticky GO / `DrawerFooter` / `StickyActionButton` | `RunBriefingDrawer.tsx:522`, `StickyActionButton.tsx` | unchanged gradient |
| **Sheet frame** | `rounded-t-[32px]` drawer skeleton | any of the 3 drawers | unchanged |

**Net:** ~90% of the hybrid page is direct reuse. Only the axis (below) is new.

---

## D. Gaps — what has NO existing brick

**D-1. Vertical mixed-modality axis ("מהלך האימון") — THE one real gap.**
The closest existing thing is `RunStoryBar` (`RunStoryBar.tsx:14`), but it is (a) **horizontal**, (b)
**single-modality** (running blocks only), (c) a thin progress bar, not a content spine. There is **no
component** that renders a **vertical timeline alternating run-leg ↔ strength-station nodes**.
→ **Proposed minimal component:** `HybridJourneyAxis` — a vertical spine (dashed connector, reuse
`.dashed-line` `globals.css:323`) with circular step nodes; each node hosts either a `RunBlockBriefingCard`
(green) or a station block (`SectionHeader`+`ExerciseCard`s, amber). Pure composition — no new tokens.
Props: `nodes: Array<{ kind:'run'|'station', … }>`. ~1 presentational component, zero engine change.

**D-2. Modality color-coding (green=aerobic / amber=strength).**
Neither surface distinguishes modality by hue — both are cyan. The hybrid needs a **2-color legend** so a
user parses "green stripe = keep moving, amber stripe = stop & train" at a glance. Tokens already exist
(`#10B981`/`#4CAF50` green, `#F59E0B` amber) — only the **convention** is new. Recommend a tiny shared
`MODALITY = { aerobic:'#10B981', strength:'#F59E0B' }` map + a one-line legend chip pair.

**D-3. Station marker on the route polyline.**
`AppMap` renders the line + park pins, but not **numbered station markers positioned at the strength
points along the loop**. → reuse `<Marker>` with a small **amber numbered pin** (new marker sprite only).

**D-4. Run↔station transition connector.**
The moment "רצת 1.2 ק״מ → תחנה 2" has no visual. → a small connector node on the axis (a dot + "→ תחנה"
label). Trivial; part of `HybridJourneyAxis`.

**D-5. Combined summary header (run distance + set volume + total time + kcal in one row).**
Each surface has its own chip row; combining aerobic + strength totals is a **new composition** but 100%
reuse of the chip primitive + one amber "N תרגילים" chip.

**MVP scope = the sandwich:** run-leg → 1 strength-station → run-leg. One `HybridJourneyAxis` with 3
nodes, one map hero, one chip row, one CTA. Everything else is post-MVP.

---

## E. Mockup — multi-frame gallery

Built at **`.claude/previews/hybrid-workout-overview.html`** — RTL phone frames, Heebo/Simpler-Pro,
Tabler icons, green aerobic + amber strength, vertical "מהלך האימון" axis. Now a **gallery of 11 frames**
(verified via headless-Chrome render):

- **A · three availability tiers (core):** A1 nearby-park → sandwich loop · A2 far-park → run-to-park
  (one long leg → station, point-to-point, no circular return) · A3 no-park → bodyweight (all-aerobic +
  ground set, **no map station node**). Same bricks, different composition.
- **B · interaction:** B1 accordion (blocks collapsed by default, `ArrowDownCircle` pattern from the real
  warmup header) · B2 horizontal scroll-synced strip (BottomJourneyContainer variant — alternative, not replacement).
- **C · edge cases:** C1 long exercise names (RTL `truncate` vs `line-clamp:2`) · C2a/C2b slider edges
  70/30 vs 30/70 (card composition shifts) · C3 exercise swap (spin + "הוחלף") · C4 loading skeleton · C5 weak GPS.

**Precision decisions applied (per David):** ① color bar moved to the card's **right edge** (vertical strip,
matches `WorkoutCardWrapper`'s `absolute top-0 right-0 bottom-0 w-1`). ② station = real strength layout —
"🔗 סופר סט" right + "3x סבבים" **gray text** left (`SectionHeader`), white exercise cards (image right / swap
left), **one** vertical grouping bar on the right, **no** extra card-bar on the station (avoids collision).
③ chips = white + thin border + shadow (`IconChip`).

**Superset-bar color decision (open question resolved):** in the standalone strength screen the superset bar
is **cyan** (there, everything is strength, so cyan = "primary/active"). In the hybrid, **color carries
modality**, so the bar is **amber** — a cyan bar inside an amber node would introduce a third color and break
the green/amber legend. Rule: **structural/modality chrome follows green/amber; cyan is reserved for
modality-neutral micro-states** (swap-active, goal ring, the Start CTA). This is a deliberate divergence from
the strength screen.
