import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  interpretRunTimeCell,
  interpretRepsCell,
  interpretGenderCell,
  interpretDateCell,
  parsePastedTextToGrid,
  parseSpreadsheetBufferToGrid,
  parseResultsGrid,
  matchRowToRoster,
} from '../readiness-results-import-parse';

describe('interpretRunTimeCell — the four accepted formats normalize to the same value', () => {
  it('17:42 (colon-separated text)', () => {
    expect(interpretRunTimeCell('17:42')).toEqual({ ok: true, seconds: 1062 });
  });
  it('17.42 (dot-separated text)', () => {
    expect(interpretRunTimeCell('17.42')).toEqual({ ok: true, seconds: 1062 });
  });
  it('1742 (compact digits, no separator)', () => {
    expect(interpretRunTimeCell('1742')).toEqual({ ok: true, seconds: 1062 });
  });
  it('17:42:00 (trailing sub-second segment dropped)', () => {
    expect(interpretRunTimeCell('17:42:00')).toEqual({ ok: true, seconds: 1062 });
  });
  it('a numeric cell holding the compact digits (1742 as a number, not text)', () => {
    expect(interpretRunTimeCell(1742)).toEqual({ ok: true, seconds: 1062 });
  });
  it('the Excel time-serial fraction for 17:42 (0.7375 — the exact trap value)', () => {
    expect(interpretRunTimeCell(0.7375)).toEqual({ ok: true, seconds: 1062 });
  });
  it('a Date object encoding 17:42 in UTC (the cellDates:true shape)', () => {
    const d = new Date(Date.UTC(1899, 11, 31, 17, 42, 0));
    expect(interpretRunTimeCell(d)).toEqual({ ok: true, seconds: 1062 });
  });

  it('empty cell is "not performed" (null), never 0', () => {
    expect(interpretRunTimeCell(null)).toEqual({ ok: true, seconds: null });
    expect(interpretRunTimeCell('')).toEqual({ ok: true, seconds: null });
    expect(interpretRunTimeCell('   ')).toEqual({ ok: true, seconds: null });
  });

  it('a literal 0 is a real value, not treated as empty', () => {
    expect(interpretRunTimeCell('0:00')).toEqual({ ok: true, seconds: 0 });
  });

  it('an unparseable format is rejected with an explanation, never guessed', () => {
    const result = interpretRunTimeCell('ככה ככה');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('פורמט זמן לא מזוהה');
  });

  it('an invalid seconds component (>=60) is rejected, never silently wrapped', () => {
    const result = interpretRunTimeCell('17:95');
    expect(result.ok).toBe(false);
  });
});

describe('interpretRepsCell', () => {
  it('empty cell is "not performed" (null), never 0', () => {
    expect(interpretRepsCell(null)).toEqual({ ok: true, value: null });
    expect(interpretRepsCell('')).toEqual({ ok: true, value: null });
  });
  it('a literal 0 is a real, distinct value', () => {
    expect(interpretRepsCell(0)).toEqual({ ok: true, value: 0 });
    expect(interpretRepsCell('0')).toEqual({ ok: true, value: 0 });
  });
  it('a plain number or numeric string parses normally', () => {
    expect(interpretRepsCell(12)).toEqual({ ok: true, value: 12 });
    expect(interpretRepsCell('12')).toEqual({ ok: true, value: 12 });
  });
  it('a negative or non-numeric value is rejected', () => {
    expect(interpretRepsCell(-1).ok).toBe(false);
    expect(interpretRepsCell('abc').ok).toBe(false);
  });
  it('a Date landing in a reps column is rejected, never silently coerced', () => {
    expect(interpretRepsCell(new Date()).ok).toBe(false);
  });
});

describe('interpretGenderCell', () => {
  it.each(['male', 'M', 'ז', 'זכר'])('%s → male', (raw) => {
    expect(interpretGenderCell(raw)).toEqual({ ok: true, gender: 'male' });
  });
  it.each(['female', 'F', 'נ', 'נקבה'])('%s → female', (raw) => {
    expect(interpretGenderCell(raw)).toEqual({ ok: true, gender: 'female' });
  });
  it('missing or unrecognized gender is rejected, never guessed', () => {
    expect(interpretGenderCell(null).ok).toBe(false);
    expect(interpretGenderCell('').ok).toBe(false);
    expect(interpretGenderCell('x').ok).toBe(false);
  });
});

describe('interpretDateCell', () => {
  it('empty cell means "use the default test date" (null), not an error', () => {
    expect(interpretDateCell(null)).toEqual({ ok: true, iso: null });
  });
  it('a plain date string parses', () => {
    const result = interpretDateCell('2026-10-01');
    expect(result.ok).toBe(true);
  });
  it('a Date object passes through', () => {
    const d = new Date('2026-10-01T00:00:00.000Z');
    expect(interpretDateCell(d)).toEqual({ ok: true, iso: d.toISOString() });
  });
});

describe('parsePastedTextToGrid', () => {
  it('splits lines and tabs, strips numbering prefixes from the first column, empty cells become null', () => {
    const grid = parsePastedTextToGrid('1. דוד כהן\tM\t17:42\t10\t\n2) נועה לוי\tF\t\t\t5');
    expect(grid).toEqual([
      ['דוד כהן', 'M', '17:42', '10', null],
      ['נועה לוי', 'F', null, null, '5'],
    ]);
  });
  it('blank lines are skipped entirely', () => {
    const grid = parsePastedTextToGrid('דוד כהן\tM\n\n\nנועה לוי\tF');
    expect(grid.length).toBe(2);
  });
});

describe('parseResultsGrid — header detection and positional fallback', () => {
  it('no header row: positional order name/gender/run/pullups/dips', () => {
    const { rows, hadHeaderRow } = parseResultsGrid([
      ['דוד כהן', 'M', '17:42', '10', '8'],
    ]);
    expect(hadHeaderRow).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'דוד כהן', gender: 'male', runSeconds: 1062, pullupsReps: 10, dipsReps: 8 });
  });

  it('a real header row is recognized and drives column mapping, even reordered', () => {
    const { rows, hadHeaderRow } = parseResultsGrid([
      ['מקבילים', 'שם', 'עליות מתח', 'מגדר', 'ריצת 3,000'],
      ['8', 'דוד כהן', '10', 'M', '17:42'],
    ]);
    expect(hadHeaderRow).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'דוד כהן', gender: 'male', runSeconds: 1062, pullupsReps: 10, dipsReps: 8 });
  });

  it('a single coincidental header-like cell in real data is NOT mistaken for a header row', () => {
    // "שם" appears nowhere here — a realistic near-miss: only one cell
    // (the name itself happening to be exactly a column label) could
    // ever trigger a false match, and the >=2-match rule guards it.
    const { hadHeaderRow } = parseResultsGrid([
      ['דוד כהן', 'M', '17:42', '10', '8'],
      ['נועה לוי', 'F', '18:00', '8', '6'],
    ]);
    expect(hadHeaderRow).toBe(false);
  });

  it('empty-named rows are dropped', () => {
    const { rows } = parseResultsGrid([
      ['', 'M', '17:42', '10', '8'],
      ['דוד כהן', 'M', '17:42', '10', '8'],
    ]);
    expect(rows).toHaveLength(1);
  });

  it('a per-row date-override column (6th) is captured independently', () => {
    const { rows } = parseResultsGrid([
      ['דוד כהן', 'M', '17:42', '10', '8', '2026-09-20'],
    ]);
    expect(rows[0].dateOverrideIso).not.toBeNull();
  });
});

describe('matchRowToRoster — mode ב never creates a soldier, ambiguity is reported not guessed', () => {
  const roster = [
    { id: 's1', name: 'דוד כהן' },
    { id: 's2', name: 'נועה לוי' },
    { id: 's3', name: 'דוד כהן' }, // same name as s1 — a real, foreseeable case
  ];

  it('a name with no match at all is reported, never silently created', () => {
    expect(matchRowToRoster('מישהו אחר', roster)).toEqual({ kind: 'not_found' });
  });

  it('a name matching exactly one roster entry resolves cleanly', () => {
    expect(matchRowToRoster('נועה לוי', roster)).toEqual({ kind: 'matched', soldierId: 's2' });
  });

  it('a name matching more than one roster entry is reported as ambiguous, with every candidate — never guessed', () => {
    const result = matchRowToRoster('דוד כהן', roster);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidateIds.sort()).toEqual(['s1', 's3']);
    }
  });
});

describe('mandatory equivalence — the same file with a run column formatted as Excel TIME vs as TEXT must give an identical result', () => {
  it('produces the same parsed seconds value either way', () => {
    // Sheet A: the run column is a genuine Excel time-formatted cell —
    // built via XLSX's own write path (t:'n' numeric cell, z: a time
    // number format), the exact shape a real spreadsheet produces when
    // auto-formatting "17:42" as a time value.
    const wsTime = XLSX.utils.aoa_to_sheet([['דוד כהן', 'M', '', '10', '8']]);
    wsTime['C1'] = { t: 'n', v: 0.7375, z: 'h:mm' };
    const wbTime = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbTime, wsTime, 'Sheet1');
    const bufferTime = XLSX.write(wbTime, { type: 'array', bookType: 'xlsx' });

    // Sheet B: the exact same run value, but as a plain TEXT cell.
    const wsText = XLSX.utils.aoa_to_sheet([['דוד כהן', 'M', '17:42', '10', '8']]);
    const wbText = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbText, wsText, 'Sheet1');
    const bufferText = XLSX.write(wbText, { type: 'array', bookType: 'xlsx' });

    const gridTime = parseSpreadsheetBufferToGrid(bufferTime, XLSX);
    const gridText = parseSpreadsheetBufferToGrid(bufferText, XLSX);

    const rowsTime = parseResultsGrid(gridTime).rows;
    const rowsText = parseResultsGrid(gridText).rows;

    expect(rowsTime[0].runSeconds).toBe(1062);
    expect(rowsText[0].runSeconds).toBe(1062);
    expect(rowsTime[0].runSeconds).toBe(rowsText[0].runSeconds);
  });
});
