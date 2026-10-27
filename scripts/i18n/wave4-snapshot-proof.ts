/**
 * Wave 4 snapshot proof. Usage: npx tsx scripts/i18n/wave4-snapshot-proof.ts <baseRef> [pathPrefix...]
 * For every Hebrew snapshot (.html / .snap) changed since <baseRef> it proves, without trusting the codemod:
 *   1. after dropping class="..." values and ` dir="rtl"` attributes, the markup equals base byte for byte;
 *   2. the i-th class attribute equals mapClassString(base i-th class attribute) (+ optional trailing mirror class).
 * Exit code 1 on any violation. Prints totals: files, class attributes changed, dir attributes removed, mirror classes.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import { ICON_MIRROR_CLASS, mapClassString } from '../../src/lib/i18n/wave4/logical-classes';

const [base, ...prefixes] = process.argv.slice(2);
if (!base) throw new Error('usage: wave4-snapshot-proof.ts <baseRef> [pathPrefix...]');
const files = execSync(`git diff --name-only ${base} -- ${prefixes.length ? prefixes.join(' ') : '.'}`, { encoding: 'utf8' })
  .split('\n').filter((f) => /(__snapshots__\/.*\.(html|snap)$)/.test(f) && fs.existsSync(f));

const CLASS_RE = /\bclass=(\\?")([^"\\]*)\1/g;
const normalize = (s: string) => s.replace(CLASS_RE, 'class=$1$1').replace(/ dir=(\\?")rtl\1/g, '');
const classes = (s: string) => Array.from(s.matchAll(CLASS_RE), (m) => m[2]);
const dirs = (s: string) => (s.match(/ dir=(\\?")rtl\1/g) ?? []).length;

let bad = 0, classChanged = 0, dirRemoved = 0, mirrors = 0;
for (const f of files) {
  const before = execSync(`git show ${base}:${f}`, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const after = fs.readFileSync(f, 'utf8');
  if (normalize(before) !== normalize(after)) { console.log(`STRUCTURE DIFF ${f}`); bad++; continue; }
  const cb = classes(before), ca = classes(after);
  if (cb.length !== ca.length) { console.log(`CLASS COUNT ${f}`); bad++; continue; }
  dirRemoved += dirs(before) - dirs(after);
  cb.forEach((old, i) => {
    if (old === ca[i]) return;
    const mapped = mapClassString(old, {}).text;
    if (ca[i] === mapped) classChanged++;
    else if (ca[i] === `${mapped} ${ICON_MIRROR_CLASS}`) { mirrors++; if (mapped !== old) classChanged++; }
    else { console.log(`MAPPING VIOLATION ${f}\n  old: ${old}\n  new: ${ca[i]}\n  exp: ${mapped}`); bad++; }
  });
}
console.log(JSON.stringify({ snapshotFilesChecked: files.length, classAttrsChanged: classChanged, dirAttrsRemoved: dirRemoved, mirrorClassesAdded: mirrors, violations: bad }));
process.exit(bad ? 1 : 0);
