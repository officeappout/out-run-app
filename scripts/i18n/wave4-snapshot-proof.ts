/**
 * Wave 4 snapshot proof. Usage: npx tsx scripts/i18n/wave4-snapshot-proof.ts [baseRef=75bd738f] [pathPrefix...]
 * baseRef defaults to the Home PR's commit 1 (baseline snapshots recorded from main); main alone lacks the home-w4-cards snapshots.
 * For every Hebrew snapshot (.html / .snap) changed since <baseRef> it proves, without trusting the codemod:
 *   1. after dropping class="..." values and ` dir="rtl"` attributes, the markup equals base byte for byte;
 *   2. every changed class token equals an independent hand-written RTL-equivalent table entry (+ optional trailing mirror class);
 *    the codemod's mapClassString is deliberately NOT reused.
 * 3. LTR-HOST: no converted source file (changed vs <baseRef>) with a removed dir="rtl" or changed classes is rendered inside a
 *    direction override (scripts/i18n/wave4-ltr-hosts.ts) - a removed dir there silently flips Hebrew.
 * Exit code 1 on any violation. Prints totals: files, class attributes changed, dir attributes removed, mirror classes.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { scanLtrHosts } from './wave4-ltr-hosts';
import { ICON_MIRROR_CLASS } from '../../src/lib/i18n/wave4/logical-classes';

const [argBase, ...prefixes] = process.argv.slice(2);
const base = argBase ?? '75bd738f';
const files = execSync(`git diff --name-only ${base} -- ${prefixes.length ? prefixes.join(' ') : '.'}`, { encoding: 'utf8' })
  .split('\n').filter((f) => /(__snapshots__\/.*\.(html|snap)$)/.test(f) && fs.existsSync(f));

const CLASS_RE = /\bclass=(\\?")([^"\\]*)\1/g;
const normalize = (s: string) => s.replace(CLASS_RE, 'class=$1$1').replace(/ dir=(\\?")rtl\1/g, '');
const classes = (s: string) => Array.from(s.matchAll(CLASS_RE), (m) => m[2]);
const dirs = (s: string) => (s.match(/ dir=(\\?")rtl\1/g) ?? []).length;

const SIDE: Record<string, string> = { l: 'e', r: 's' };
const CORNER: Record<string, string> = { tl: 'se', tr: 'ss', bl: 'ee', br: 'es' };
/** Expected logical token for a physical one under RTL (left=end, right=start), variants preserved. */
function independentMap(token: string): string | null {
  const m = token.match(/^((?:[\w-]+:)*)(-?)(.*)$/)!;
  const [, variants, neg, core] = m;
  let r: RegExpMatchArray | null;
  if ((r = core.match(/^(m|p|scroll-m|scroll-p)([lr])(-.+)?$/))) return `${variants}${neg}${r[1]}${r[2] === 'l' ? 'e' : 's'}${r[3] ?? ''}`;
  if ((r = core.match(/^(left|right)(-.+)?$/))) return `${variants}${neg}${r[1] === 'left' ? 'end' : 'start'}${r[2] ?? ''}`;
  if ((r = core.match(/^text-(left|right)$/))) return `${variants}text-${r[1] === 'left' ? 'end' : 'start'}`;
  if ((r = core.match(/^rounded-([lr])(-.+)?$/))) return `${variants}rounded-${SIDE[r[1]]}${r[2] ?? ''}`;
  if ((r = core.match(/^rounded-(tl|tr|bl|br)(-.+)?$/))) return `${variants}rounded-${CORNER[r[1]]}${r[2] ?? ''}`;
  if ((r = core.match(/^border-([lr])(-.+)?$/))) return `${variants}border-${SIDE[r[1]]}${r[2] ?? ''}`;
  if ((r = core.match(/^(float|clear)-(left|right)$/))) return `${variants}${r[1]}-${r[2] === 'left' ? 'end' : 'start'}`;
  return null;
}

let bad = 0, ltrHostViolations = 0, classChanged = 0, dirRemoved = 0, mirrors = 0;
for (const f of files) {
  const before = execSync(`git show ${base}:${f}`, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const after = fs.readFileSync(f, 'utf8');
  if (normalize(before) !== normalize(after)) { console.log(`STRUCTURE DIFF ${f}`); bad++; continue; }
  const cb = classes(before), ca = classes(after);
  if (cb.length !== ca.length) { console.log(`CLASS COUNT ${f}`); bad++; continue; }
  dirRemoved += dirs(before) - dirs(after);
  cb.forEach((old, i) => {
    if (old === ca[i]) return;
    // Independent of the codemod: a hand-written table of the pixel-identical RTL equivalents (no mapClassString).
    const o = old.split(/\s+/).filter(Boolean), n = ca[i].split(/\s+/).filter(Boolean);
    const mirrored = n[n.length - 1] === ICON_MIRROR_CLASS && o[o.length - 1] !== ICON_MIRROR_CLASS;
    const nn = mirrored ? n.slice(0, -1) : n;
    const ok = o.length === nn.length && o.every((t, k) => nn[k] === t || nn[k] === independentMap(t));
    if (!ok) { console.log(`MAPPING VIOLATION ${f}\n  old: ${old}\n  new: ${ca[i]}`); bad++; return; }
    if (mirrored) mirrors++;
    if (o.some((t, k) => nn[k] !== t)) classChanged++;
  });
}
// 3. LTR-HOST: converted sources must not sit inside a direction override.
const inside = scanLtrHosts('src').inside;
const sources = execSync(`git diff --name-only ${base} -- ${prefixes.length ? prefixes.join(' ') : '.'}`, { encoding: 'utf8' })
  .split('\n').filter((f) => /\.tsx$/.test(f) && !/__tests__/.test(f) && fs.existsSync(f));
for (const f of sources) {
  const hosts = inside.get(path.relative(process.cwd(), path.resolve(f)));
  if (!hosts) continue;
  const was = execSync(`git show ${base}:${f}`, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const now = fs.readFileSync(f, 'utf8');
  const dirDropped = (was.match(/\bdir="rtl"/g) ?? []).length > (now.match(/\bdir="rtl"/g) ?? []).length;
  if (dirDropped || was !== now) { console.log(`LTR-HOST VIOLATION ${f} <- ${hosts.join(', ')}`); ltrHostViolations++; bad++; }
}
console.log(JSON.stringify({ sourceFilesChecked: sources.length, ltrHostViolations, snapshotFilesChecked: files.length, classAttrsChanged: classChanged, dirAttrsRemoved: dirRemoved, mirrorClassesAdded: mirrors, violations: bad }));
process.exit(bad ? 1 : 0);
