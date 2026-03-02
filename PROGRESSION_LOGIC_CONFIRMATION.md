# Progression Logic Confirmation

**Status:** Design confirmation — logic to be implemented after data sync.

---

## 1. Monthly Streak (Persistence Bonus) Calculation

### Rule

The 2nd, 5th, and 7th sessions **in the calendar month** add bonus % to the session gain.

### Config

```json
persistenceBonusConfig: { "2": 1, "5": 2, "7": 3 }
```

- **Session 2 in month:** +1% added to base gain
- **Session 5 in month:** +2% added to base gain  
- **Session 7 in month:** +3% added to base gain
- **Session 10+:** Cap at 3% (logic applies max)

### Implementation Plan

1. **Count sessions in month:** Before calculating session progress, query `workout_completions` (or equivalent) for the user + program + current calendar month.
2. **Session index:** `sessionIndexInMonth = count + 1` (this session is the Nth).
3. **Lookup bonus:** `bonus = persistenceBonusConfig[String(sessionIndexInMonth)] ?? 0`
4. **Apply:** `totalGain = baseGain + firstSessionBonus (if first) + persistenceBonus + rpeBonus`

### Edge Cases

- Sessions from **other programs** in the same pattern (e.g. Pull + OAP) may or may not count toward the same monthly streak. **Recommendation:** Count per movement pattern (Pull + OAP share the same monthly streak).
- Month boundary: Use calendar month (e.g. `new Date().getMonth()`).

---

## 2. Parent (Master) Level Derivation from Children

### Rule

Master programs (e.g. Full Body, Upper Body) derive their level from child programs (Push, Pull, Legs, Core).

### Current Model

From `progression.service.ts` and `recalculateMasterLevel`:

- Master level = **weighted average** or **minimum** of child levels, depending on config.
- Child tracks: `progression.tracks.push`, `progression.tracks.pull`, etc.
- Master track: `progression.tracks.upper_body` or `progression.tracks.full_body`.

### Confirmation

1. **Child → Parent propagation:** When a child (e.g. Pull) levels up, the parent (Upper Body) is recalculated.
2. **Derivation formula:** Typically `min(childLevels)` or `floor(avg(childLevels))` — to be confirmed per product spec.
3. **Grandchild (OAP) → Child (Pull):** OAP is a sub-program of Pull. When OAP progresses, it may contribute to Pull's level (or Pull may be derived from OAP if OAP is the "lead" skill). **Recommendation:** Define explicitly — either OAP contributes to Pull, or OAP is a separate track that does not affect Pull.

### Data Flow

```
OAP (Grandchild) --parentLevelMapping--> Pull (Child)
Pull (Child) --subPrograms--> Upper Body (Parent)
Upper Body --subPrograms--> Full Body (Master)
```

---

## 3. Grandchild Inheritance (10-to-1 Mapping)

### Rule

OAP Level 1 inherits `minSets` and `maxSets` from Pull Level 10.

### Implementation Plan

1. **Resolve settings for grandchild level:** When fetching `ProgramLevelSettings` for OAP L1:
   - Check `parentLevelMapping`: `{ "1": 10 }` → OAP L1 maps to Pull L10.
   - Fetch Pull L10 settings.
   - Override `minSets` and `maxSets` from Pull L10 (OAP doc can still have its own; inheritance wins for volume).
2. **Fallback:** If `parentLevelMapping` is missing, use OAP's own `minSets`/`maxSets` or defaults.

### Code Location

- `getProgramLevelSetting` in `programLevelSettings.service.ts` — add optional resolution step.
- Or: New helper `resolveProgramLevelSettingWithInheritance(programId, levelNumber)` that:
  1. Fetches OAP L1 settings.
  2. If `parentLevelMapping["1"]` exists, fetches Pull L10.
  3. Merges: `minSets = parent.minSets ?? self.minSets`, `maxSets = parent.maxSets ?? self.maxSets`.

---

## 4. RPE Bonus (Safety-First)

### Rule

When user logs RPE for the session, add bonus % from `rpeBonusConfig`. **Lower RPE = safer = rewarded.**

### Config

```json
rpeBonusConfig: { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
```

- RPE 1–5: +2%
- RPE 6–7: +1%
- RPE 8–10: 0%

### Implementation Plan

1. **Capture RPE:** Add RPE input to workout completion flow (if not already present).
2. **Lookup:** `bonus = rpeBonusConfig[String(rpe)] ?? 0`
3. **Apply:** Add to session gain when calculating progression.

---

## 5. Summary: Logic to Implement (Post-Sync)

| Logic | Status | Location |
|-------|--------|----------|
| Monthly Streak (S2, S5, S7) | To implement | `progression.service.ts` — `calculateSessionProgress` |
| Parent level derivation | Exists | `recalculateMasterLevel` — verify formula |
| Grandchild inheritance (minSets/maxSets) | To implement | New resolver or `getProgramLevelSetting` |
| RPE bonus | To implement | Workout completion + `calculateSessionProgress` |
| baseGain / firstSessionBonus | To implement | Prefer `programLevelSettings` over `progression_rules` |
