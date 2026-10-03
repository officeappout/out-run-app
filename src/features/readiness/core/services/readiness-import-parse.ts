/**
 * Pure, Firestore-free parsing for the bulk soldier-list import screen
 * (Stage 5, 03.10.2026, 00-MASTER-PLAN.md §13.75). An officer pastes a
 * WhatsApp message or an Excel column — never a clean CSV — so this
 * cleans up the common real-world mess instead of demanding a specific
 * format:
 *  - manual numbering at the start of a line ("1." / "1)" / "1 -")
 *  - empty lines
 *  - double/irregular internal spacing, leading/trailing whitespace
 *  - Excel paste, which arrives as tab-separated fields per line — only
 *    the FIRST field is taken as the name; every other field is
 *    reported back (never silently dropped — "שום נתון לא נעלם בשקט"),
 *    so the UI can show the officer exactly what was discarded.
 *
 * No gender/duplicate logic here — this module only turns raw pasted
 * text into a clean list of candidate names. Gender is never derived
 * from a name (David, explicit, verbatim: "'נ' אברהם' יכולה להיות נועה
 * או נדב... ניחוש שגוי = כשירות שגויה") — that's an officer decision
 * made in the review step, not parsing.
 */

const NUMBERING_PREFIX_RE = /^\s*\d+\s*[.)\-]\s*/;

export interface ParsedImportRow {
  name: string;
  /** Trimmed, non-empty tab-separated fields AFTER the first (the name) — e.g. phone/age columns from an Excel paste. Never used for anything but display — "what was discarded". */
  extraFields: string[];
}

export interface ParseImportTextResult {
  rows: ParsedImportRow[];
  /** How many rows had at least one non-empty extra field discarded. */
  rowsWithExtraFields: number;
}

export function parseImportText(raw: string): ParseImportTextResult {
  const lines = raw.split(/\r\n|\r|\n/);
  const rows: ParsedImportRow[] = [];
  let rowsWithExtraFields = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    const fields = rawLine.split('\t');
    const extraFields = fields.slice(1).map((f) => f.trim()).filter((f) => f.length > 0);

    const withoutNumbering = fields[0].replace(NUMBERING_PREFIX_RE, '');
    const name = withoutNumbering.replace(/\s+/g, ' ').trim();

    if (!name) continue; // the line was only a number/whitespace once the numbering prefix (if any) is stripped

    if (extraFields.length > 0) rowsWithExtraFields++;
    rows.push({ name, extraFields });
  }

  return { rows, rowsWithExtraFields };
}
