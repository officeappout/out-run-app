import { describe, it, expect } from 'vitest';
import { parseImportText } from '../readiness-import-parse';

describe('parseImportText — manual numbering prefixes', () => {
  it('strips "1." style numbering', () => {
    const { rows } = parseImportText('1. Soldier A\n2. Soldier B');
    expect(rows.map((r) => r.name)).toEqual(['Soldier A', 'Soldier B']);
  });

  it('strips "1)" style numbering', () => {
    const { rows } = parseImportText('1) Soldier A\n2) Soldier B');
    expect(rows.map((r) => r.name)).toEqual(['Soldier A', 'Soldier B']);
  });

  it('strips "1 -" style numbering (space before the dash)', () => {
    const { rows } = parseImportText('1 - Soldier A\n2 - Soldier B');
    expect(rows.map((r) => r.name)).toEqual(['Soldier A', 'Soldier B']);
  });

  it('does NOT strip a leading digit that is not followed by ./)/- (a real numeric-looking name)', () => {
    const { rows } = parseImportText('007 James');
    expect(rows.map((r) => r.name)).toEqual(['007 James']);
  });

  it('handles multi-digit numbering', () => {
    const { rows } = parseImportText('12. Soldier L');
    expect(rows.map((r) => r.name)).toEqual(['Soldier L']);
  });
});

describe('parseImportText — empty lines and whitespace', () => {
  it('drops empty lines entirely, including whitespace-only lines', () => {
    const { rows } = parseImportText('Soldier A\n\n   \nSoldier B\n');
    expect(rows.map((r) => r.name)).toEqual(['Soldier A', 'Soldier B']);
  });

  it('collapses internal double/irregular spacing to a single space', () => {
    const { rows } = parseImportText('Soldier    A   B');
    expect(rows[0].name).toBe('Soldier A B');
  });

  it('trims leading and trailing whitespace', () => {
    const { rows } = parseImportText('   Soldier A   ');
    expect(rows[0].name).toBe('Soldier A');
  });

  it('a line that is only a number (no real name after stripping) is dropped, not kept as a blank row', () => {
    const { rows } = parseImportText('1.\nSoldier A');
    expect(rows.map((r) => r.name)).toEqual(['Soldier A']);
  });
});

describe('parseImportText — Excel paste (tab-separated fields)', () => {
  it('takes only the first tab-separated field as the name', () => {
    const { rows } = parseImportText('Soldier A\t050-1234567\t25');
    expect(rows[0].name).toBe('Soldier A');
  });

  it('reports the discarded extra fields per row — nothing vanishes silently', () => {
    const { rows, rowsWithExtraFields } = parseImportText('Soldier A\t050-1234567\t25');
    expect(rows[0].extraFields).toEqual(['050-1234567', '25']);
    expect(rowsWithExtraFields).toBe(1);
  });

  it('a row with no tab has an empty extraFields array and does not count toward rowsWithExtraFields', () => {
    const { rows, rowsWithExtraFields } = parseImportText('Soldier A');
    expect(rows[0].extraFields).toEqual([]);
    expect(rowsWithExtraFields).toBe(0);
  });

  it('a trailing empty tab field (e.g. "Soldier A\\t") does not count as an extra field', () => {
    const { rows, rowsWithExtraFields } = parseImportText('Soldier A\t');
    expect(rows[0].extraFields).toEqual([]);
    expect(rowsWithExtraFields).toBe(0);
  });

  it('mixed paste — some rows plain, some with extra fields — counts only the ones that actually had extra data', () => {
    const { rows, rowsWithExtraFields } = parseImportText('Soldier A\nSoldier B\t050-1111111\nSoldier C');
    expect(rows.map((r) => r.name)).toEqual(['Soldier A', 'Soldier B', 'Soldier C']);
    expect(rowsWithExtraFields).toBe(1);
  });

  it('numbering-prefix stripping applies to the first tab field specifically, not the whole line', () => {
    const { rows } = parseImportText('1. Soldier A\t050-1234567');
    expect(rows[0].name).toBe('Soldier A');
    expect(rows[0].extraFields).toEqual(['050-1234567']);
  });
});

describe('parseImportText — combined real-world mess', () => {
  it('handles a realistic WhatsApp-pasted list with mixed numbering styles and blank lines', () => {
    const raw = '1. כהן\n\n2) לוי\n3 - אברהם\n\nמזרחי';
    const { rows } = parseImportText(raw);
    expect(rows.map((r) => r.name)).toEqual(['כהן', 'לוי', 'אברהם', 'מזרחי']);
  });

  it('an entirely empty paste returns zero rows, not an error', () => {
    const { rows, rowsWithExtraFields } = parseImportText('');
    expect(rows).toEqual([]);
    expect(rowsWithExtraFields).toBe(0);
  });
});
