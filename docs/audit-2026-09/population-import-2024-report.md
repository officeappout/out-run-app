# Population import — CBS Localities File 2024 — write report

Executed 04.10.2026. Source: CBS "קובץ יישובים 2024" (`cbs.gov.il/he/publications/doclib/2019/ishuvim/bycode2024.xlsx`) — approved after voiding an earlier attempt sourced from CBS's Socio-Economic Index 2021 (stale, "Index Population" excludes institutional residents, and its regional-council code namespace collided with unpadded city codes — Ofakim's code `31` silently matched a regional council's row instead of its own, reported and caught before any write).

Script: `scripts/backfill-authority-population-2024.ts` (`--apply` to write). Write targets: `docs/audit-2026-09/population-import-2024-source.json`.

## Schema rule applied

- `city` / `local_council` → that locality's own row in the source file.
- `regional_council` → sum of every locality whose own `סמל רשות מקומית` (authority code) equals ours — member-locality count reported alongside every regional council's figure (not just the summed total), so a 3-of-20-localities undercount would be visible, not hidden inside a plausible-looking number.

## Write summary

**Written: 98. Rejected: 0. Skipped: 0.**

- 96 authorities ← `population` + `populationSource: 'הלמ"ס, קובץ יישובים 2024'` + `populationYear: 2024`.
- 2 of those 96 — **ירושלים**, **תל אביב-יפו** — additionally ← `authorityCode` (`3000` / `5000`). Manually verified and approved by David in person, not a name-match fallback; not extended to any other authority.
- **מגדל תפן, נאות חובב** — matched their row, but the source's population cell is empty. Deliberately excluded from the write targets. Confirmed after the write: both fields remain completely absent on these two docs (not `0`, not `null`) — a blank stays blank.

Additive, single-batch field merge — confirmed via pre-write field-count snapshot vs. post-write count:

| | fields before | fields after | delta |
|---|---|---|---|
| אשקלון | 22 | 25 | +3 (population, populationSource, populationYear) |
| אופקים | 22 | 25 | +3 |
| ירושלים | 20 | 24 | +4 (the 3 above + authorityCode, which it didn't have) |

## Live re-read verification — the value read back from the database, not the value sent

| | population | populationSource | populationYear | authorityCode |
|---|---|---|---|---|
| אשקלון | 166,865 | הלמ"ס, קובץ יישובים 2024 | 2024 | 7100 (pre-existing, unchanged) |
| אופקים | 39,894 | הלמ"ס, קובץ יישובים 2024 | 2024 | 31 (pre-existing, unchanged — confirmed NOT the old collision value 10,169) |
| נחל שורק | 10,682 | הלמ"ס, קובץ יישובים 2024 | 2024 | 5531 (pre-existing, unchanged) |

## Not done — separate PR, data first

`populationSource` / `populationYear` are stored but not yet surfaced in `/admin/authorities`. Per instruction: separate PR, after this data lands.
