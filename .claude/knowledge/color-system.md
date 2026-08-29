# OUT — Color System Map & Source-of-Truth Plan

> **Status:** READ-ONLY audit (no code changed). Reference doc for the color/design-token consolidation.
> **Purpose:** single place that (a) records where every workout color lives today, (b) logs decisions, (c) defines the target token structure so a future color change = one edit.
> Keep this file updated whenever a color decision is made.

---

## 0. TL;DR
- There is **no design-token source of truth**. ~3006 hard-coded hex, ~292 unique values in `src`. Team already flagged it (`tailwind.config.ts:22` comment; `design-language.md` marks status colors as ⚠️ PLACEHOLDER "to unify").
- **Strength = cyan everywhere in the app — EXCEPT the hybrid drawer, where it is orange.** The orange is the outlier, not the blue.
- Different strength **programs** all share **one** color (they collapse to a single `strength` category; differ only by icon + Hebrew label).
- Many colors are duplicated across 2–3 files (hybrid `AER`/`STR`; running sub-categories; strength in 3 different cyans).

---

## 1. Brand palette (the anchor)
From logo `logotype2.png` + `tailwind.config.ts` tokens.

| Token | Hex | Notes |
|---|---|---|
| `out-cyan` | `#00ADEF` | "our blue" / primary accent |
| `out-blue` | `#007aff` | |
| `primary` (teal) | `#00dcd0` | |
| `secondary` (red) | `#ea1d24` | |
| logo mints/greens | teal/mint + emerald green | in-brand cool family |
| neutral | light grey / off-white | |

**Logo family = blues + mint/teal + emerald green + neutral grey. No orange in the brand palette.**

---

## 2. Full color map by domain (current state)

### 2.1 Running / Aerobic
**Zone → color map** (the only real one; LOCAL to admin, not shared) — `src/app/admin/running/import/clean-upload-fartlek/page.tsx:22-34`

| zone | hex | zone | hex |
|---|---|---|---|
| sprint | `#DC2626` | tempo | `#9C27B0` |
| interval_short | `#E11D48` | easy / easy_run | `#4CAF50` |
| interval_long | `#0D9488` | long_run | `#2E7D32` |
| fartlek_medium | `#CE93D8` | recovery | `#B0BEC5` |
| fartlek_fast | `#AB47BC` | walk `#90A4AE` / jogging `#78909C` | |

**Live player (not zone-keyed):**
- effort: moderate `#F59E0B` / hard `#EF4444` / max `#DC2626` — `PaceGauge.tsx:33` **+ duplicated** `BlockCountdownPanel:285`
- pace-status: on_target `#10B981` / slow `#EF4444` / fast `#F59E0B` / idle `#9CA3AF` — `usePlannedRunEngine:45`
- per-block: `block.colorHex` from data (fallback `#00ADEF`)
- `pace-map-config.ts` — **no colors** (percentages only)
- admin palette array: `['#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#06B6D4']`

### 2.2 Strength
Generic accent — **cyan family, 3 competing values:**

| hex | role | source |
|---|---|---|
| `#00C9F2` (BRAND_CYAN) | program icons + category strength | `program-icon.util.tsx:17` · `day-display.utils.tsx:186` · `AgendaDayCard:107` |
| `#06B6D4` | `ACTIVITY_COLORS.strength` (rings/schedule) | `activity.types.ts:55` |
| `#00BAF7` (+`#0CF2E3`/`#00AEEF`) | live runner (active set/gradient); `#FF8A00` rest | `players/strength/playlist/*` |

- `DifficultyBolts.tsx:47` — no hex; black SVG → cyan via CSS filter.
- **Different strength programs → SAME color.** All collapse to one `'strength'` category (`day-display.utils:80-95`, `program-icon.util:132`); differ only by icon + Hebrew label (עליון/מתח/שלם/רגליים/ליבה).
- Exercise drawer preview: superset = cyan (`text-cyan-500/600`, `SectionHeader:104`), card border `#E0E9FF`, slate headers. No orange/green in the drawer.

### 2.3 Hybrid (combined)
| element | hex | source |
|---|---|---|
| aerobic leg | `#10B981` green (`AER`) | `HybridJourneyAxis:20` · `Overview:27` |
| strength leg | `#F59E0B` orange (`STR`) | `HybridJourneyAxis:21` · `Overview:27` |
| accent / CTA | `#00ADEF` (`ACCENT`) | `Overview:26` |

### 2.4 Schedule / Agenda
- `ACTIVITY_COLORS` (`activity.types.ts:55`): strength `#06B6D4` · cardio `#84CC16` (lime) · maintenance `#A855F7` (purple)
- `day-display.utils.tsx:186-200`: strength `#00C9F2` · cardio `#84CC16` · maintenance `#A855F7` · steps `#F97316` · rest/missed `#9CA3AF` · bonus `#A855F7`
- running sub-categories (**duplicated** in `day-display` + `AgendaDayCard` + `SmartWeeklySchedule`): easy_run `#4CAF50`, long_run `#2E7D32`, short_intervals `#E11D48`, long_intervals `#0D9488`, tempo `#9C27B0`, hill_long `#FF7043`, strides `#00BAF7`, recovery `#B0BEC5`
- misc: `MonthlyCalendarGrid` workout-day `#14B8A6` · `ScheduleCalendar` today `#00E5FF` · `activity-icon.ts` strength `#00BAF7` / running `#22D3EE` / walking `#34D399` / cycling `#F59E0B`

---

## 3. Cross-domain findings
- **Strength modality:** cyan everywhere (`#00C9F2` / `#06B6D4` / `#00BAF7`) except **hybrid = orange `#F59E0B`**. → hybrid orange is the outlier.
- **Aerobic/cardio has two greens:** hybrid = emerald `#10B981`; schedule = lime `#84CC16`. **Conflict to resolve.**
- **Strength has ≥3 cyans** (`#00C9F2` / `#06B6D4` / `#00BAF7`). **Conflict to resolve.**
- **No source of truth.** `tailwind.config.ts` has ~7 tokens; the rest is hard-coded/inline and duplicated.

### 3.1 NEW (2026-08-27) — the duplication has already produced drift
§2.4 notes the running sub-category map is "duplicated in `day-display` + `AgendaDayCard` + `SmartWeeklySchedule`". Verified: **three copies, two different versions.**

| key | `SmartWeeklySchedule.tsx:211-214` | `AgendaDayCard.tsx:250-253` | `day-display.utils.tsx:217-219` |
|---|---|---|---|
| `hill_short` | `#EF6C00` | `#EF6C00` | **`#FF7043`** |
| `hill_sprints` | `#DC2626` | `#DC2626` | **`#FF7043`** |
| `strides` | `#00BAF7` | `#00BAF7` | **`#FF7043`** |

In the third copy all hills **and** strides collapsed to one value. This is no longer a duplication *risk* — the drift happened.

**Two more findings from the same pass:**

1. **`walking` is emerald everywhere except one file.** `#10B981` in `COMMUNITY_CATEGORY_COLORS` (`day-display.utils.tsx:230`), and emerald gradients in `GroupCard.tsx:10`, `GroupDetailsDrawer.tsx:61`, `CreatorManagementDrawer.tsx:22`, `join/[inviteCode]/page.tsx:16`, `CommunityCircles.tsx:13` (`from-green-400 to-emerald-500`), `RoutePicker.tsx:43` (`text-emerald-500`), `safecity/activity-icon.ts:12` (`#34D399`). **The lone outlier is `AgendaDayCard.tsx:232` — `walking: '#F59E0B'` orange.** One against seven; reads as a bug, not a decision.

2. **The community world and the training world invert each other.**

   | | community (`COMMUNITY_CATEGORY_COLORS`) | personal training (`CATEGORY_COLORS`) |
   |---|---|---|
   | walking | 🟢 `#10B981` | 🟠 `#F59E0B` (`AgendaDayCard`) |
   | running / cardio | 🟠 `#F97316` | 🟢 `#84CC16` |
   | calisthenics / strength | 🔵 `#06B6D4` | 🔵 `#00C9F2` |

   Running is orange in one and green in the other; walking is the reverse. Only the cyan agrees. This is the practical reason "just pick the right green" is not currently answerable — see §5 open decision 2.

---

## 4. Decisions log
| date | decision | rationale | status |
|---|---|---|---|
| 2026-07-17 | Hybrid strength `#F59E0B` orange → **cyan `#00C9F2`** (BRAND_CYAN, match app) | Strength = cyan across the whole app; orange was the lone outlier. Chose `#00C9F2` (BRAND_CYAN), not `#00ADEF`, so it doesn't blend with the ACCENT/CTA. **Screenshot confirmed:** strength↔aerobic-green `#10B981` distinction is sharp, and proximity to the `#00ADEF` accent is acceptable (not adjacent; different role/shape). Tint/text also moved to the cyan family: `STR_TINT #FFFBEB→#ECFEFF`, `STR_TEXT #B45309→#0E7490` (same hue as STR), and the overview "כוח" text `#B45309→#0E7490`. **Applies to ALL hybrid strength (full-park + budget-split — both were orange outliers).** The A3/fallback warning banner stays amber (it's a warning, not strength). | ✅ **confirmed & committed** — `fix(hybrid): strength color orange→cyan #00C9F2` (HybridJourneyAxis + HybridOverviewScreen; unpushed). |
| 2026-07-25 | Tabata live-player countdown surfaces: **work number `#22D3EE`** (bright cyan), **rest number `#93C5FD`** (soft blue), prep stays white | Tabata work/rest use one shared big-number overlay (`PreparingStateView`, variant-driven) over the exercise video; David asked for a separate work↔rest colour. Kept both inside the **strength=cyan** family (value/shade distinction, not a new hue) to avoid clashing with aerobic-green / hybrid-amber / superset-violet: work = bright cyan (effort), rest = desaturated blue (recovery). `VARIANT_NUMBER_COLOR` in `PreparingStateView.tsx`. ⚠️ picked on-code, **not yet screenshot/device-confirmed** — contrast on the blurred-dark backdrop pending David's device smoke. | ⏳ **built on `feat/protocol-blocks`, awaiting device confirmation** (commit `b03a99e` + Steps R/W). |
| 2026-08-15 | **Route-line modality colors** (map, not schedule/agenda): aerobic (walking/running/cycling routes) = `#10B981` emerald (= `HYBRID_AER`, unchanged). Strength (`activityType==='workout'` routes) = `#06B6D4` deep cyan. **`HYBRID_STR` moved `#00C9F2`→`#06B6D4`** — the lighter cyan washed out on the light Mapbox basemap; deeper value reads clearly through the white line casing. Standalone route line and hybrid's gradient strength band now share the one value. Route-scope only (`AppMap.tsx`/`hybrid-colors.ts`/`mapLayersConfig.ts`) — did NOT touch schedule/agenda/program-icon strength cyans (`#00C9F2` program icons, `#06B6D4` ACTIVITY_COLORS.strength — now coincidentally matches the new route color, `#00BAF7` live strength-runner) or the 3 fragmented walking/running/cycling activity-badge maps found in a separate audit (`activity-icon.ts`, `COMMUNITY_CATEGORY_COLORS`, `AgendaDayCard`'s `CATEGORY_ACCENT`) — explicitly out of scope, no full app-wide migration this pass. | ✅ **shipped** — `feat(routes): combined route-styling batch` (main, unpushed at write time). |

| 2026-08-27 | **Remove the "shared day" purple from the registration running-day picker.** `RunningScheduleStep.tsx:347-391` paints a day holding BOTH strength and running with `bg-purple-500`, plus a legend entry `{ color:'bg-purple-500', label:'שניהם' }`, and the copy at `:227-228` advertises it ("ימים משותפים יוצגו בסגול"). **Decision: delete the third state.** A selected running day takes the aerobic color like any other running day; existing strength on that day shows as a *separate* mark beside it, never a blended color. **Interim value: `#10B981` emerald** — David's call, matching the walking community-group cards he identifies with outdoor activity (see §3.1), and — notably — **already equal to `HYBRID_AER` and to the map's aerobic route color** (2026-08-15 row). Treat that convergence as *evidence for* resolving §5 open decision 2 in favour of emerald; it is **not** that decision — schedule/agenda surfaces still use lime `#84CC16` and were not touched. Rationale for deleting rather than recoloring: (a) `#A855F7` already means `maintenance`/תחזוקה (`day-display.utils.tsx:188`, `AgendaDayCard.tsx:231`) and sits beside `tempo #9C27B0` / `fartlek_structured #AB47BC`; (b) more fundamentally **a "shared day" is not a modality** — it is two entries in one day, which `AgendaDayCard.tsx:975` (`trainingEntries`, one card per entry) and `SmartWeeklySchedule.tsx:1292-1302` (Stage H, alternating icon+dots) already render correctly. `isShared` models the *day* as a third type; that is the same modeling error as gap-map finding #9 in the data layer, where `recurringTemplate[day]` gets its array replaced because the code assumes a day has one owner. Same mistake, once in pixels and once in data — fix them together. New copy: *"ימי הכוח שלך (ב׳, ד׳) מסומנים בכחול. אפשר לבחור בהם גם ריצה — שני האימונים יופיעו באותו יום בלוז."* | ✅ **built 29.08.2026** — `isShared`/`bg-purple-500`/the "שניהם" legend entry removed from `RunningScheduleStep.tsx`; running days now render `#10B981` unconditionally (button + legend swatch), the strength "כ" dot shows regardless of whether the day is also a running day, copy updated verbatim as decided. Branch `fix/gap-map-finding-9-merge`, own commit, separate from the data-layer fix above — reviewed, not yet pushed. Note: this is a UI-consistency fix only — gap-map #5 (`AgendaDayCard.tsx`'s own running/strength mutual-exclusivity in the actual agenda render) is untouched and still open, see that finding's updated entry. |

_(Open: which green for aerobic/cardio outside the map — emerald `#10B981` (now also the map's aerobic route color) vs lime `#84CC16` (`ACTIVITY_COLORS.cardio`, schedule rings) — still unresolved for schedule/agenda surfaces. Strength cyan: route line + hybrid gradient now both `#06B6D4` (2026-08-15); `#00C9F2` (program icons/category strength) and `#00BAF7` (live strength-runner) remain separate, unmigrated values — §5's "which ONE cyan" is still open for those two. The 3 fragmented walking/running/cycling ACTIVITY maps (presence badges, community-group branding, schedule pills) are a newly-found separate fragmentation, not yet addressed — see §5 note. **2026-08-27 update:** that fragmentation is now mapped in §3.1, including confirmed drift across the three running-sub-category copies, the lone `walking` orange in `AgendaDayCard.tsx:232`, and the community↔training inversion. Still deliberately NOT being fixed — `AgendaDayCard.tsx` / `day-display.utils.tsx` / `home/page.tsx` are hot files under active concurrent work, and decisions 1–3 below are David's brand calls, not an implementer's.)_

---

## 5. Target: single source of truth (proposal — NOT yet executed)
Create ONE tokens file (e.g. extend `tailwind.config.ts` / a `theme/tokens.ts`) with **semantic** tokens. Everything else imports from it.

```
brand.cyan      = #00ADEF   // out-cyan (accent/CTA)
brand.blue      = #007aff
brand.teal      = #00dcd0
brand.red       = #ea1d24

modality.strength = <ONE cyan — decide: #00C9F2 | #06B6D4>
modality.aerobic  = <ONE green — decide: #10B981 emerald | #84CC16 lime>

status.success   = #10B981
status.warn      = #F59E0B
status.error     = #EF4444
status.idle      = #9CA3AF

running.zones = { sprint:#DC2626, interval_short:#E11D48, interval_long:#0D9488,
                  fartlek_medium:#CE93D8, fartlek_fast:#AB47BC, tempo:#9C27B0,
                  easy:#4CAF50, long_run:#2E7D32, recovery:#B0BEC5, walk:#90A4AE }
```

**Open decisions before consolidation:**
1. strength = which cyan? (keep `modality.strength` distinct from `brand.cyan #00ADEF` so it doesn't blend with accent/CTA)
2. aerobic/cardio = emerald or lime? (pick one, use everywhere)
3. do strength programs stay same-color, or get per-program tint? (currently same — confirm intended)

**Migration = separate scoped project.** Do NOT bundle into the drawer/video PR.

---

## 6. How to change a color in the future
- **Today (before consolidation):** a color is hard-coded in multiple files. To change it you must update every source listed in §2 (grep the hex). This doc lists them so nothing is missed.
- **After consolidation (§5):** change the semantic token in ONE place; it propagates everywhere.
- Whenever you make a change, add a row to **§4 Decisions log**.
