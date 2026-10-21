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

/** Split on a separator at depth 0 (outside brackets and strings). */
function splitTopLevel(text, sep) {
  if (sep === ' | ') return splitTopLevelUnion(text);
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
    if (c === '>' && text[i - 1] === '=') continue;
    if (OPEN[c]) depth++;
    else if (CLOSE.has(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Normalize the inside of every bracket group recursively: unions are sorted at every depth
 * (Set<"push" | "pull"> too), object members ('a: X; b: Y') are sorted, and an object type
 * tsc TRUNCATED with "..." collapses to "{…}" — its visible keys depend on member order, so
 * they can't be compared (21.10.2026: DomainProgress map key order drifted on main).
 */
function normalizeNested(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const j = text.indexOf('"', i + 1);
      const end = j === -1 ? text.length : j;
      out += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (OPEN[c] && !(c === '<' && text[i - 1] === ' ' && text[i + 1] === '=')) {
      // find the matching close
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        const d = text[j];
        if (d === '"') { const k = text.indexOf('"', j + 1); if (k === -1) break; j = k; continue; }
        if (d === '>' && text[j - 1] === '=') continue;
        if (OPEN[d]) depth++;
        else if (CLOSE.has(d)) { depth--; if (depth === 0) break; }
      }
      if (j >= text.length) {
        // tsc truncates long types mid-object ("{ a?: X; b?: Y; ..." with no closing brace).
        out += c === '{' && /\.\.\./.test(text.slice(i)) ? '{…' : text.slice(i);
        break;
      }
      const inner = text.slice(i + 1, j);
      let norm;
      if (c === '{' && /\.\.\./.test(inner)) norm = '…';
      else if (c === '{') norm = ' ' + splitTopLevel(inner.trim().replace(/;$/, ''), '; ').map((m) => normalizeMember(m.trim())).filter(Boolean).sort().join('; ') + ' ';
      else norm = normalizeType(inner);
      out += c + norm + OPEN[c];
      i = j;
      continue;
    }
    out += c;
  }
  return out;
}

/** An object member "name?: T": keep the name, normalize only the type after the colon. */
function normalizeMember(member) {
  const m = /^([^:"'(){}<>\[\]]+:\s)([\s\S]*)$/.exec(member);
  return m ? m[1] + normalizeType(m[2]) : normalizeType(member);
}

/** Sort a type's union members at every depth (see normalizeNested). */
export function normalizeType(typeText) {
  const parts = splitTopLevelUnion(typeText).map((p) => normalizeNested(p));
  if (parts.length < 2) return parts[0];
  return [...parts].sort().join(' | ');
}

/** Normalize every '…'-quoted type in one error line. */
export function normalizeLine(line) {
  // tsc quotes types with single quotes; types themselves don't contain "'".
  // English contractions in tsc's wording ("can't", "doesn't") are not type quotes — mask
  // their apostrophe so the '…' pairing stays aligned, then put it back.
  const masked = line.replace(/([a-z])'([a-z])/gi, '$1\u0000$2');
  return masked
    .replace(/'([^']*)'/g, (_m, inner) => `'${normalizeType(inner)}'`)
    .replace(/\u0000/g, "'");
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
