# Parks + Admin Panel + Park-Workout Flow — Investigation Findings

**Date:** 10.09.2026
**Scope:** Read-only investigation/mapping only. No code was changed. All citations below were verified by reading the actual files (not inferred from names) by 5 parallel research agents, one per cluster.

---

## Headline finding

**D0 — the "Start Workout" button on a park's detail sheet is a confirmed dead no-op in production today.** Tapping it just closes the sheet; nothing else happens. This is not a design gap, it's a wiring bug that's been present since the component's original commit. It blocks every downstream item in section D and is the single most consequential finding in this audit — see D0 below.

---

## A. Admin panel — image bugs/gaps

### A1. Park image doesn't render back in the edit form — **[BUG]** — effort **S**

Root cause: a field-name mismatch between the writer and the reader, compounded by a second silent-drop bug in the update path.

- **Save path:** [`src/features/admin/components/parks/ParkForm.tsx:449-464`](src/features/admin/components/parks/ParkForm.tsx#L449-L464) writes `image` and `images` — **never `imageUrl`**.
- **Update whitelist bug:** [`src/features/admin/services/parks.service.ts:183-204`](src/features/admin/services/parks.service.ts#L183-L204) — `updatePark`'s field whitelist omits `images` (plural) entirely, so the array is silently dropped on every edit-save regardless of what the form sends.
- **Load/hydrate path:** [`ParkForm.tsx:147-163`](src/features/admin/components/parks/ParkForm.tsx#L147-L163) — `defaultValues` only reads `initialData.image`/`initialData.images`, never `initialData.imageUrl`.
- **Why this exactly matches the bug report:** [`scripts/migrate-park-photos.ts:241-245`](scripts/migrate-park-photos.ts#L241-L245) already migrated **569 parks** from FTP → Bunny, writing exclusively to `imageUrl`. The mobile app shows these correctly (it resolves `imageUrl` first — see A2's `park-image.ts`). The admin form never looks at that field, so the editor shows empty for all 569.
- **Fix:** add `imageUrl` read-priority to `ParkForm.tsx` defaultValues + image-gallery `watch`, and add `images`/`imageUrl` to the `updatePark` whitelist. Small blast radius. Must respect the `.claude/rules/exercise-editor-conventions.md` null-vs-undefined convention when testing the clear/gallery-remove path.

### A2. Parks list shows a facility image; imported parks/images invisible in panel — **[BUG]** + **[INFRA]** — effort **XS–S** (list bug) / **M** (import fallback decision) / **L** (Bunny-orphan reconciliation)

- **Canonical model already exists and documents this exact problem:** [`src/lib/park-image.ts:1-33`](src/lib/park-image.ts#L1-L33) — priority `imageUrl` (new, Bunny) → `image`/`images[0]` (legacy, Firebase Storage, "sometimes back-filled with a generic equipment shot"). **This resolver is used on every mobile surface but is never imported anywhere in the admin panel** — that single fact drives both A1 and this item.
- **List bug:** [`src/app/admin/parks/page.tsx:212-216`](src/app/admin/parks/page.tsx#L212-L216) only checks `park.image`, never `park.imageUrl` — any of the 569 migrated parks shows a generic pin icon instead of its real photo.
- **Reversed-priority bug (separate instance):** [`src/features/admin/components/parks/ParkDetailDrawer.tsx:77-78`](src/features/admin/components/parks/ParkDetailDrawer.tsx#L77-L78) checks `image` **before** `imageUrl` — backwards from the documented canonical order. Used by 4 other admin pages (authority locations, route edit, reports, `ApprovalDetailModal`).
- **Confirmed mechanism for "shows a facility image instead of the park's own":** [`src/features/admin/services/park-import.service.ts:954-959`](src/features/admin/services/park-import.service.ts#L954-L959) — the legacy CSV bulk-importer, when a park has no image of its own, back-fills its `images` array with its linked gym-equipment images as a last resort; [`:1396`](src/features/admin/services/park-import.service.ts#L1396) then promotes that into the park's singular `image` field. This is real, intentional (if surprising) legacy logic — not the deprecated `ParkFacility.image` type (confirmed dead: every writer sets `facilities: []` unconditionally).
- **Why imported parks/images don't appear:** Not a list-query bug — `getAllParks()` has no filter that would exclude them. Two real causes instead: (1) [`migrate-park-photos.ts:216-225`](scripts/migrate-park-photos.ts#L216-L225) — rows whose `old_parkid` doesn't resolve to a Firestore doc are marked `failed` and skipped *before* the Bunny upload runs, so they never reach Bunny either. (2) **Architecturally guaranteed invisibility for genuine Bunny-only orphans**: no code anywhere lists/browses the Bunny bucket (only `PUT` calls found, never `GET`-list); `/admin/media-library` is a 9-line re-export of `ContentStatusPage`, not a bucket browser. Every reader in the codebase reads a URL from a Firestore field — a file that landed in Bunny without a Firestore write is invisible to the panel by design.
- **Slow loads:** [`src/lib/bunny-image.ts`](src/lib/bunny-image.ts) only appends a resize `?width=` param when the URL contains `b-cdn.net` — Firebase-Storage-hosted images (which is where every admin-panel upload goes, see A3) get zero resizing, full-resolution passthrough.

### A3. Confusing multi-step image upload flow — **[UX]** — effort **S** (quick fix) / **M** (full redesign)

Confirmed 3-step chain, all in [`src/features/admin/components/MediaLibraryModal.tsx`](src/features/admin/components/MediaLibraryModal.tsx) (opened from `ParkForm.tsx:1119`):

1. **Upload → repository:** `handleUpload()`/`handleBulkUpload()` ([`:712-762`](src/features/admin/components/MediaLibraryModal.tsx#L712-L762), [`:663-710`](src/features/admin/components/MediaLibraryModal.tsx#L663-L710)) call `uploadMediaAsset()` in [`src/features/admin/services/media-assets.service.ts:107-168`](src/features/admin/services/media-assets.service.ts#L107-L168) — uploads to Firebase Storage + writes a doc to a genuinely separate, reusable `mediaAssets` collection. **Does not call `onSelect`.**
2. **Choose again:** `handleSelect(asset)` ([`:764-767`](src/features/admin/components/MediaLibraryModal.tsx#L764-L767)) is the only thing that calls `onSelect` and closes the modal — a real second click is structurally required.
3. **Save officially:** `ParkForm.tsx`'s `onSelect` ([`:1122-1126`](src/features/admin/components/parks/ParkForm.tsx#L1122-L1126)) only does local React-Hook-Form state (`setValue('images', ...)`) — nothing persists until the admin clicks the top-level Save button.
- Note: no `confirm()`/dialog was found anywhere on this upload/select path (only on delete) — the "tiny confirm dialog" mentioned in the task wasn't located; flagged as unconfirmed rather than guessed.
- **Fix (S):** auto-call `onSelect` from `handleUpload`'s success path so upload = attach in one step, or add an inline hint explaining step 1 is "added to shared library."

### A4. No "דגשים" (cues) field on facility edit — **[FEATURE-needs-design]** — effort **S–M**

- **Admin form has no such field, confirmed by full field inventory:** [`src/features/content/equipment/gym/admin/GymEquipmentEditorForm.tsx`](src/features/content/equipment/gym/admin/GymEquipmentEditorForm.tsx) (822 lines) — name, icon, exercise type, level, functional toggle, primary/secondary muscle, target programs, locations, brands. No cues field. Type confirms it too: [`gym-equipment.types.ts:22-45`](src/features/content/equipment/gym/core/gym-equipment.types.ts#L22-L45).
- **Correction to the task's framing — the app's cues are NOT pulled from a separate admin-adjacent source.** They're a **hardcoded static Hebrew lookup table keyed by muscle group**, with the code itself documenting the gap: [`EquipmentDetailDrawer.tsx:236-245`](src/features/parks/client/components/equipment-detail/EquipmentDetailDrawer.tsx#L236-L245) ("if/when the admin form gains a `cues`/`highlights` field... the resolver will prefer those persisted strings"), table at [`:247-304`](src/features/parks/client/components/equipment-detail/EquipmentDetailDrawer.tsx#L247-L304), resolver `deriveAutoCues()` at [`:306-315`](src/features/parks/client/components/equipment-detail/EquipmentDetailDrawer.tsx#L306-L315) — it never reads a Firestore field at all today.
- **What it would take:** (1) add `cues?: string[]` to `GymEquipment` type, mirroring the `secondaryMuscles` pattern; (2) add a repeatable text-list control to the admin form (in-repo precedent: the exercise editor's `specificCues` field, `src/app/admin/exercises/[id]/page.tsx:104`); (3) update the drawer's `cues` memo to prefer `equipment.cues` and fall back to `deriveAutoCues` for legacy docs — exactly what the existing comments anticipate; (4) clear/deselect must send `[]` never `undefined` per the exercise-editor-conventions rule.
- Design question, not pure plumbing: free-text lines vs. tag-chips vs. per-muscle suggested defaults.

---

## B. Park page (app) — UX

**Verification note:** two components matched "park drawer" by name. `src/features/parks/client/components/park-drawer/index.tsx` is exported but **never imported anywhere** — dead code, ignore it. The real, live component for all of B1–B4 is **`ParkDetailSheet.tsx`** (confirmed via 2 real mount points: `GlobalDetailOverlay.tsx:48` and `park-preview/index.tsx:184`).

### B1. Drawer opens at 2 sizes — **[UX]** — effort **S** (not a true one-liner)

- [`ParkDetailSheet.tsx:38-40`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L38-L40) — `DRAWER_HEIGHT = '92vh'` is constant; the "smaller size" isn't a different height, it's a Framer Motion `y`-offset (`PEEK_Y_PX ≈ 7vh from top`, i.e. ~85vh visible). No formal snap-points library is used anywhere in the repo (grepped, zero hits) — this is hand-rolled.
- Opens at peek by default: line 524, `animate={{ y: PEEK_Y_PX }}`.
- **Not a one-line change:** two more spots also snap back to peek and must move in tandem or the sheet will visibly spring back down on any drag/scroll-chain gesture — `handleDragEnd`'s default branch ([`:467`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L467)) and the scroll-chain gesture's `snapBackY` ([`:125`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L125)).
- Requires on-device verification per the repo's "measure, don't guess" rule (gesture-physics code).

### B2. Edit-park button too close to "start workout" — **[UX]** — effort **XS**

[`ParkDetailSheet.tsx:1017-1052`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L1017-L1052) — confirmed real. All three buttons (Start Workout, Pencil/"עדכן פרטים", Navigate) sit in **one flex row with a single uniform `gap-2` (8px)** applied to every adjacent pair — Start-to-Edit gets the same spacing as Edit-to-Navigate. Note: the "edit" button here is the user-facing `SuggestEditSheet` trigger (`title="עדכן פרטים"`), not an admin park-edit. Fix: widen the shared gap, or give Start Workout its own `me-2`/`ms-2` margin if only that one pairing should change.

### B3. "Start workout" row + button sizing — **[INFRA]** (descriptive only, not itself a bug) — effort **XS** for a size tweak

Same row as B2. Row is plain `flex items-center gap-2`, no explicit size. Button: `flex-1` (width fills remaining space after the two fixed 44px icon buttons) + inline `style={{ height: 44 }}` (not a Tailwind class). Bare hand-written `<button>`, not a shared component — no blast radius elsewhere in the codebase.

### B4. Section titles render gray on mobile — **[BUG]** — effort **XS**

Confirmed real bug with a precise root cause, and **broader than reported** — affects 5 section headers, not 2:
- [`ParkDetailSheet.tsx:653`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L653) "מתאמנים", [`:857`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L857) "פירוט על הפארק", plus `:902` "מתקנים", `:930` "תמונות", `:990` "ביקורות" — **none** of the 5 `<h3>`s have any text-color class, unlike the file's two `<h1>`s which explicitly set `text-gray-900 dark:text-white`.
- **Root cause:** [`tailwind.config.ts:4`](tailwind.config.ts#L4) locks `darkMode: 'manual'` (never toggled) — but [`src/app/globals.css:65-84`](src/app/globals.css#L65-L84) runs an **independent** CSS-variable dark-mode system tied directly to `prefers-color-scheme: dark` (OS-level), setting `--foreground: #ededed` (near-white) regardless of the app's Tailwind lock. On a phone with OS dark mode on (common default), unstyled text inherits near-white `--foreground` against the sheet's still-white `bg-white` (since Tailwind's `dark:bg-*` never fires) → washed-out/gray-looking text. Explains "on mobile" specifically.
- Plain hand-written JSX, not a shared `Section`/`Header` component — zero reuse risk. Fix: add `text-gray-900 dark:text-white` to all 5 `<h3>`s in one pass.

### B5. Facility card (equipment card in park drawer) — **[FEATURE-needs-design]** — effort **S** (swap shown fields) / **M** (header + functional/regular split)

- Component: [`src/features/parks/client/components/equipment-detail/EquipmentCard.tsx`](src/features/parks/client/components/equipment-detail/EquipmentCard.tsx) (129 lines), rendered from [`ParkDetailSheet.tsx:900-924`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L900-L924) under a plain "מתקנים" title (no count today), reused in 3 surfaces (park detail, contribution equipment-picker, approval panel).
- Data source: `GymEquipment` type ([`gym-equipment.types.ts:18-40`](src/features/content/equipment/gym/core/gym-equipment.types.ts#L18-L40)) resolved per-id from `park.gymEquipment`.
- Company name renders at [`EquipmentCard.tsx:97-101`](src/features/parks/client/components/equipment-detail/EquipmentCard.tsx#L97-L101); "סרטון זמין" at [`:102-106`](src/features/parks/client/components/equipment-detail/EquipmentCard.tsx#L102-L106).
- **Good news for redesign cost:** all the data a redesign would want to surface instead (`isFunctional`, `primaryMuscle`, `secondaryMuscles`, `targetPrograms`) is **already fetched and already has rendering logic one tap deeper**, in `EquipmentDetailDrawer.tsx` (opened by tapping the card) — a direct copy source, not new plumbing. `recommendedLevel` exists on the doc but was deliberately removed from display (comment at `EquipmentDetailDrawer.tsx:636`); `type` (reps/time/rest) isn't surfaced anywhere.
- **Do not confuse with:** `FacilityCard.tsx` in the same directory — despite the name, it renders park *amenity* tags (shade/benches/etc.), not gym equipment, and its mobile variant is dead code (only live caller is the admin panel's `ParkDetailDrawer.tsx:139-143`).

### B6. Park card (map popup) — **[UX]** (arrows button) / **[UX]** (icon mismatch) — effort **XS** (remove arrows button) / **S** (chip restyle)

- Component: [`src/features/parks/client/components/park-preview/index.tsx`](src/features/parks/client/components/park-preview/index.tsx) (`ParkPreview`, 196 lines).
- נווט לפארק button: [`:174-183`](src/features/parks/client/components/park-preview/index.tsx#L174-L183), full-width primary CTA.
- **Arrows-on-image button is NOT a nav duplicate or a photo carousel** — confirmed: [`:116-124`](src/features/parks/client/components/park-preview/index.tsx#L116-L124), `aria-label="שנה מיקוד תמונה"` ("change image focus") — each tap cycles the CSS `object-position` of the single hero photo through 5 preset crops. Reads like an internal editorial/re-crop tool exposed on a public user-facing popup by mistake — worth removing per the task's own redesign goal.
- Shade/benches/etc. chips: `CHIP_DEFS` at [`:14-21`](src/features/parks/client/components/park-preview/index.tsx#L14-L21), rendered via Google **Material Icons font ligatures** (`material-icons-round`), capped to first 2 matches.
- **Concrete, confirmed icon-system mismatch — 4 separate systems for the same ~12 amenity tags:**
  1. `ParkPreview` (this component): Material Icons font ligatures.
  2. Park page itself (`ParkDetailSheet`): `IconChip` + `AMENITY_ICON_MAP` ([`amenity-icons.ts:39-64`](src/features/parks/client/components/park-detail/amenity-icons.ts#L39-L64)) — dedicated SVG assets first, `lucide-react` fallback. This looks like the intended long-term system per its own doc comments.
  3. `FacilityCard.tsx` (admin-panel-only, see B5): raw emoji.
  4. Mobile "suggest edit"/"add park" wizard steps (`SuggestEditSheet.tsx:17-31`, `Step2Details.tsx:26-35`): a *different* emoji set with different label wording ("צל" vs "מוצל" vs "הצללה").
  Also different visual shape entirely: `ParkPreview`'s chips are pills (`rounded-full`, gray bg); `IconChip` is a rounded-rect with shadow/border. Fix: standardize on `IconChip`+`AMENITY_ICON_MAP` and point the other 3 at it — the mapping already exists, this is a swap, not new design.

---

## C. Park edit → full facility flow

### C1. Edit-park flow vs. add-park flow — **[FEATURE-needs-design]** — effort **L**

- **Edit entry point:** [`ParkDetailSheet.tsx:1033-1041`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L1033-L1041) (pencil, `title="עדכן פרטים"`) opens [`SuggestEditSheet.tsx`](src/features/parks/client/components/contribution-wizard/SuggestEditSheet.tsx) (216 lines). **Confirmed: edits only `featureTags`, nothing else** — [`:67-75`](src/features/parks/client/components/contribution-wizard/SuggestEditSheet.tsx#L67-L75), `editDiff: { featureTags: selectedTags }` is the *only* field the diff ever contains. Park name, facility type, equipment, photo, description are not editable via this flow at all.
- **Add-park flow:** [`ContributionWizard`](src/features/parks/client/components/contribution-wizard/index.tsx) (262 lines) — 4 steps (location → details → **equipment** [only when `facilityType === 'gym_park'`, uses `EquipmentCard` over the full catalog with search] → photo). Submits `type: 'new_location'`.
- Both flows write to a **pending-approval `UserContribution` queue** ([`contribution.types.ts:19-61`](src/types/contribution.types.ts#L19-L61)), never directly to the `Park` doc.
- **The concrete gap — good news, this is smaller than it looks:**
  1. **The schema already supports a full diff** — `editDiff` is typed `Partial<Park>` ([`contribution.types.ts:45`](src/types/contribution.types.ts#L45)), not just `{featureTags}`. The data model is not the blocker.
  2. `ContributionWizard` is write-only/create-only — no `existingPark` prop, `WizardData` always starts blank, `handleSubmit` hardcodes `type: 'new_location'` with no branch for edit-mode + `linkedParkId`.
  3. **A working precedent for exactly this pattern already exists — in the admin panel.** [`src/features/admin/components/parks/ParkForm.tsx`](src/features/admin/components/parks/ParkForm.tsx) (1134 lines) takes `initialData?: Park | null`, derives `isEditMode`, pre-fills every field including `gymEquipment` and `featureTags`, and branches between `updatePark`/`createPark` at submit. This is the single-form add/edit pattern the task asked about — it exists, just on the admin side (direct Firestore write, no approval queue) rather than the mobile contribution-wizard side.
- **To close the gap:** add `existingPark?: Park` prop to `ContributionWizard`, seed `WizardData` from it (mirrors `ParkForm.tsx:149-160` almost 1:1), resolve `gymEquipment` ids the same way `ParkDetailSheet.tsx:398-411` already does, branch `handleSubmit` on `existingPark` presence (`type: 'suggest_edit'` + `linkedParkId` + a full `Partial<Park>` diff vs. today's `new_location`).
- **Needs a product decision**, not just engineering: keep the light quick-edit sheet alongside a deeper "full edit" entry point? And — unverified, flagged not investigated — does the admin **approval center** correctly render/review a multi-field diff, or does it currently assume `editDiff` is always `{featureTags}`-shaped? Worth checking before building this.

---

## D. Start-workout-in-park (foundation)

### D0. Exactly what happens today — **[BUG]** (the button itself) + **[FEATURE-needs-design]** (everything downstream) — effort **S–M** to wire the button / **L, needs design** for live per-facility tracking

**1. Entry point — confirmed dead in production.** [`ParkDetailSheet.tsx:1025`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L1025): `onClick={() => { onClose(); onStartWorkout?.(); }}` — `onStartWorkout` is an optional prop with no default. **Neither of the component's two real mount points passes it:**
- [`GlobalDetailOverlay.tsx:46-52`](src/features/parks/core/components/GlobalDetailOverlay.tsx#L46-L52) — a code comment at lines 30-35 documents that the *sibling* `RouteDetailSheet`'s identical button had the same bug and **was fixed 04.09.2026**; the park case was never given the equivalent fix.
- [`park-preview/index.tsx:188-192`](src/features/parks/client/components/park-preview/index.tsx#L188-L192).
`git blame` traces this to the original squashed commit (`a5490d3a5`, April 2026) — long-standing, not a recent regression. **Net effect today: tapping "התחל אימון" on a park just closes the sheet.**

**2. What would appear, and whether it's the same as the home drawer.** No park-specific variant exists anywhere — `WorkoutPreviewDrawer`/`WorkoutBuilderSheet`/`UserWorkoutAdjuster` (the home-page generator drawer, [`src/app/home/page.tsx:11,3268`](src/app/home/page.tsx#L3268)) treat `location: 'park'` as just a parameter value, not a different component tree. The already-fixed `RouteDetailSheet` button routes into the same shared generic pipeline — confirming that's the natural target if/when the park button gets wired, not a bespoke park UI.

**3. What data actually drives generation** (currently unreachable from the park button, but real and running via the home page's own auto-generation):
- **Level:** wired, universal, not location-specific — `buildUserProgramLevels` in [`home-workout.service.ts:1551`](src/features/workout-engine/services/home-workout.service.ts#L1551).
- **Equipment:** wired, but only via **GPS-nearest-park**, never "the specific park the user is viewing." [`resolveParkEquipmentIds`](src/features/workout-engine/services/park-equipment-resolver.ts) scans the nearest equipped park within 2km of live GPS ([`:25,94-106`](src/features/workout-engine/services/park-equipment-resolver.ts#L94-L106)). **Confirmed dead code:** the function already has a `selectedParkId` priority-1 branch for targeting one specific park by id ([`:31,75-83`](src/features/workout-engine/services/park-equipment-resolver.ts#L31-L83)) — grepped every caller in the codebase, **nobody ever passes it**. So even a wired button couldn't target "this exact park" today without also threading this parameter through 3-4 layers.
- **Facility target muscles:** see #4 — not wired into generation at all.

**4. Facility target-muscle data model:** `GymEquipment` type ([`gym-equipment.types.ts:20-44`](src/features/content/equipment/gym/core/gym-equipment.types.ts#L20-L44)) has real, populated `primaryMuscle`/`secondaryMuscles`/`targetPrograms` fields (the type itself labels `targetPrograms` "metadata-only; not used by workout engine yet"). **Confirmed 100% cosmetic today** — grepped `primaryMuscle|secondaryMuscles` across the entire `workout-engine` generator: zero hits. The generator only ever treats a piece of equipment as a boolean present/absent gear id; it never reads what muscle it targets. Rendered only in `EquipmentDetailDrawer.tsx:480-483` (info drawer, no "start workout" CTA of its own).

**5. Live-workout representation — the core open question, and the answer is "essentially absent."**
- `StrengthRunner.tsx` (confirmed the real live player per repo convention) is a flat `PREPARING → ACTIVE → INPUT → RESTING` state machine over `WorkoutPlan.segments[].exercises[]`. Grepped `station|facility|equipmentId` inside it: one hit, and it's about the *hybrid* engine's walk/strength-block concept, unrelated to per-equipment tracking.
- Segments from [`buildRunnerWorkoutPlanFromGenerated.ts:205-286`](src/features/workout-engine/logic/buildRunnerWorkoutPlanFromGenerated.ts#L205-L286) use `type: 'station'` as a **role-based bucket** ("seg-main" groups *all* main exercises together) — not "3 sets of pull-ups at THIS bar."
- One component *does* model a literal per-equipment station — `StationCard.tsx` — but its only usage anywhere is [`src/app/active-workout-ui/page.tsx`](src/app/active-workout-ui/page.tsx), a hardcoded demo page (`mockPlan` with a segment literally named "תחנה 1: ספסל בפארק") with **zero references from anywhere else in the app** — orphaned mockup, not a head start on real integration (no state wiring, no generator output shape, no completion-sync logic behind it).
- **Conclusion:** if wired today, "start workout" on a park hands off to the fully generic strength player with no per-station sets/reps UI, no per-facility completion marking, no "move to next bar" concept.

**Effort breakdown:**
- **Wiring the button to do something at all** — mirror the already-shipped `RouteDetailSheet` fix: **S**.
- **Making it target the specific tapped park's equipment** (thread `selectedParkId` through `resolveWorkoutContext`/`resolveParkEquipmentIds`, which already has the receiving branch built): **S–M**.
- **Facility-target-muscle-aware exercise selection**: clean additive scoring change, but blocked on the per-facility grouping below existing first.
- **Real per-facility live tracking** (new generator output shape tagged per assigned `equipmentId`, new player state/UI): genuinely **L, needs design from scratch** — the one component that gestures at the UI shape (`StationCard`) has no wiring behind it to build on.

---

## E. Workout-overview page

### E1. "מבט על האימון" page — **[FEATURE-needs-design]** — effort **S** (one variant) / **M** (all three) / **L** (unified redesign)

**Not a single page** — three independent implementations, one per workout type, all reachable pre-start from Home/Map/Calendar/Favorites. (The literal string "מבט על האימון" is only a CRM/roadmap tag label, not real UI copy.)

**Strength — `WorkoutPreviewDrawer`** ([`src/features/workouts/components/workout-preview-drawer/WorkoutPreviewDrawer.tsx`](src/features/workouts/components/workout-preview-drawer/WorkoutPreviewDrawer.tsx), the highest-traffic one, imported by 6 different callers): drag handle → hero media → title → intensity toggle (conditional) → stat row (difficulty/duration pills + share/favorite/download icons) → description → equipment chips → muscle chips → **exercise sections (core content — warmup/supersets/tabata/pyramid/straight sets)** → volume-adjustment badge (conditional) → nearby-parks carousel (conditional) → location switcher (flag-gated) → sticky footer (Start CTA). Collapse candidates: stat row, equipment/muscle chips, volume badge, nearby-parks carousel, location switcher, intensity toggle.

**Hybrid — `HybridOverviewScreen`** ([`src/features/parks/core/components/hybrid/HybridOverviewScreen.tsx`](src/features/parks/core/components/hybrid/HybridOverviewScreen.tsx)): grabber → sticky summary header (title/duration/finish-time) → journey strip (Moovit-style icon sequence, always visible) → fallback banner (conditional) → **a "פירוט" (details) block that is already collapsed by default** ([`:487-505`](src/features/parks/core/components/hybrid/HybridOverviewScreen.tsx#L487-L505), containing route description, distance/calorie chips) → difficulty carousel → **journey axis (core content)** → sticky CTA. **This variant already implements exactly the details-expander pattern the task is asking about for the other two** — directly reusable as the copy-paste reference.

**Running — `WorkoutPreviewScreen`** ([`src/features/workout-engine/players/running/components/PlannedRun/WorkoutPreviewScreen.tsx`](src/features/workout-engine/players/running/components/PlannedRun/WorkoutPreviewScreen.tsx)): back nav → title/description → `RunStoryBar` (visual block-structure bar) → summary pills (duration/distance/difficulty/quality badge) → **block list (core content)** → sticky footer. Collapse candidate: summary pills row.

**Secondary surfaces found (not the primary path, don't conflate):** a standalone `/workouts/[id]/overview` route where running/hybrid branches are literally `<p>Coming soon</p>` placeholders (superseded), and the public web share-link preview page (`/workouts/[id]`, OG tags for social sharing) which structurally mirrors the strength drawer.

**Effort:** one variant (strength, highest traffic) ~half day; all three ~1-2 days (mechanically similar, repeated 3x across 3 separate trees, needs on-device gesture verification per each drawer's own fragility comments); a genuinely unified shared expander component across all three needs design first since they currently share zero primitives for this.

---

## Closing grouping

### (a) Quick fixes — ready to schedule now, no design decision needed

| Item | Fix | Effort |
|---|---|---|
| **D0** | Wire park "Start Workout" button — mirror the already-shipped `RouteDetailSheet` fix | **S** |
| **A1** | Add `imageUrl` read-priority to `ParkForm.tsx` + fix `updatePark`'s field whitelist to include `images` | **S** |
| **A2** (list) | Add `imageUrl` fallback to parks-list image check; fix reversed priority in `ParkDetailDrawer.tsx` | **XS–S** |
| **B4** | Add `text-gray-900 dark:text-white` to the 5 unstyled `<h3>`s in `ParkDetailSheet.tsx` | **XS** |
| **B2** | Widen the shared button-row gap or isolate Start-Workout's margin | **XS** |
| **B6** | Remove the focal-point "arrows" button from the map-popup card | **XS** |
| **A3** | Auto-select the just-uploaded media-library asset instead of requiring a second click | **S** |
| **B1** | Make the drawer open at full size (3 coordinated touch points, on-device verify) | **S** |
| **B6** | Restyle amenity chips to reuse the existing `IconChip`/`AMENITY_ICON_MAP` system | **S** |

### (b) Needs design before building

| Item | What needs deciding |
|---|---|
| **D0** | Per-facility live-workout experience (sets/reps/done-marking per station) — genuinely new UX + data shape, only a disconnected mockup exists today |
| **D0** | Whether/how to feed `primaryMuscle`/`secondaryMuscles`/`targetPrograms` into exercise selection once per-facility grouping exists |
| **C1** | Full edit-park flow reusing the add-park wizard, pre-filled — needs a product call on light-edit-vs-full-edit UX, plus checking whether the approval center can review a multi-field diff |
| **A4** | Cues field on facility editor — needs UX decision on input shape (free text vs. tag-chips vs. muscle-derived defaults) |
| **A2** (Bunny orphans) | Reconciliation tool to list Bunny bucket contents against Firestore — new capability, no browse API exists today |
| **A2** (CSV fallback) | Whether to keep/remove the equipment-image-as-park-image fallback, and whether to backfill real photos for affected parks |
| **B5** | Facility-card redesign (bigger card, drop company/video-available, functional-vs-hydraulic split, "(N)" header) |
| **E1** | Which info blocks move behind a details-expander, per workout type (hybrid already has a working precedent to copy) |

### Not action items — informational only

- **B3**: pure "how it's built" mapping (bare button, `flex-1` + inline height), not itself a bug or design gap.
- Dead code flagged in passing, worth a cleanup pass but not urgent: `park-drawer/index.tsx` (unused component), `active-workout-ui/page.tsx` + `StationCard.tsx` orphaned mockup, `resolveParkEquipmentIds`'s unreachable `selectedParkId` branch (this one specifically becomes load-bearing once D0's "target this exact park" work starts).
