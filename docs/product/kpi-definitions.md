# KPI Definitions — OUT / OUTRUN

**Status:** Locked by David, 06.10.2026, during the Journey Hub bug-fix round (admin panel "live panel review surfaced real data bugs" task).

This document is the single source of truth for how the admin panel's growth/activation/retention metrics are defined. When a metric's *implementation* can't fully match the definition below yet (missing data, missing instrumentation), that gap is called out explicitly in this doc — never silently approximated and presented as if it were the real thing.

---

## Activation — "completed a real workout"

**Locked definition:** a user is **activated** once they have completed **any real workout, of any type** — walk, run, strength, or cardio.

- **Walk / run / cardio (incl. cycling, hybrid):** any completed workout session counts. No further qualification.
- **Strength:** counts **only** if the session has **≥1 real set, beyond warmup**. A warmup-only session (no working sets completed) does **not** count as activation.
- **Recovery sessions** (rest-day video trio / cooldown-only content) do **not** count — they're explicitly not a training session under this definition.

**Retention** uses the same per-session qualification rule, counted lifetime: a user is retained once they have **≥3** qualifying workouts.

### Source of truth

Always computed from the real `workouts/{id}` collection — **never** from `progression.workoutCount`. That field is a client-written, best-effort counter (`completion-sync.service.ts`, `updateDoc({'progression.workoutCount': increment(1)})` wrapped in a try/catch that silently swallows write failures) and can under-count or read 0 even when real completions exist. This was already found and fixed once in the admin Users list (`users.service.ts`, `admin/users/all/page.tsx`) — the activation/retention metrics in the Journey Hub now use that same proven approach.

The shared predicate implementing the per-session qualification rule lives in `src/lib/workout-completion-kpi.ts` (`isRealWorkoutCompletion`) — one function, imported by both the client-side funnel (`funnel-analytics.service.ts`) and the server-side `growth-metrics` route, so the same tab can never show two different answers for "is this user activated."

### ⚠️ Known gap — warmup exclusion is NOT yet implemented for strength

The locked definition requires excluding warmup-only strength sessions. As of 06.10.2026, this is **not implementable against existing data**:

- Traced `useWorkoutStateMachine.ts` directly (not assumed). Warmup/cooldown exercises **do** reach the live exercise log (`ExerciseResultLog`) — both via the explicit follow-along branch (logged with the comment "Silent log + immediate advance... the log entry it still writes is harmless") and via the reps/time branch, which applies no role check at all before logging.
- The **persisted** shape (`SegmentExerciseDetail`, what actually lands in the `workouts` document) carries **no role/warmup field whatsoever**. `setsCompleted` — the field currently used as the strength qualification check — is computed directly from that same unfiltered log (`useProgressionSync.ts`), so it cannot distinguish a warmup-only session from one with real working sets.

**Current implementation (interim approximation, approved by David 06.10.2026):** a strength workout qualifies for activation if `setsCompleted >= 1` — i.e. the current bar is "had at least one confirmed set of any kind," not yet "had a real set beyond warmup." This is strictly weaker than the locked definition: a warmup-only strength session will currently still count toward activation.

**Follow-up needed (separate task, not yet scheduled):** add a role field (`main` / `warmup` / `cooldown`) to `ExerciseResultLog` and its persisted mirror `SegmentExerciseDetail`, so the KPI check can filter on it directly. This only fixes *future* workouts — it does not retroactively reclassify historical data, since the information was never captured at the time.

---

## Revenue

Not yet defined / not yet instrumented — the funnel's revenue stage is a placeholder (`count: null`), no billing integration exists. Out of scope for this document until that changes.

---

## Change log

- **06.10.2026** — Initial version. Locked by David during the activation-metric bug-fix round (BUG 1: the funnel's activation stage was reading 0 because it keyed on the unreliable `progression.workoutCount` field). Documents the real-completion source switch and the known warmup-exclusion gap.
