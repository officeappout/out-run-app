/**
 * scripts/audit/build-coach-references.ts — READ ONLY on the owner's exported coach
 * sheets (CSV), writes docs/workout-engine/coach-sheet-references.json.
 *
 * Why an extra layer next to the 614-workout corpus (legacy-workouts.sqlite): the
 * corpus has no difficulty labels, no 10-12 minute sessions and no written ordering
 * rule. The sheets add exactly those three things:
 *   - "כל הגוף" (programs__17): full-body workouts per level 1-6 × קל / בינוני / מאתגר
 *     (→ bolts 1/2/3), 20-40 min, "sets x reps", and the stated principle:
 *     upper body first, then lower body, then core; sets by level.
 *   - "תחתון תוכניות" (programs__18): lower-body sessions of 12 and 18 minutes
 *     (levels 1-2) and block-format sessions (levels 1/4/7/10/13, 15-35 min).
 * Exercise names are classified into movement families (push / pull / legs / core)
 * by keyword — the comparison is at family level, not exercise id.
 *
 * Run: npx tsx scripts/audit/build-coach-references.ts [sheetsDir]
 *      default sheetsDir: ../appout-website/training-audit/sheets
 */
import * as fs from 'fs';
import * as path from 'path';

const SHEETS = process.argv[2] ?? path.resolve(process.cwd(), '../appout-website/training-audit/sheets');
const OUT = path.join(process.cwd(), 'docs/workout-engine/coach-sheet-references.json');

export interface RefExercise { name: string; family: string; sets: number; repMin: number; repMax: number; timed: boolean; perSide: boolean }
export interface CoachReference {
  id: string; source: string; category: 'full_body' | 'lower_body';
  level: number; difficulty: 1 | 2 | 3 | null; minutes: number; restSec: number | null;
  exercises: RefExercise[];
}

const FAMILY_RULES: [RegExp, string][] = [
  [/פלאנק|בטן|שולחן הפוך|ישיבת L|עליות רגליים|חרק|טוויסט|קראנץ|בננה|החזקה בשכיבות סמיכה/, 'core'],
  [/שכיבות ?ש?מיכה|שכיבות סמיכה|מקבילים|פשיטת מרפק|דחיפ/, 'push'],
  [/חתירות|מתח|תלייה|משיכ/, 'pull'],
  [/סקוואט|לאנץ|לאנג|היפ ?טראסט|תאומים|דד ?ליפט|מדרגה|בוקר טוב|גוד מורנינג|נורדיק|כפיפת ברך|פשיטת ברך|פשיטת אגן|קפיצה|ברך לקיר|עליות ספסל|כפיפת ירך|קוזק/, 'legs'],
];
const family = (name: string) => FAMILY_RULES.find(([re]) => re.test(name))?.[1] ?? 'other';

function readCsv(file: string): string[][] {
  const text = fs.readFileSync(path.join(SHEETS, file), 'utf8');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const find = (prefix: string) => fs.readdirSync(SHEETS).find(f => f.startsWith(prefix))!;

function parseFullBody(): CoachReference[] {
  const out: CoachReference[] = [];
  let level = 0; let cur: CoachReference | null = null;
  const DIFF: Record<string, 1 | 2 | 3> = { 'קל': 1, 'בינוני': 2, 'מאתגר': 3 };
  for (const r of readCsv(find('programs__17_'))) {
    const line = r.filter(Boolean).join(' ').trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^רמה (\d+):/))) { level = Number(m[1]); continue; }
    if ((m = line.match(/^(קל|בינוני|מאתגר) \((\d+) דק\):/))) {
      cur = { id: `fullbody-L${level}-${m[1]}`, source: 'programs__17_כל_הגוף', category: 'full_body', level, difficulty: DIFF[m[1]], minutes: Number(m[2]), restSec: null, exercises: [] };
      out.push(cur); continue;
    }
    if (!cur || !(m = line.match(/^(.+?):\s*(\d+)x(\d+)(?:-(\d+))?(.*)$/))) continue;
    const rest = m[5];
    const restM = rest.match(/מנוחה בין תרגילים:\s*(\d+)\s*(שניות|דקות)/);
    if (restM) cur.restSec = Number(restM[1]) * (restM[2] === 'דקות' ? 60 : 1);
    cur.exercises.push({
      name: m[1].trim(), family: family(m[1]), sets: Number(m[2]), repMin: Number(m[3]), repMax: Number(m[4] ?? m[3]),
      timed: /שניות/.test(rest.split('מנוחה')[0]), perSide: /לכל (רגל|צד)/.test(rest),
    });
  }
  return out;
}

function parseLower(): CoachReference[] {
  const rows = readCsv(find('programs__18_'));
  const out: CoachReference[] = [];
  // Table part: "רמה N, זמן אימון 12 דקות, חזרות, סטים,, זמן אימון 18 דקות, ..."
  let level = 0; let refs: CoachReference[] = [];
  for (const r of rows) {
    if (/^◇/.test(r[0] ?? '')) break;
    const m = (r[0] ?? '').match(/^רמה (\d+)/);
    if (m) {
      level = Number(m[1]);
      refs = [12, 18].map(min => ({ id: `lower-L${level}-${min}min`, source: 'programs__18_תחתון_תוכניות', category: 'lower_body' as const, level, difficulty: null, minutes: min, restSec: null, exercises: [] }));
      out.push(...refs); continue;
    }
    for (const [i, col] of [[0, 1], [1, 5]] as const) {
      const name = (r[col] ?? '').trim(); const reps = Number(r[col + 1]); const sets = Number(r[col + 2]);
      if (refs[i] && name && reps > 0 && sets > 0 && !/^0\./.test(name)) refs[i].exercises.push({ name, family: family(name), sets, repMin: reps, repMax: reps, timed: false, perSide: false });
    }
  }
  // Block part: 5 columns per workout, headers "◇── בסיס|אתגר רמה N (M דקות) ──◇"
  const open: Record<number, CoachReference | null> = {};
  const lastEx: Record<number, RefExercise | null> = {};
  let started = false;
  for (const r of rows) {
    for (let c = 0; c < r.length; c += 5) {
      const cell = (r[c] ?? '').trim();
      let m: RegExpMatchArray | null;
      if ((m = cell.match(/^◇─+ (בסיס|אתגר) רמה (\d+) \((\d+) דקות\)/))) {
        started = true;
        const ref: CoachReference = { id: `lower-L${m[2]}-${m[1] === 'בסיס' ? 'base' : 'challenge'}-${m[3]}min`, source: 'programs__18_תחתון_תוכניות', category: 'lower_body', level: Number(m[2]), difficulty: m[1] === 'בסיס' ? 2 : 3, minutes: Number(m[3]), restSec: null, exercises: [] };
        out.push(ref); open[c] = ref; lastEx[c] = null; continue;
      }
      if (!started || !open[c]) continue;
      if ((m = cell.match(/^[❶❷❸❹❺❻❼❽]\s*(.+)$/))) { lastEx[c] = { name: m[1].trim(), family: family(m[1]), sets: 0, repMin: 0, repMax: 0, timed: false, perSide: false }; continue; }
      if ((m = cell.match(/סטים:\s*(\d+)\s*│\s*חזרות:\s*(\d+)(?:-(\d+))?(.*?)│\s*מנוחה:\s*(\d+):(\d+)/)) && lastEx[c]) {
        const e = lastEx[c]!;
        e.sets = Number(m[1]); e.repMin = Number(m[2]); e.repMax = Number(m[3] ?? m[2]); e.perSide = /כל רגל/.test(m[4]);
        open[c]!.exercises.push(e); lastEx[c] = null;
        const rest = Number(m[5]) * 60 + Number(m[6]);
        if (rest >= 60) open[c]!.restSec = rest;
      }
    }
  }
  // Block-format cells can bleed across sections in the CSV export (a column that
  // keeps reading the next section's rows); keep only plausibly-parsed sessions.
  return out.filter(r => r.exercises.length >= 3 && r.exercises.length <= 8);
}

/** Rules stated in the sheets themselves (quoted principle in programs__17 row 1). */
export const COACH_RULES = {
  order: 'upper → lower → core (programs__17 row 1: "התחלה עם פלג גוף עליון, מעבר לפלג גוף תחתון, ולבסוף תרגילי ליבה")',
  setsByLevel: 'levels 1-2: 2 sets per exercise; level 3+: 3 sets (core holds stay at 2) — programs__17',
  warmupCooldown: 'warm-up 5 min + cool-down 5 min, NOT counted in the session minutes — programs__18 block headers',
};

function main() {
  const refs = [...parseFullBody(), ...parseLower()];
  const doc = { generatedAt: new Date().toISOString().slice(0, 10), sheetsDir: path.basename(SHEETS), rules: COACH_RULES, references: refs };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
  console.log(`${refs.length} references → ${OUT}`);
  for (const r of refs) console.log(`  ${r.id}: ${r.minutes}min ${r.exercises.length} ex [${r.exercises.map(e => `${e.family}:${e.sets}x${e.repMin}-${e.repMax}${e.timed ? 's' : ''}`).join(' ')}]`);
  const other = refs.flatMap(r => r.exercises).filter(e => e.family === 'other');
  if (other.length) console.log('UNCLASSIFIED:', other.map(e => e.name).join(' | '));
}
main();
