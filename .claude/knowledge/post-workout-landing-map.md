# Post-Workout Landing Flow — Investigation Map (Block A/B/C)

> Read-only investigation. 25.07.2026. For the "post-workout landing" task: top compact non-blocking
> summary card + anchor "smart-close" mode. Every claim cites file:line. Source-of-truth docs (Drive):
> master "ארכיטקטורת הבית ומנוע-ההמלצות v2" §3/§6/§9 · "מסך הבית — להבות וטבעות" · mockups "עוגן R" + "בית R".

---

## 0. Headline: the ring ENGINE is already built. The task is mostly PLACEMENT + a Ranker post-mode.

The §9 strength-goal ring (task §2) is **engine-complete behind `STRENGTH_RING_ENABLED` (=false)**. Do NOT
rebuild it. What's genuinely new: (A) the **top compact summary strip** placement above the schedule
(= the "float-to-top" deferred in HOME_DAILY_GOAL_V1 item 5); (B) the **anchor post-mode toggles**
("smart close"); (C) the 150-min mixed activity ring wiring.

---

## 1. Where return-to-home sits (the handoff) — VERIFIED

- Strength finish route: `/workouts/[id]/active`, flowState `active → dopamine → summary`
  (`app/workouts/[id]/active/page.tsx:1377,1411,1429`). `handleComplete` builds stats (:738);
  `handleSummaryFinish` finalizes XP + navigates home (:1040+, rendered as `onFinish` :1443/:1464).
- **Handoff key = sessionStorage `post_workout_completed`** (JSON: `workoutType, durationMinutes,
  completedAt, workoutTitle?, streak?, thumbnailUrl?`). Home reads it at `app/home/page.tsx:445-458`,
  TTL 30 min, then removes the key → sets `postWorkoutData` + `showMotivationBanner` + celebration.
  (Writer site to pin at build — sets the same key on summary finish.)
- Persistent fallback (>30 min / refresh): Firestore `dailyProgress.workoutCompleted` → `todayWorkoutDone`
  (`home/page.tsx:413-414`, via `useDailyProgress`).
- Both feed `completionData` → **HeroWorkoutCard completion card**, currently rendered in the ANCHOR slot
  (`home/page.tsx:1376-1392`, AFTER `StatsOverview`/schedule). The task's "top strip above the לוז" is a
  NEW placement — exactly the "float-to-top" deferred in [[home-daily-goal-v1]] item 5.

## 2. Block A — ENGINE-COMPLETE behind `STRENGTH_RING_ENABLED` (feature-flags.ts:187 = false)

- **A-1, 4 pure/read-only units (all exist + tested):**
  - `home/hooks/useTodayStrengthVolume.ts` (+ util `home/utils/todayStrengthVolume.ts`) — setsCompleted today, isRecovery filtered.
  - `home/hooks/useDailyStrengthTarget.ts` (+ util `home/utils/dailyStrengthTarget.ts`) — stable target = `weeklyVolumeTarget ÷ scheduleDays`, live from currentLevel, flag-gated (no Firestore read when off).
  - `home/utils/setsToMinutes.ts` (`FRAGMENTER_MINUTES_PER_SET`) — sets→friendly-minutes label (+ test).
  - `home/utils/strengthRingView.ts` — the ring-view builder.
- **A-2 (ring in completion card):** `completionData.ring` → `ringView` → `CircularProgress`, center = "מהיעד
  היומי" minutes label (`HeroWorkoutCard.tsx:18,555,608`; fed `home/page.tsx:475-481`). Gated by STRENGTH_RING_ENABLED.
- ⇒ task §2 ("ring = % of daily strength goal · sets-driven, minutes-labeled · accumulates across the day")
  is DONE. New work = the top strip that HOSTS this ring, not the ring.

## 3. Phase-1 status

- `POST_WORKOUT_TRIO_ENABLED` — **never built** (matches master §6 "מתוכנן ומוקפא — לא נבנה"). No trio in code.
- **Dismiss-per-day core EXISTS** as the missed-banner pattern: `missed_banner_dismissed_${iso}`
  (`home/page.tsx:340-347`) + `showMotivationBanner`. This is the reusable "X per-day" grain the task §1 wants.
- **No top "now carousel" component** exists. The post-workout recap = the HeroWorkoutCard completion card.

## 4. isRecovery isolation (§5 gate / §9 law) — PARTLY ALREADY FIXED (doc likely stale)

- Weekly-budget exclusion EXISTS: recovery excluded from budget (`useWeeklyVolumeStore.ts:9,124,298`).
- processWorkoutCompletion recovery guard EXISTS: "recovery guard skips processWorkoutCompletion for
  isRecovery plans" (`useWorkoutStateMachine.ts:694`).
- ⇒ §9's concern ("processWorkoutCompletion runs always → leaks strength %") reads STALE. Needs a focused
  re-verify BEFORE Block B wires "recovery" as a close-type, but is **NOT a Block-A blocker**.

## 5. ⚠️ KEY "don't-duplicate" finding — 3 overlapping flags in this exact area

| Flag | State | What it does |
|---|---|---|
| `STRENGTH_RING_ENABLED` | false | completion-card ring engine (A-1 + A-2) |
| `HOME_DAILY_GOAL_V1` | true* | Task-10: ⅔-completion threshold + weekly bars + adaptive line (*flipped for device-test, uncommitted) |
| `HOME_ANCHOR_V2_ENABLED` | true (prod) | anchor "order B" reorder schedule→anchor→metrics (`StatsOverview` :594,1116,1124,1171). The R anchor SHELL — NOT the hero+toggles of §3ג (those = Block B, unbuilt) |

Block A must REUSE the STRENGTH_RING engine. Open decision: new flag vs fold into an existing one.

## 6. Proposed build order (awaiting David's go — NOTHING built yet)

- **A (near step):** top compact summary strip above the לוז. Mockup `.summary`: indigo gradient
  `#EEF0FF→#F5F3FF`, ring conic `#6366F1`, radius 18. Content = ring + "כל הכבוד! סיימת אימון כוח 💪" +
  משך·#תרגילים·~קק"ל + "עצרת אחרי X — נשאר קצת לסגור" + X-dismiss (reuse §3 per-day grain). Ring = REUSE
  `completionData.ring`. Detailed summary stays a drill-in (no expand in home). New flag (byte-identical off).
- **B:** anchor post-mode toggles ("smart close": כוח-קצר / התאוששות / אירובי, shrunk by time/energy left) —
  Ranker output for post-state; builds on HOME_ANCHOR_V2 shell + `generateHomeWorkoutTrio`. isRecovery verify = pre-condition.
- **C:** 150-min mixed activity ring (activity track, separate from the strength-goal ring) — wiring check
  (`activeMinutes.weeklyGoal=150` per §9; `home/utils/activity-ring.utils.ts` exists).

## 7. Decisions needed from David before Block A
1. New flag (e.g. `POST_WORKOUT_LANDING_V1`) vs fold into `STRENGTH_RING_ENABLED`?
2. Does the top strip REPLACE the current anchor-slot completion card, or coexist?
3. Relation to `HOME_DAILY_GOAL_V1` (device-test) — keep separate or converge the two completion surfaces?

## 8. BUILD STATUS — Block A committed (26.07.2026, branch feat/home-daily-goal-v1)

Decisions locked: (1) new flag `POST_WORKOUT_LANDING_V1` (depends on STRENGTH_RING_ENABLED on);
(2) REPLACE — summary floats to top, old anchor-slot card removed, "עוד אימון" reused as bridge;
(3) ring reads the STABLE target (useDailyStrengthTarget), NOT HOME_DAILY_GOAL_V1's ⅔ target —
Task-10 bars unify onto the same selector in the immediate follow-up.

- **A-i `b3f668d`** — flag + extend completion→home handoff (sessionStorage `post_workout_completed`)
  with additive `calories` + `exerciseCount` (strength caller = useActivitySync). Inert when off.
- **A-ii `d549e5a`** — `PostWorkoutSummaryStrip.tsx` (mockup `.summary`: indigo card, stable-target
  ring, praise, partial/full line, stats duration·#exercises·~kcal, X per-day dismiss) rendered at
  the TOP of home above the לוז; old completion card replaced by the "עוד אימון" bridge when flag on.
  OFF → byte-identical (else branch = original HeroWorkoutCard).

Device-test needs BOTH `POST_WORKOUT_LANDING_V1=true` AND `STRENGTH_RING_ENABLED=true` (flag dep).

**Open / follow-ups:**
- Non-strength types (running/hybrid) still show a STRENGTH ring in the strip (ring is strength-centric);
  the aerobic counterpart = Block C (150-min mixed activity ring). Per-type strip ring = refine later.
- "עצרת אחרי [domain]" specific prefix (mockup) simplified to "נשאר קצת לסגור" — domain→"פלג עליון/תחתון"
  mapping is the same per-muscle gap flagged in [[home-daily-goal-v1]] item 5.
- **Block B** (anchor "smart close" toggles: כוח קצר/התאוששות/אירובי) — needs the isRecovery re-verify (§4) first.
- **Block C** — 150-min mixed activity ring wiring (activity track, separate indicator).

Related: [[home-daily-goal-v1]] · summary-screens-map.md · [[adaptive-schedule-map]] (Stage-2 rolling engine, parked).
