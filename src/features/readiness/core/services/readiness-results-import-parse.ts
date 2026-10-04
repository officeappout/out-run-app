/**
 * Pure, Firestore-free parsing for the results bulk-import screen
 * (04.10.2026, 00-MASTER-PLAN.md §13.83). Two input paths — paste
 * (tab-separated) and file upload (.xlsx/.csv) — each has its OWN
 * conversion function into the SAME CellValue[][] grid shape; everything
 * downstream (header detection, column mapping, per-cell interpretation)
 * is ONE shared function (parseResultsGrid), never duplicated per input
 * type (David, explicit: "אל תכתוב שני מסלולי עיבוד").
 *
 * Columns, fixed order when there's no header row: שם · מגדר · ריצת
 * 3,000 · עליות מתח · מקבילים — plus an optional 6th date-override
 * column. With a header row, columns are identified by label instead
 * (reorder-tolerant); the header row is recognized only when at least 2
 * cells match a known label, so a real data row that happens to start
 * with "שם" in some cell is never mistaken for one.
 *
 * Every cell is interpreted EXACTLY once, the same way regardless of
 * whether it arrived as pasted text or a parsed spreadsheet cell — see
 * interpretRunTimeCell's own doc comment for the Excel time-serial trap
 * this is built to defuse.
 */

export type CellValue = string | number | Date | null;

const CANONICAL_COLUMNS = ['name', 'gender', 'run', 'pullups', 'dips', 'date'] as const;
type CanonicalColumn = typeof CANONICAL_COLUMNS[number];

const HEADER_LABELS: Record<CanonicalColumn, string[]> = {
  name: ['שם', 'name'],
  gender: ['מגדר', 'מין', 'gender', 'sex'],
  run: ['ריצת 3,000', 'ריצת 3000', 'ריצה', '3000', 'run'],
  pullups: ['עליות מתח', 'מתח', 'pullups', 'pull-ups', 'pull ups'],
  dips: ['מקבילים', 'dips'],
  date: ['תאריך', 'date'],
};

function normalizeHeaderText(raw: CellValue): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[,]/g, '');
}

/**
 * A header row is recognized only when at least 2 of its cells match a
 * known label — one match alone (e.g. a real soldier whose name
 * happens to be "שם") is not enough proof. Matched columns map by
 * position; unmatched cells are simply ignored (not every column needs
 * a recognized header, e.g. a stray extra column).
 */
function detectHeaderColumnMap(firstRow: CellValue[]): Record<number, CanonicalColumn> | null {
  const map: Record<number, CanonicalColumn> = {};
  let matches = 0;
  firstRow.forEach((cell, i) => {
    const norm = normalizeHeaderText(cell);
    if (!norm) return;
    for (const col of CANONICAL_COLUMNS) {
      if (HEADER_LABELS[col].some((label) => norm.includes(label.toLowerCase()))) {
        map[i] = col;
        matches++;
        return;
      }
    }
  });
  return matches >= 2 ? map : null;
}

// ── Per-cell interpreters ────────────────────────────────────────────────

const MALE_TOKENS = ['male', 'm', 'ז', 'זכר'];
const FEMALE_TOKENS = ['female', 'f', 'נ', 'נקבה'];

export function interpretGenderCell(raw: CellValue): { ok: true; gender: 'male' | 'female' } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'מגדר חסר' };
  }
  const norm = raw.trim().toLowerCase();
  if (MALE_TOKENS.includes(norm)) return { ok: true, gender: 'male' };
  if (FEMALE_TOKENS.includes(norm)) return { ok: true, gender: 'female' };
  return { ok: false, error: `מגדר לא מזוהה: "${raw}"` };
}

export function interpretRepsCell(raw: CellValue): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    return { ok: true, value: null }; // empty cell = not performed, never 0
  }
  if (raw instanceof Date) {
    return { ok: false, error: 'ערך לא תקין (תאריך במקום מספר חזרות)' };
  }
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else {
    n = Number(raw.trim().replace(',', '.'));
  }
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `ערך לא תקין: "${String(raw)}"` };
  }
  return { ok: true, value: n };
}

function parseCompactDigits(digits: string): { ok: true; seconds: number } | { ok: false; error: string } {
  if (digits.length < 3) {
    return { ok: false, error: `פורמט זמן לא מזוהה: "${digits}"` };
  }
  const seconds = parseInt(digits.slice(-2), 10);
  const minutes = parseInt(digits.slice(0, -2), 10);
  if (seconds > 59) {
    return { ok: false, error: `ערך זמן לא תקין: "${digits}"` };
  }
  return { ok: true, seconds: minutes * 60 + seconds };
}

/**
 * Accepts 17:42 · 17.42 · 1742 · 17:42:00 — all mm:ss, all normalizing
 * to the SAME value in seconds (a trailing third segment, e.g. the
 * ":00" in "17:42:00", is treated as sub-second precision this domain
 * never needs and is simply dropped, not added).
 *
 * The Excel trap (David, 04.10.2026, read twice): a cell the officer
 * typed "17:42" into, which Excel auto-formatted as a TIME value, is
 * stored internally as a fraction of a 24-hour day — Excel's own
 * "17 hours, 42 minutes" reading of a clock face, NOT the officer's
 * actual intent of "17 minutes, 42 seconds". Reading this cell can
 * surface as either a raw (0,1) number or a JS Date object — handled
 * here as TWO separate branches below, but see
 * parseSpreadsheetBufferToGrid's own doc comment for why the real file-
 * reading path deliberately avoids ever producing the Date-object case
 * (confirmed empirically: it's timezone-dependent and was caught giving
 * a wrong answer on this exact machine before being disabled). The
 * (0,1)-fraction branch is the one that actually runs in production;
 * the Date branch stays as explicit, correct handling for any caller
 * that does pass one. Both, when reached, recover the original 17m42s
 * by reinterpreting "hours" as "minutes" and "minutes" as "seconds". A
 * plain text cell or a bare compact number (1742) never goes through
 * this reinterpretation at all — only a genuine Date object or a (0,1)
 * fraction does.
 */
export function interpretRunTimeCell(raw: CellValue): { ok: true; seconds: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    return { ok: true, seconds: null }; // empty cell = not performed, never 0
  }

  if (raw instanceof Date) {
    const hours = raw.getUTCHours();
    const minutes = raw.getUTCMinutes();
    if (minutes > 59) return { ok: false, error: `ערך זמן לא תקין: ${raw.toISOString()}` };
    return { ok: true, seconds: hours * 60 + minutes };
  }

  if (typeof raw === 'number') {
    if (raw > 0 && raw < 1) {
      // Excel time-serial fraction of a day — the trap.
      const totalSecondsOfDay = Math.round(raw * 86400);
      const hours = Math.floor(totalSecondsOfDay / 3600);
      const minutes = Math.floor((totalSecondsOfDay % 3600) / 60);
      if (minutes > 59) return { ok: false, error: `ערך זמן לא תקין: ${raw}` };
      return { ok: true, seconds: hours * 60 + minutes };
    }
    // A plain numeric cell — compact mmss (e.g. 1742), never raw seconds.
    return parseCompactDigits(String(Math.trunc(raw)));
  }

  const text = raw.trim();
  if (/^\d+$/.test(text)) {
    return parseCompactDigits(text);
  }
  const match = text.match(/^(\d{1,3})[:.](\d{1,2})(?:[:.](\d{1,2}))?$/);
  if (match) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    if (seconds > 59) return { ok: false, error: `ערך זמן לא תקין: "${raw}"` };
    return { ok: true, seconds: minutes * 60 + seconds };
  }
  return { ok: false, error: `פורמט זמן לא מזוהה: "${raw}" — נתמך: 17:42 · 17.42 · 1742 · 17:42:00` };
}

/** Excel's own date epoch is 1899-12-30 (its well-known leap-year-bug
 *  offset included) — 25569 is the number of days from there to the
 *  Unix epoch (1970-01-01), the standard conversion constant. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;

export function interpretDateCell(raw: CellValue): { ok: true; iso: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    return { ok: true, iso: null }; // absent = use the top-level default test date
  }
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { ok: false, error: 'תאריך לא תקין' };
    return { ok: true, iso: raw.toISOString() };
  }
  if (typeof raw === 'number') {
    if (raw < 1) return { ok: false, error: `תאריך לא תקין: ${raw}` };
    const ms = (raw - EXCEL_EPOCH_OFFSET_DAYS) * 86400 * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { ok: false, error: `תאריך לא תקין: ${raw}` };
    return { ok: true, iso: d.toISOString() };
  }
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `תאריך לא מזוהה: "${raw}"` };
  }
  return { ok: true, iso: d.toISOString() };
}

// ── Input #1: paste (tab-separated) → grid ──────────────────────────────

const NUMBERING_PREFIX_RE = /^\s*\d+\s*[.)\-]\s*/;

export function parsePastedTextToGrid(raw: string): CellValue[][] {
  const lines = raw.split(/\r\n|\r|\n/);
  const grid: CellValue[][] = [];
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const fields = rawLine.split('\t');
    fields[0] = fields[0].replace(NUMBERING_PREFIX_RE, '');
    grid.push(fields.map((f) => {
      const trimmed = f.trim();
      return trimmed.length > 0 ? trimmed : null;
    }));
  }
  return grid;
}

// ── Input #2: file upload (.xlsx/.csv) → grid ───────────────────────────

/**
 * Dynamic import only — the xlsx (SheetJS) library never belongs in the
 * main bundle; it's loaded exactly once, the moment an officer actually
 * picks a file (David, explicit).
 *
 * Deliberately WITHOUT cellDates:true (confirmed empirically, not just
 * in theory, while building this): SheetJS's date-cell-to-JS-Date
 * conversion is NOT timezone-neutral — it builds the Date so that the
 * HOST's LOCAL getHours()/getMinutes() recover the displayed clock
 * reading, with the UTC fields shifting by whatever offset the host
 * timezone's historical rules apply to the Excel epoch date (1899-12-30
 * — predates standardized timezones everywhere). Concretely: reading a
 * "17:42"-formatted cell on an Asia/Jerusalem host round-tripped through
 * a real XLSX.write→XLSX.read cycle came back as
 * `1899-12-30T15:21:20.000Z` — a 2h20m40s offset, not the clean 2:00 any
 * standard-timezone assumption would expect (Jerusalem's IANA zoneinfo
 * entry still carries its pre-1918 Local Mean Time rule for dates this
 * old). getUTCHours() is wrong there; getHours() happens to be right
 * only because THIS specific host's zone info recovers it — a server or
 * a browser in a different timezone would silently get a different,
 * wrong answer from the exact same cell. Leaving cellDates off instead
 * forces every date/time cell to surface as the plain (0,1) day
 * fraction — the SAME value regardless of host timezone, computed by
 * pure arithmetic, consumed by interpretRunTimeCell's/interpretDateCell's
 * numeric branches. Those functions still handle an actual Date
 * instance explicitly (David's requirement) as defensive, correct
 * fallback code — just not reachable via THIS read path, on purpose.
 */
export async function parseSpreadsheetFileToGrid(file: File): Promise<CellValue[][]> {
  const [XLSX, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()]);
  return parseSpreadsheetBufferToGrid(buffer, XLSX);
}

/**
 * Split out from parseSpreadsheetFileToGrid purely for testability — a
 * browser File object has no faithful equivalent in a plain vitest/node
 * run, while an ArrayBuffer (what XLSX.read actually needs) is trivial
 * to construct directly in a test, including via XLSX's own write path
 * for the mandatory text-cell-vs-time-cell equivalence check.
 */
export function parseSpreadsheetBufferToGrid(buffer: ArrayBuffer, XLSX: typeof import('xlsx')): CellValue[][] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return rows.map((row) => row.map((cell) => (cell === undefined ? null : cell)));
}

// ── Shared flow: grid → structured rows ─────────────────────────────────

export interface ParsedResultsRow {
  rowIndex: number;
  name: string | null;
  gender: 'male' | 'female' | null;
  genderError: string | null;
  runSeconds: number | null;
  runError: string | null;
  pullupsReps: number | null;
  pullupsError: string | null;
  dipsReps: number | null;
  dipsError: string | null;
  dateOverrideIso: string | null;
  dateError: string | null;
}

export interface ParseResultsGridOutcome {
  rows: ParsedResultsRow[];
  hadHeaderRow: boolean;
}

export function parseResultsGrid(grid: CellValue[][]): ParseResultsGridOutcome {
  if (grid.length === 0) return { rows: [], hadHeaderRow: false };

  const headerMap = detectHeaderColumnMap(grid[0]);
  const hadHeaderRow = headerMap !== null;
  const dataRows = hadHeaderRow ? grid.slice(1) : grid;

  // No header row — David's fixed positional order.
  const columnMap: Record<number, CanonicalColumn> = headerMap ?? {
    0: 'name', 1: 'gender', 2: 'run', 3: 'pullups', 4: 'dips', 5: 'date',
  };

  const rows: ParsedResultsRow[] = dataRows
    .map((cells, rowIndex): ParsedResultsRow => {
      const byColumn: Partial<Record<CanonicalColumn, CellValue>> = {};
      cells.forEach((cell, i) => {
        const col = columnMap[i];
        if (col) byColumn[col] = cell;
      });

      const name = typeof byColumn.name === 'string' ? byColumn.name.trim().replace(/\s+/g, ' ') : null;

      const genderResult = interpretGenderCell(byColumn.gender ?? null);
      const runResult = interpretRunTimeCell(byColumn.run ?? null);
      const pullupsResult = interpretRepsCell(byColumn.pullups ?? null);
      const dipsResult = interpretRepsCell(byColumn.dips ?? null);
      const dateResult = interpretDateCell(byColumn.date ?? null);

      return {
        rowIndex,
        name,
        gender: genderResult.ok ? genderResult.gender : null,
        genderError: genderResult.ok ? null : genderResult.error,
        runSeconds: runResult.ok ? runResult.seconds : null,
        runError: runResult.ok ? null : runResult.error,
        pullupsReps: pullupsResult.ok ? pullupsResult.value : null,
        pullupsError: pullupsResult.ok ? null : pullupsResult.error,
        dipsReps: dipsResult.ok ? dipsResult.value : null,
        dipsError: dipsResult.ok ? null : dipsResult.error,
        dateOverrideIso: dateResult.ok ? dateResult.iso : null,
        dateError: dateResult.ok ? null : dateResult.error,
      };
    })
    // A fully-empty line (no name at all once trimmed) is skipped, same
    // spirit as readiness-import-parse.ts's own numbering/blank-line
    // cleanup — never silently kept as a nameless row.
    .filter((r) => r.name !== null && r.name !== '');

  return { rows, hadHeaderRow };
}

// ── Mode ב: matching a parsed row's name against the existing roster ────

export type RosterMatchResult =
  | { kind: 'not_found' }
  | { kind: 'matched'; soldierId: string }
  | { kind: 'ambiguous'; candidateIds: string[] };

/**
 * 'existing_roster' mode never creates a soldier (David: "לעולם לא") —
 * a typo'd name would otherwise silently create a phantom record and
 * inflate the denominator while looking perfectly normal on screen,
 * exactly the failure class the name-only import's own duplicate
 * handling was already built to avoid. Exact match only (same
 * convention the existing import page's own existingNames Set already
 * uses) — never a fuzzy/partial match that could silently misroute a
 * result to the wrong person. More than one roster entry sharing a name
 * is reported as ambiguous, never guessed — the officer picks in the
 * review step; this function never does.
 */
export function matchRowToRoster(name: string, roster: { id: string; name: string }[]): RosterMatchResult {
  const matches = roster.filter((s) => s.name === name);
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length === 1) return { kind: 'matched', soldierId: matches[0].id };
  return { kind: 'ambiguous', candidateIds: matches.map((m) => m.id) };
}
