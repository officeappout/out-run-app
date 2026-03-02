# Progression Data Injection Plan

**Status:** Ready for review — DO NOT run final sync until approved.

---

## 1. Schema Fields (program_level_settings / programLevelSettings)

| Field | Type | Description |
|-------|------|-------------|
| `baseGain` | Number | Base % gain per session |
| `firstSessionBonus` | Number | Extra % for first session in level |
| `maxSets` | Number | Hard cap — max sets per session |
| `minSets` | Number | Min sets (for grandchild inheritance) |
| `persistenceBonusConfig` | Object | Session # in month → bonus % |
| `rpeBonusConfig` | Object | RPE value → bonus % |
| `parentLevelMapping` | Object | Grandchild level → parent level |

---

## 2. Value Rules by Level Tier

| Level Range | baseGain | firstSessionBonus |
|-------------|----------|-------------------|
| 1–5 | 8% | +3% |
| 6–13 | 6% | +3% |
| 14–19 | 4% | +1.5% |
| 20–25 | 2% | +0.5% |

**First-Session Bonus (confirmed):** Applies when user completes their first session in a new level. L1–13: +3%, L14–19: +1.5%, L20–25: +0.5%.

**Master Programs (Identity level):** For Master programs (Full Body, Upper Body, etc.), `baseGain` is **0**. Their level is purely derived from Child programs — they do not accrue progress directly.

---

## 3. Injection Data: Pull (Child Program)

### Level 1

```json
{
  "programId": "pull",
  "levelNumber": 1,
  "baseGain": 8,
  "firstSessionBonus": 3,
  "maxSets": 20,
  "minSets": 4,
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```

### Level 10

```json
{
  "programId": "pull",
  "levelNumber": 10,
  "baseGain": 6,
  "firstSessionBonus": 3,
  "maxSets": 24,
  "minSets": 6,
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```

### Level 22

```json
{
  "programId": "pull",
  "levelNumber": 22,
  "baseGain": 2,
  "firstSessionBonus": 0.5,
  "maxSets": 28,
  "minSets": 8,
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```

---

## 4. Injection Data: OAP (Grandchild Program — One-Arm Pull-up)

### 10-to-1 Mapping

OAP Level 1 inherits `minSets` and `maxSets` from Pull Level 10.

| OAP Level | Inherits From (Pull) | minSets | maxSets |
|-----------|---------------------|---------|---------|
| 1 | Pull L10 | 6 | 24 |
| 2 | Pull L11 | 6 | 24 |
| … | … | … | … |
| 10 | Pull L19 | 8 | 28 |

### OAP Level 1

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

*Note: `parentLevelMapping: { "1": 10 }` means OAP L1 inherits volume settings from Pull L10.*

### OAP Level 10

```json
{
  "programId": "oap",
  "levelNumber": 10,
  "baseGain": 4,
  "firstSessionBonus": 1.5,
  "maxSets": 28,
  "minSets": 8,
  "parentLevelMapping": { "10": 19 },
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```

### OAP Level 22

*OAP may not have 22 levels; if it does, map to Pull L22+ or use L25 defaults.*

```json
{
  "programId": "oap",
  "levelNumber": 22,
  "baseGain": 2,
  "firstSessionBonus": 0.5,
  "maxSets": 28,
  "minSets": 8,
  "parentLevelMapping": { "22": 25 },
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```

---

## 5. Summary Table (Levels 1, 10, 22)

| Program | Level | baseGain | firstSessionBonus | maxSets | minSets | parentLevelMapping |
|---------|-------|----------|-------------------|---------|---------|--------------------|
| Pull | 1 | 8 | 3 | 20 | 4 | — |
| Pull | 10 | 6 | 3 | 24 | 6 | — |
| Pull | 22 | 2 | 0.5 | 28 | 8 | — |
| OAP | 1 | 6 | 3 | 24 | 6 | {"1":10} |
| OAP | 10 | 4 | 1.5 | 28 | 8 | {"10":19} |
| OAP | 22 | 2 | 0.5 | 28 | 8 | {"22":25} |

---

## 6. persistenceBonusConfig (Monthly Streak)

Same for all levels:

```json
{ "2": 1, "5": 2, "7": 3 }
```

- Session 2 in month: +1%
- Session 5 in month: +2%
- Session 7 in month: +3%
- **Cap at 3%** for Session 10+ (logic applies max 3% for sessions 8, 9, 10, …)

---

## 7. rpeBonusConfig (Safety-First Logic)

Rewards **easier** sessions (lower RPE = less intensity = safer):

```json
{ "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
```

- RPE 1–5: +2% (recovery / light work rewarded)
- RPE 6–7: +1%
- RPE 8–10: 0% (high intensity — no extra bonus)

---

## 8. Master Programs (Identity Level)

For Master programs (`isMaster: true`), set:

```json
{ "baseGain": 0 }
```

Their level is **purely derived** from Child programs. No direct progress accrual.

---

## 9. Corrected JSON (Ready for Sync)

### OAP Level 1

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

### Pull Level 22

```json
{
  "programId": "pull",
  "levelNumber": 22,
  "baseGain": 2,
  "firstSessionBonus": 0.5,
  "maxSets": 28,
  "minSets": 8,
  "persistenceBonusConfig": { "2": 1, "5": 2, "7": 3 },
  "rpeBonusConfig": { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 1, "7": 1, "8": 0, "9": 0, "10": 0 }
}
```
