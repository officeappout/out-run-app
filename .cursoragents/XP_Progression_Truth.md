# ⚡ XP & Progression Truth — OUT Application

> **Status:** CANONICAL LAW. This is the single source of truth for all XP, coin,
> bonus, RPE, level-derivation and volume-inheritance logic in OUT.
> **Consolidated from:** `PROGRESSION_DATA_INJECTION_PLAN.md` + `PROGRESSION_LOGIC_CONFIRMATION.md`.
> **Source files are kept for history — this file overrides them on any conflict.**
> **Rule of engagement:** Do NOT invent new bonus formulas, level tiers or caps.
> Every progression value the engine uses MUST trace back to a row in this document.

---

## LAW 0 — Authority & Storage

- Progression-integrity fields (`progression.coins`, `progression.globalLevel`,
  `progression.globalXP`) are **server-owned**. The ONLY authorized writer is the
  `awardWorkoutXP` Callable Cloud Function ("The Guardian"), via the Admin SDK.
  Client code MUST route through `src/lib/awardWorkoutXP.ts`. Firestore rules
  (`noGameIntegrityFieldsChanged()`) reject any direct client write.
- Per-program tuning lives in the Firestore collection
  **`program_level_settings` / `programLevelSettings`**, one document per
  `(programId, levelNumber)`.
- Settings are preferred over the legacy `progression_rules` collection.

---

## LAW 1 — Level-Settings Schema

Every `(programId, levelNumber)` document carries exactly these fields:

| Field | Type | Meaning |
|-------|------|---------|
| `baseGain` | Number | Base % progress added per completed session |
| `firstSessionBonus` | Number | Extra % for the FIRST session in a new level |
| `maxSets` | Number | Hard cap — maximum sets per session |
| `minSets` | Number | Minimum sets (also used for grandchild inheritance) |
| `persistenceBonusConfig` | Object | `sessionIndexInMonth → bonus %` |
| `rpeBonusConfig` | Object | `RPE value → bonus %` |
| `parentLevelMapping` | Object | Grandchild level → parent level (volume inheritance) |

---

## LAW 2 — Base Gain & First-Session Bonus (by Level Tier)

| Level Range | `baseGain` | `firstSessionBonus` |
|-------------|-----------|---------------------|
| 1 – 5   | 8% | +3%   |
| 6 – 13  | 6% | +3%   |
| 14 – 19 | 4% | +1.5% |
| 20 – 25 | 2% | +0.5% |

- `firstSessionBonus` applies ONLY on the user's first completed session at a new level.
- The tier mapping is monotonic-decreasing: higher level ⇒ slower gain (asymptotic mastery).

---

## LAW 3 — Master / Child / Grandchild Hierarchy

```
OAP (Grandchild)  --parentLevelMapping-->  Pull (Child)
Pull (Child)      --subPrograms-->         Upper Body (Parent)
Upper Body        --subPrograms-->         Full Body (Master)
```

### 3.1 Master Programs (Identity Level)
- For any program with `isMaster: true` (Full Body, Upper Body, …): **`baseGain = 0`**.
- Master level is **purely derived** from child levels — it NEVER accrues progress directly.
- On any child level-up, the parent is recalculated via `recalculateMasterLevel`
  (`progression.service.ts`). Derivation formula = `min(childLevels)` or
  `floor(avg(childLevels))` per product config.

### 3.2 Grandchild Volume Inheritance (10-to-1 Mapping)
- A grandchild (e.g. OAP — One-Arm Pull-up) inherits `minSets`/`maxSets` from a
  parent child level via `parentLevelMapping`.
- Example: `parentLevelMapping: { "1": 10 }` ⇒ OAP Level 1 inherits volume from Pull Level 10.
- Resolution order: fetch grandchild settings → if `parentLevelMapping[level]` exists,
  fetch parent settings → `minSets = parent.minSets ?? self.minSets`,
  `maxSets = parent.maxSets ?? self.maxSets`. Inheritance WINS for volume.
- Fallback: missing mapping ⇒ use the grandchild's own values or defaults.

---

## LAW 4 — Session Gain Formula (Authoritative)

```
totalGain = baseGain
          + firstSessionBonus      (only if first session in this level)
          + persistenceBonus       (monthly-streak, LAW 5)
          + rpeBonus               (safety-first, LAW 6)
```

Computed inside `progression.service.ts → calculateSessionProgress`.

---

## LAW 5 — Monthly Streak (Persistence Bonus)

Canonical config (identical for ALL levels):

```json
{ "2": 1, "5": 2, "7": 3 }
```

| Session # in calendar month | Bonus |
|-----------------------------|-------|
| Session 2  | +1% |
| Session 5  | +2% |
| Session 7  | +3% |
| Session 8, 9, 10+ | +3% (HARD CAP — never exceeds 3%) |

**Algorithm:**
1. Count completed sessions for `(user, program, current calendar month)`.
2. `sessionIndexInMonth = count + 1`.
3. `bonus = persistenceBonusConfig[String(sessionIndexInMonth)] ?? 0` (capped at 3%).

**Streak scoping rule:** Count is per **movement pattern**, not per exact program.
Pull and its grandchild OAP **share** the same monthly streak. Use the JS calendar
month boundary (`new Date().getMonth()`).

---

## LAW 6 — RPE Bonus (Safety-First)

Lower RPE ⇒ safer effort ⇒ MORE reward (anti-burnout design).

```json
{ "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
```

| RPE | Bonus |
|-----|-------|
| 1 – 5  | +2% |
| 6 – 7  | +1% |
| 8 – 10 | 0%  |

`bonus = rpeBonusConfig[String(rpe)] ?? 0`. Captured at workout completion.

---

## LAW 7 — Double Progression (Reps → Level)

(From the training canon; governs WHEN a level increments.)
1. Keep weight/variation constant.
2. Increase reps until the upper range is hit with perfect form.
3. ONLY THEN → level up (harder variation) and drop reps to the lower range.
4. **Bonus trigger:** exceeding the target range in the **LAST SET ONLY** grants a
   visual "XP Boost" + accelerated progression marker.

---

## LAW 8 — Reference Injection Data (Pull & OAP)

Canonical seed values. `persistenceBonusConfig` and `rpeBonusConfig` are constant
across all rows (LAW 5 / LAW 6).

| Program | Level | `baseGain` | `firstSessionBonus` | `maxSets` | `minSets` | `parentLevelMapping` |
|---------|-------|-----------|---------------------|-----------|-----------|----------------------|
| Pull | 1  | 8 | 3   | 20 | 4 | — |
| Pull | 10 | 6 | 3   | 24 | 6 | — |
| Pull | 22 | 2 | 0.5 | 28 | 8 | — |
| OAP  | 1  | 6 | 3   | 24 | 6 | `{"1":10}`  |
| OAP  | 10 | 4 | 1.5 | 28 | 8 | `{"10":19}` |
| OAP  | 22 | 2 | 0.5 | 28 | 8 | `{"22":25}` |

OAP L1 example (ready-to-sync):

```json
{
  "programId": "oap",
  "levelNumber": 1,
  "baseGain": 6,
  "firstSessionBonus": 3,
  "maxSets": 24,
  "minSets": 6,
  "parentLevelMapping": { "1": 10 },
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```

---

## LAW 9 — Implementation Map (Where Each Law Lives)

| Logic | Location |
|-------|----------|
| Coin / XP / level write (server) | `functions/src/awardWorkoutXP.ts` (Guardian) |
| Client entry to Guardian | `src/lib/awardWorkoutXP.ts` |
| Session gain math | `progression.service.ts → calculateSessionProgress` |
| Master level derivation | `progression.service.ts → recalculateMasterLevel` |
| Grandchild volume inheritance | `getProgramLevelSetting` / `resolveProgramLevelSettingWithInheritance` |
| Per-level settings store | Firestore `program_level_settings` / `programLevelSettings` |

---

*End of XP & Progression Truth — treat every number above as a hard constant.*
