# Communities / Persona / Authority — Architecture Map

> Read-only investigation, 24.07.2026. 6 parallel code+DB mappers → synthesis → adversarial critic (all 5 high-stakes claims CONFIRMED against file:line). No code touched.
> Purpose: map the existing closed-community substrate and define a modular `authority → community` generalization. Feeds the Wix (kind=company) MVP pilot.
> ⚠️ "LIVE" throughout = **wired end-to-end**, not proven in production. Only demo seeds found (`battalion-890`, `school-rabin`). The Wix pilot is the first real use.

---

## 0. Headline finding

**The closed-community spine already exists and is LIVE — it is just called `authority` / `tenant`.**

- `authorities/{id}` ⟷ `tenants/{id}` are the **same doc-id** (twin, co-written — `functions/src/onUnitWrite.ts:19-30`). So **tenant ≡ authority**.
- The tenant carries a built-in discriminator: `tenantType` = `municipal | educational | military | company | youth_movement` (`src/types/admin-types.ts:8`). Also `AuthorityType` (`admin-types.ts:6`).
- **Cohorts** live in `tenants/{id}/units/{unitId}` (`{name, unitPath[], parentUnitId?, memberCount}`).
- **Closed entry works today**: `access_codes/{CODE}` → CF `validateAccessCode` → transactionally stamps `users/{uid}.core.{tenantId,unitId,unitPath,tenantType}` (`functions/src/validateAccessCode.ts:144-155`).

**Implication:** don't build a `communities` collection from scratch — **generalize `authority → community`** on the same doc by adding a `kind`, fold `units` in as the cohort primitive, and build only 3-5 missing pieces. A municipality is a special case of a community.

---

## 1. Full map — the 6 areas

### A. Persona step + access-code entry (onboarding)
- **The code ties to a TENANT+UNIT (organization/cohort) — NOT a community group, league, or arena group.** Entering a code in `src/components/ui/AccessCodeGate.tsx:110-119` → CF stamps `core.{tenantId,unitId,unitPath,tenantType}`. **No `community_groups` membership created; no `authorityId` written.**
- **Every persona/code surface is dormant/legacy and OUTSIDE the live 5-phase cold flow:**
  - `src/app/onboarding-new/persona-selection/page.tsx` — Firestore "lemur" picker, orphaned (only inbound is `phase2-intro`, which nothing routes to).
  - `src/features/user/onboarding/components/steps/PersonaStep.tsx` — lifestyle persona + embedded code modal; renders only via `OnboardingWizard` at `/onboarding-new/setup` (JIT/upgrade/resume); PERSONA is **not** a JIT requirement → dormant.
  - `AccessCodeStep.tsx` — standalone, fully dead (`'ACCESS_CODE'` in no wizardSteps array).
  - Live cold flow (`src/features/user/onboarding/onboarding-phases.ts`) has **no persona step at all**.
- **No feature flag** anywhere around this.
- **Broken deep-link (bug):** `src/app/onboarding-new/profile/page.tsx:285` pushes to `/onboarding-new/access-code` — **route directory does not exist (404)** — broken B2G deep-link (triggered by `pending_institution_code`, `src/lib/native/init.ts:130`).
- **Layout defects** ("step doesn't sit well"): nested scroll `PersonaStep.tsx:490`, detached sticky `:444`, unregistered `z-[90]` `:644`.

### B. Invite / deep-link / join engine
- **WhatsApp link** `/join/[inviteCode]` → `src/lib/joinEngine.ts:100-275` → **atomic triple-write** (`community_groups/{groupId}/members/{uid}` + `user_memberships/{uid}.groupIds` + `users/{uid}.social.groupIds`). `groupId` always resolved server-side from `inviteCode` (axiom §17/§18). **Never touches tenant/authority.**
- This is a **completely separate system** from the org-code path. The two membership systems are disjoint (see caveat / gap).

### C. Groups / communities / leagues / feed
- **Groups** = `community_groups` (+ `members` subcollection, roles).
- **Leagues = NOT a collection.** They are **live aggregations of `feed_posts`** by a scope field: `src/features/arena/services/ranking.service.ts:88-96` — `city→authorityId`, `school→schoolId`, `park→parkId`; single-group `league` scope → `groupIds array-contains`. Unit leaderboards shard `{tenantId}_{unitId}_{period}` (`functions/.../leaderboard.ts:44-61`). No `collection('leagues')` anywhere.
- **Feed stream is FOLLOW-GRAPH only today:** `src/features/social/services/feed.service.ts:173` — `where('authorUid','in',[self,...following])`. **Not community/city-scoped.** Leaderboards are scope-field-scoped; the *stream* is not.
  - **Write side is READY:** every `feed_post` already carries `groupIds[]` + `authorityId/tenantId` (`src/features/social/services/feed-scope.utils.ts:12-57`). Only the READ query is missing.
- The only `communities/` string in the repo is a Firebase Storage image path (`community.service.ts:140`) — not a Firestore collection.

### D. The "units" model (`tenants/{id}/units`)
- **LIVE admin scaffolding + code-gated membership, but ZERO runtime/mobile reader.** grep returns only admin/backend readers (`admin/access-codes`, `admin/authority/units`, `unit-count-sync.service.ts`, `unit-import.service.ts`, seeds).
- **The reason it "looks dead" is NOT a design flaw — it is the missing `tenantId` custom claim:** `firestore.rules` `hasTenant()` (`firestore.rules:68`) gates every tenant/unit/readiness read on `request.auth.token.tenantId`, and **no code sets that claim** (0 occurrences of `setCustomUserClaims`). **An end user cannot read their own tenant/community today.**

### E. Authority pattern — the model to reuse (already "a community with scoping + a panel")
- **Scope seam is ready:** `src/features/admin/utils/tenant-query.utils.ts:28-66` — dual-path already written to swap `authorityId↔tenantId`. A "community" scope is just another value.
- **Branding:** `authorities.logoUrl` exists (`admin-types.ts:144`) and IS shown to end users (`src/app/community/page.tsx:898`) — **but every render REPLACES the OUT mark.** No dual OUT+community lockup exists. The `content/branding` module is notification-**text** templating, not visual (`branding.types.ts`).
- **Manager = `authority_manager`:** magic-link portal (`src/app/authority-portal/login/page.tsx:43-96`), scoped panel `/admin/authority/*`, scope-validated invites (`src/features/admin/services/invitation.service.ts:90-200`), dashboard/switcher (`authority-manager/page.tsx:53-105`). **Reuse wholesale.**

### F. Students / schools / military
- **Schools:** `authorities/{id}` `type='school'` + tenant-twin; classes = `tenants/{id}/units/{classId}`; teacher = `authority_manager`. **The canonical intended shape** (`scripts/seed-military-school-demo.ts:316`).
- **Military:** the seed currently models sub-groups as **child authorities** (`seed-military-school-demo.ts:137`) — **diverges** from the `tenants/units` wiring. Reconcile.
- **Students:** `ageGroup='minor'` stamped at redemption → already segregates Safe-City + blocks DMs (`firestore.rules:1265`) — safety win reused free. Distinct from the `student` lifestyle tag (content-targeting, not membership; `src/core/constants/userLifestyles.ts:23`).
- **Legacy `schools` collection** (dead for clients, `firestore.rules:1440`) — retire or repurpose as an entitlement layer, **not** membership.

---

## 2. Gap-analysis — REUSE / REFINE / BUILD

| Item | Status | Note (file:line) |
|---|---|---|
| Join-by-code (org/tenant) | **REUSE** | `access_codes` + `validateAccessCode` CF — atomic, App-Check, usage-capped (`functions/src/validateAccessCode.ts:94-167`) |
| Join-by-WhatsApp-link (group) | **REUSE** | `joinEngine` triple-write, server-authoritative (`src/lib/joinEngine.ts:100-275`) |
| Scope seam (query abstraction) | **REUSE** | `tenant-query.utils.ts:28-66` already swaps authorityId→tenantId |
| Manager admin area (panel) | **REUSE** | `authority_manager` RBAC + magic-link portal + `/admin/authority/*` + scoped invites |
| Leagues / standings | **REUSE** | per-group (`ranking.service.ts:516`, `groupIds array-contains`) + per-unit shards `{tenantId}_{unitId}` (`leaderboard.ts:44-61`) |
| Logo field | **REUSE** | `authorities.logoUrl` exists (`admin-types.ts:144`) |
| `firestore hasTenant()` isolation shape | **REUSE** | `firestore.rules:68` (but blocked by missing claim — see BUILD) |
| kind/type discriminator | **REFINE** | `AuthorityType`(`admin-types.ts:6`)/`TenantType`(`:8`) — add values + **fix drift** (`military` vs `military_unit`; seed writes out-of-union `type:'military'`, `route.ts:9` papers over it) |
| units cohort model | **REFINE** | **fold in** as canonical cohort; standardize military off child-authorities (`seed-military-school-demo.ts:137`) onto `tenants/units` |
| Two disjoint membership systems | **REFINE** | `core.unitId/tenantId` (code) vs `social.groupIds`/`user_memberships` (invite) — no FK; bridge them |
| Persona-code step | **REFINE** | gate behind flag (`ACCESS_CODE_GATE_ENABLED`, guard `PersonaStep.tsx:283-287` or empty `ACCESS_CODE_PERSONA_IDS` `:12`) + fix layout + fix 404 route (`profile/page.tsx:285`) |
| isActiveClient / CRM | **REFINE** | municipality-only; split off community write/read paths (ideally sibling doc) |
| Deep-link code durability | **REFINE** | `pending_*` use raw localStorage; move to `onboardingPrefs` (axiom §19; `init.ts:80`) |
| Legacy `schools` collection + affiliations tier | **REFINE** | retire or repurpose as entitlement layer, not membership (`firestore.rules:1440`) |
| **co-logo (OUT + community)** | **BUILD** | no dual lockup — every render replaces OUT (`authority-portal/login:161-173`, `community/page.tsx:700`, `EventCard.tsx:119-121`). Render-only; data field exists |
| **Scoped FEED (READ)** | **BUILD** | stream is follow-graph (`feed.service.ts:173`); write side ready; add `where groupIds array-contains` / `tenantId==` + closed-visibility rules |
| **tenantId custom claim** | **BUILD** | THE blocker — `hasTenant()` gates on `request.auth.token.tenantId`; no `setCustomUserClaims` sets it. Mint in `validateAccessCode` OR rewrite `hasTenant()` to read `users/{uid}.core.tenantId` |
| **joinEngine → tenant bridge** | **BUILD** | a join that atomically sets group AND authority/tenant in one batch (touches most-locked field — axiom §6/§20; migrate carefully) |
| **Enforced closed visibility** | **BUILD** | `isCityOnly` is client-side only (`NearbyGroupsRow.tsx:57`); enforce in query + rules |
| Per-community end-user theme | **BUILD (optional)** | `VERTICAL_THEMES` (`tenantLabels.ts:29-77`) is admin chrome only |

---

## 3. Modular architecture proposal

**Core decision:** do NOT build a new `communities` collection or fork per business model. **Generalize the `authorities`/`tenants` twin into ONE "community/organization" entity** distinguished by `kind`. The final user flow (code/link → attach → co-branded + scoped feed + scoped league + manager panel) is then **identical** across all 5 models.

**Entity fields:** keep the twin; `kind` (extend `AuthorityType`+`TenantType`: `municipality | company | reserves | school | students`); `name`, `logoUrl`, `managerIds[]`, `parentAuthorityId`; cohorts = `tenants/{id}/units/{unitId}`; optional `themeTokens`. Keep municipality-only fields (`isActiveClient`, CRM, `gatingMode`, `pressureCount`, shelter/defense) OFF community paths.

**Join:** code (org) = `access_codes` → `validateAccessCode`; link (roster) = `joinEngine`; **bridge to build** = extend `joinEngine` to set group + tenant/authority in one atomic batch.

**Co-branding:** reuse `authorities.logoUrl`; **build** an OUT+community lockup component (render beside, not replacing, the OUT mark).

**Feed & leagues:** leagues reuse `getLeagueLeaderboard` (`groupIds array-contains`) + unit shards; **build** the community-scoped feed READ + enforced-visibility rules.

**Manager:** reuse `authority_manager` scoped to the community id.

**Units:** FOLD IN as the canonical cohort primitive (not deprecate) — the only reason it "looks dead" is the missing tenantId claim, not design.

### Business-model mapping

| Model | kind | How it sits |
|---|---|---|
| Municipalities | `municipality` | Only one carrying `isActiveClient`/CRM/GPS-city join; those fields stay dormant on the rest |
| Companies (Wix) | `company` | **Cleanest 1:1** — one tenant, one shared code for all employees, departments = units. Enum already exists (`admin-types.ts:8`) |
| Reserves (miluim) | `reserves` | ONE parent tenant + MANY units (each miluim group = a unit); multi-group manager = one `authority_manager`; per-unit leagues via `{tenantId}_{unitId}` shards. Requires standardizing military onto `tenants/units` |
| Schools | `school` | classes = units; teacher = manager; canonical shape |
| Students | `educational` | cohort code-join; `ageGroup=minor` segregates Safe-City + blocks DMs free (`firestore.rules:1265`) |

---

## 4. Critical caveats (surfaced by the adversarial critic — address before build/go-live)

1. **Group-membership security hole:** the locked-group `AccessCodeGate` join (`src/features/arena/components/GroupDetailsDrawer.tsx:1362`) unlocks a group on **ANY valid tenant code** — it does not verify the code belongs to *that* group. Real closed-community integrity hole. **[SEC #1 — gate before go-live]**
2. **Feed `authorityId` comes from client-writable soft affiliation:** `extractFeedScope` derives `authorityId` from `core.affiliations[]` (client-writable), NOT the Admin-SDK-locked `core.authorityId`. A closed boundary built on this stamp is only as trustworthy as the client-writable affiliation → **enforce server-side.** **[SEC #2 — gate before go-live]**
3. **Discriminator drift already exists:** `AuthorityType` has no `military`/`company`/`community`/`reserves` value (only `military_unit`); the seed writes out-of-union `type:'military'`; `src/app/api/admin/authorities/route.ts:9` normalizes it. **Reconcile BEFORE adding community kinds** — this is a precondition, not just a refine note.
4. **Redemption switches tenant wholesale:** `validateAccessCode` overwrites `core.tenantId/unitId` (merge) — a user belongs to **exactly one tenant at a time**. No multi-tenant membership. Matters for reserves/company/school users who could belong to >1 org (e.g. miluim + workplace). Reserves phase needs multi-tenant refinement.

**Extra:** extending `joinEngine` to also write `authorityId` in the same batch touches the single most access-controlled field (axiom §6/§20) — quantify migration/rules risk before doing it.

---

## 5. Panel / pilot follow-ups (parked — do NOT build now, logged 25.07.2026)

Context: Wix (kind=company) shipped to prod (co-logo, active-days league, redemption affiliation, panel toggle, company classification, access-code fixes). These remain open:

**(א) Generalize the vertical beyond company (educational / military / youth_movement) — the "(b)" work:**
- **DEAD-END confirmed (26.07):** a code for student/pupil (educational) or soldier/reservist (military) sets `core.tenantId` but produces **no league tab**. Two gaps: (i) the CF affiliation write fires **only for `tenantType==='company'`** (`functions/src/validateAccessCode.ts:176,200`); (ii) `useArenaAccess` (`src/features/arena/hooks/useArenaAccess.ts:55-57,66-77`) grants the org tab only for affiliation **types** `school | company | youth_movement` — **there is NO `military` branch**, and it keys on `school` (not the `educational` tenantType).
- Because of the dead-end, the **onboarding persona code popup is now GATED to `office_worker` only** (commit `e7a7372`, `PersonaStep.tsx` `ACCESS_CODE_PERSONA_IDS`). student/soldier/reservist/pupil no longer open the popup; `PERSONA_TENANT_TYPE` still holds their mapping for when this lands.
- **To finish (b):** (1) CF writes the affiliation for educational→type `'school'`, youth_movement→`'youth_movement'`, military→(needs a type useArenaAccess reads); (2) add a `military` branch to `useArenaAccess` (+ reconcile the affiliation.type `'school'` vs tenantType `'educational'` vocabulary); (3) re-add student/soldier/reservist/pupil to `ACCESS_CODE_PERSONA_IDS`. Defer until there's a deal in such a vertical.
- **Units-nav drift** (`src/app/admin/authority/units/page.tsx:143`): filters orgs by `authorityTypeToTenantType(o.type)` → company/youth_movement (authority.type='city') collapse to 'municipal' → filtered out. Fix 2 only fixed the org LIST (`/admin/organizations`), not the units page. Make it read the stored `tenantType` (same pattern). This is why clicking a company org → units navigates "wrong".

**(ב) Inter-department (per-unit) league — drill-down:**
- `leaderboard_shards` already carry `unitId`; `getTenantLeaderboard` (`src/features/arena/services/ranking.service.ts`) currently aggregates tenant-wide (`unitId=null`). A department drill-down needs: pass `unitId`, add a composite index `(tenantId, unitId, period)` to `firestore.indexes.json`, and a unit selector in the league UI. Shards + read function already support it.

**(ג) Multi-tenant membership (belong to >1 community at once):**
- Today `core.tenantId` is a **single** value, **overwritten** on every access-code redeem (`validateAccessCode` `tx.set(core:{tenantId,...})`). A user can belong to only one tenant at a time → can't be in workplace + city + friends' community simultaneously (see §4.4 caveat). The affiliations array (`core.affiliations[]`) already accumulates multiple, but the league/feed/co-logo key on the single `core.tenantId`. Real multi-tenant needs: model membership as a set (reuse `core.affiliations`), let the user pick an "active community" context, and re-point the tenant-scoped reads (co-logo, `getTenantLeaderboard`, onWorkoutCreate shard bucketing) at the selected context instead of the single `core.tenantId`.

---

## Method / sources
- Investigation workflow: `communities-architecture-investigation` (6 mappers + synthesis + critic), 24.07.2026. Raw per-agent results in the run journal.
- All claims cite file:line. DB schema inferred from code + `firestore.rules` + seed scripts + `src/types/*` (no live Firestore query).
- Downstream: `wix_community_mvp_spec.md` — the Wix (kind=company) E2E pilot. Build order: (1) tenantId custom-claim [BLOCKER], (2) co-logo lockup, (3) scoped feed READ + rules, (4) code entry [already works], (5) league card [reuse]. SEC #1/#2 before go-live.
