#!/usr/bin/env node
// scripts/ci/tsc-normalize.mjs
// ── Normalize tsc error lines before the baseline comparison ─────────────
//
// tsc prints a union type's members in internal type-id order, which depends
// on module load order. An unrelated commit that adds an import elsewhere can
// therefore turn  '"warmup" | "cooldown" | "recovery"'  into
// '"recovery" | "warmup" | "cooldown"'  in an UNCHANGED error — and an exact
// text compare reports it as "new" (17.10.2026: 7 such false positives blocked
// every PR). This sorts the TOP-LEVEL members of every quoted union in a
// message, so member order no longer matters. Anything else in the line (file,
// TS code, wording, the set of members) is left exactly as is, so a genuinely
// new error still differs.
//
// Usage: node scripts/ci/tsc-normalize.mjs < errors.txt > normalized.txt

const OPEN = { '(': ')', '[': ']', '{': '}', '<': '>' };
const CLOSE = new Set(Object.values(OPEN));

/** Split `text` on " | " at nesting depth 0 (outside brackets and "..." strings). */
export function splitTopLevelUnion(text) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    // "=>" is an arrow, not a closing angle bracket.
    if (c === '>' && text[i - 1] === '=') continue;
    if (OPEN[c]) depth++;
    else if (CLOSE.has(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(' | ', i)) {
      parts.push(text.slice(start, i));
      start = i + 3;
      i += 2;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Sort a type's top-level union members (recursively inside nothing else). */
export function normalizeType(typeText) {
  const parts = splitTopLevelUnion(typeText);
  if (parts.length < 2) return typeText;
  return [...parts].sort().join(' | ');
}

/** Normalize every '…'-quoted type in one error line. */
export function normalizeLine(line) {
  // tsc quotes types with single quotes; types themselves don't contain "'".
  return line.replace(/'([^']*)'/g, (_m, inner) => `'${normalizeType(inner)}'`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    const lines = input.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    process.stdout.write(lines.map(normalizeLine).join('\n') + (lines.length ? '\n' : ''));
  });
}
