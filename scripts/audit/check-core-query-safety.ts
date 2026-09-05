// Sanity check (David, 05.09.2026): every committed SQL query in
// scripts/audit that FILTERS (=, IN, LIKE) on the workout_exercises.domain
// or .movement_group columns must also reference exercise_role in the same
// statement.
//
// Root cause this guards against: domain/movement_group is computed purely
// from the raw exercise's movementGroup -- it says NOTHING about whether
// that row is the workout's real, selected 'main' exercise for that domain,
// or a warmup/cooldown/reinforcement/recovery item that merely happens to
// share the same movementGroup (e.g. the core-tabata follow-along ladder
// leaking into the warmup slot, warmup.service.ts -- fixed 05.09.2026, see
// docs/workout-engine/09-CORE-TABATA.md's follow-up investigation). A
// domain='core' count without an exercise_role='main' filter silently
// counts those leaked rows as "has core exercise" -- this exact mistake
// inflated every "percent workouts with core" / "avg core per workout" /
// "full-body without core" number reported in 08-CORE.md,
// 09-CORE-TABATA.md section 5, and 03-CHANGES.md Addendum 5 before
// correction (e.g. full-body-without-core: reported 58.3%, true 83.0%).
//
// This is a heuristic, not a SQL parser: it extracts backtick template-
// literal strings from each .ts file and flags any one containing an actual
// domain/movement_group comparison (=, IN, LIKE against a value) without
// exercise_role appearing anywhere in the same literal. Silence a genuine
// false positive with an inline "core-query-safety: ok (reason)" comment
// inside the query string.
//
// Run: npx tsx scripts/audit/check-core-query-safety.ts
// Exits non-zero (and lists every violation) if any query is unsafe.
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_DIR = path.resolve(__dirname);
const SUPPRESS_MARKER = 'core-query-safety: ok';

// Requires an actual FILTER (=, IN (, LIKE) against domain/movement_group —
// not just any mention of the word (CREATE TABLE column decls, log
// messages, INSERT column lists, etc. don't count).
const COLUMN_FILTER_PATTERN = /\b(?:\w+\.)?(domain|movement_group)\s*(=|!=|<>|IN\s*\(|LIKE)/i;
const ROLE_PATTERN = /\bexercise_role\b/i;

interface Violation {
  file: string;
  snippet: string;
}

function extractTemplateLiterals(content: string): string[] {
  const literals: string[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '`') {
      let j = i + 1;
      let buf = '';
      while (j < content.length && content[j] !== '`') {
        if (content[j] === '\\' && j + 1 < content.length) {
          buf += content[j] + content[j + 1];
          j += 2;
          continue;
        }
        buf += content[j];
        j++;
      }
      literals.push(buf);
      i = j + 1;
    } else {
      i++;
    }
  }
  return literals;
}

function checkFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations: Violation[] = [];
  for (const literal of extractTemplateLiterals(content)) {
    if (!COLUMN_FILTER_PATTERN.test(literal)) continue;
    if (ROLE_PATTERN.test(literal)) continue;
    if (literal.includes(SUPPRESS_MARKER)) continue;
    const snippet = literal.trim().slice(0, 200).replace(/\s+/g, ' ');
    violations.push({ file: path.relative(process.cwd(), filePath), snippet });
  }
  return violations;
}

function main() {
  const files = fs.readdirSync(AUDIT_DIR)
    .filter(f => f.endsWith('.ts') && !f.startsWith('_tmp'))
    .map(f => path.join(AUDIT_DIR, f));

  const allViolations: Violation[] = [];
  for (const file of files) {
    allViolations.push(...checkFile(file));
  }

  if (allViolations.length === 0) {
    console.log('[core-query-safety] OK — no domain/movement_group query found without exercise_role.');
    process.exit(0);
  }

  console.error(`[core-query-safety] FOUND ${allViolations.length} unsafe quer${allViolations.length === 1 ? 'y' : 'ies'}:\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:`);
    console.error(`    "${v.snippet}${v.snippet.length >= 200 ? '...' : ''}"`);
    console.error('');
  }
  console.error(
    'Add exercise_role to the query (typically exercise_role=\'main\'), or if the ' +
    `query genuinely doesn't need it, silence with a "-- ${SUPPRESS_MARKER} (reason)" comment inside it.`,
  );
  process.exit(1);
}

main();
