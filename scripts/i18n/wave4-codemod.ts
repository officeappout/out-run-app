/**
 * i18n wave 4 codemod. Usage:
 *   npx tsx scripts/i18n/wave4-codemod.ts [--write] <dir|file>...
 * Dry-run by default (prints a report). Rewrites ONLY:
 *   1. physical Tailwind classes inside className attributes -> RTL-pixel-identical logical ones
 *   2. hard-coded dir="rtl" attributes (removed; the element inherits <html dir>)
 *   3. directional lucide icons get `ltr:-scale-x-100` (no-op in Hebrew)
 * Never touches: files rendered inside a direction override owned by ANOTHER file (LTR-HOST category: a carousel
 * with direction:'ltr' whose cards relied on their own dir="rtl"; see wave4-ltr-hosts.ts), dir="ltr" subtrees, dynamic dir, conditionals on direction/lang,
 * strings outside className, inline styles, canvas/map/gesture math (reported only).
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  DIRECTIONAL_ICONS,
  ICON_MIRROR_CLASS,
  MANUAL_REVIEW_PATTERNS,
  mapClassString,
} from '../../src/lib/i18n/wave4/logical-classes';
import { scanLtrHosts } from './wave4-ltr-hosts';

type Edit = { start: number; end: number; text: string };
export type FileReport = {
  file: string;
  classTokens: number;
  dirRemoved: number;
  iconsFlipped: number;
  skipped: string[];
  manual: string[];
};

const DIR_CONDITION = /rtl|direction|isHe|\blang|locale|language/i;

/** 'dirvar' = dir={direction} / isRtl ? 'rtl' : 'ltr': follows the language, rtl in Hebrew, so logical classes are correct. */
function dirOf(el: ts.JsxOpeningLikeElement): 'rtl' | 'ltr' | 'dirvar' | 'dynamic' | null {
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === 'dir') {
      const init = a.initializer;
      if (init && ts.isStringLiteral(init)) return init.text === 'rtl' ? 'rtl' : init.text === 'ltr' ? 'ltr' : 'dynamic';
      if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) {
        return init.expression.text === 'rtl' ? 'rtl' : init.expression.text === 'ltr' ? 'ltr' : 'dynamic';
      }
      if (init && ts.isJsxExpression(init) && init.expression && /direction|isRtl|isRTL|'rtl'|"rtl"/.test(init.expression.getText())) return 'dirvar';
      return 'dynamic';
    }
  }
  return null;
}

function openingOf(n: ts.Node): ts.JsxOpeningLikeElement | null {
  if (ts.isJsxSelfClosingElement(n)) return n;
  if (ts.isJsxElement(n)) return n.openingElement;
  return null;
}

/** Nearest ancestor (optionally including self) dir in this file. */
function effectiveDir(node: ts.Node, includeSelf: boolean): 'rtl' | 'ltr' | 'dirvar' | 'dynamic' | null {
  let cur: ts.Node | undefined = includeSelf ? node : node.parent;
  while (cur) {
    const o = openingOf(cur);
    if (o) {
      const d = dirOf(o);
      if (d) return d;
    }
    cur = cur.parent;
  }
  return null;
}

function inDirectionConditional(n: ts.Node, stop: ts.Node): boolean {
  let cur: ts.Node | undefined = n;
  while (cur && cur !== stop) {
    const p: ts.Node | undefined = cur.parent;
    if (p && ts.isConditionalExpression(p) && p.condition !== cur && DIR_CONDITION.test(p.condition.getText())) return true;
    if (p && ts.isBinaryExpression(p) && DIR_CONDITION.test(p.left.getText()) && p.right === cur) return true;
    cur = p;
  }
  return false;
}

/**
 * True when `n` (or an ancestor in this file) is a direction boundary that a surrounding LTR host cannot reach:
 * the shared v2 `<Sheet>` (its frame always sets its own dir) or an element with `dir={direction}` (useUiDir: rtl in Hebrew).
 */
function insideSheet(n: ts.Node): boolean {
  for (let cur: ts.Node | undefined = n; cur; cur = cur.parent) {
    if (ts.isJsxElement(cur) && cur !== n && cur.openingElement.tagName.getText() === 'Sheet') return true;
    const o = openingOf(cur);
    if (o && dirOf(o) === 'dirvar') return true;
  }
  return false;
}

/** sheetOnly: file sits inside an LTR host; only elements nested in an own-dir boundary (`<Sheet>` or `dir={direction}`) are converted. */
export function transform(file: string, src: string, sheetOnly = false): { out: string; report: FileReport } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const report: FileReport = { file, classTokens: 0, dirRemoved: 0, iconsFlipped: 0, skipped: [], manual: [] };
  const lucideNames = new Set<string>();
  sf.forEachChild((n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === 'lucide-react') {
      const nb = n.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) nb.elements.forEach((e) => lucideNames.add(e.name.text));
    }
  });
  const handled = new Set<ts.Node>();

  const visitLiteral = (lit: ts.Node, attr: ts.JsxAttribute, owner: ts.JsxOpeningLikeElement) => {
    const ed = effectiveDir(owner, true);
    if (ed === 'ltr' || ed === 'dynamic') {
      report.skipped.push(`${ed} dir scope: ${lit.getText().slice(0, 60)}`);
      return;
    }
    if (inDirectionConditional(lit, attr)) {
      report.skipped.push(`direction conditional: ${lit.getText().slice(0, 60)}`);
      return;
    }
    const k = lit.kind;
    const start = lit.getStart() + 1;
    let end = lit.getEnd() - 1;
    let skipFirst = false;
    let skipLast = false;
    if (k === ts.SyntaxKind.TemplateHead) { end = lit.getEnd() - 2; skipLast = true; }
    else if (k === ts.SyntaxKind.TemplateMiddle) { end = lit.getEnd() - 2; skipFirst = true; skipLast = true; }
    else if (k === ts.SyntaxKind.TemplateTail) skipFirst = true;
    const raw = src.slice(start, end);
    const { text, changed } = mapClassString(raw, { skipFirst, skipLast });
    if (changed) {
      edits.push({ start, end, text });
      report.classTokens += changed;
    }
  };

  const walkAttr = (attr: ts.JsxAttribute, owner: ts.JsxOpeningLikeElement) => {
    const walk = (n: ts.Node) => {
      if (
        ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ||
        n.kind === ts.SyntaxKind.TemplateHead || n.kind === ts.SyntaxKind.TemplateMiddle || n.kind === ts.SyntaxKind.TemplateTail
      ) {
        // skip property keys / non-class literals: only literals that are values, args or template parts
        visitLiteral(n, attr, owner);
        handled.add(n);
        return;
      }
      ts.forEachChild(n, walk);
    };
    if (attr.initializer) walk(attr.initializer);
  };

  const visit = (n: ts.Node) => {
    const opening = openingOf(n);
    if (opening && (!sheetOnly || insideSheet(n))) {
      for (const a of opening.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const name = a.name.getText();
        if (name === 'className' || /ClassName$/.test(name)) walkAttr(a, opening);
        if (name === 'dir' && dirOf(opening) === 'rtl') {
          const above = effectiveDir(opening, false);
          if (above === 'ltr' || above === 'dynamic') report.skipped.push(`dir="rtl" under ${above} ancestor (kept)`);
          else {
            edits.push({ start: a.getFullStart(), end: a.getEnd(), text: '' });
            report.dirRemoved++;
          }
        }
      }
      const tag = opening.tagName.getText();
      if (DIRECTIONAL_ICONS.has(tag) && lucideNames.has(tag)) {
        const ed = effectiveDir(opening, true);
        const cls = opening.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === 'className');
        if (ed === 'ltr' || ed === 'dynamic') report.skipped.push(`icon ${tag} in ${ed} scope`);
        else if (!cls) {
          edits.push({ start: opening.tagName.getEnd(), end: opening.tagName.getEnd(), text: ` className="${ICON_MIRROR_CLASS}"` });
          report.iconsFlipped++;
        } else {
          const init = cls.initializer;
          const lit = init && ts.isStringLiteral(init) ? init : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression) ? init.expression : null;
          if (lit && !/scale-x|(^|[\s:])(rtl|ltr):/.test(lit.text)) {
            edits.push({ start: lit.getEnd() - 1, end: lit.getEnd() - 1, text: ` ${ICON_MIRROR_CLASS}` });
            report.iconsFlipped++;
          } else report.skipped.push(`icon ${tag} className not a plain string`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // Manual-review report: physical leftovers anywhere in the file's string literals.
  const leftover = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n)) {
      for (const tok of n.text.split(/\s+/)) {
        if (MANUAL_REVIEW_PATTERNS.some((r) => r.test(tok))) report.manual.push(tok);
      }
    }
    ts.forEachChild(n, leftover);
  };
  leftover(sf);

  // Apply edits back-to-front (dedupe identical ranges).
  const uniq = Array.from(new Map(edits.map((e) => [`${e.start}:${e.end}`, e] as const)).values()).sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of uniq) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { out, report };
}

function walkFiles(p: string, out: string[] = []): string[] {
  const st = fs.statSync(p);
  if (st.isFile()) { if (/\.tsx$/.test(p)) out.push(p); return out; }
  for (const f of fs.readdirSync(p)) {
    if (f === 'node_modules' || f === '__snapshots__') continue;
    walkFiles(path.join(p, f), out);
  }
  return out;
}

if (require.main === module || process.argv[1]?.endsWith('wave4-codemod.ts')) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const targets = args.filter((a) => !a.startsWith('--'));
  const totals = { files: 0, touched: 0, classTokens: 0, dirRemoved: 0, iconsFlipped: 0, skipped: 0, ltrHost: 0 };
  const ltrInside = scanLtrHosts('src').inside;
  for (const t of targets) {
    for (const f of walkFiles(t)) {
      const src = fs.readFileSync(f, 'utf8');
      const hosts = ltrInside.get(path.relative(process.cwd(), path.resolve(f)));
      if (hosts) {
        totals.files++;
        totals.ltrHost++;
        if (!/import\s+Sheet\s+from\s+['"][^'"]*\/Sheet['"]|\bdir=\{direction\}/.test(src)) {
          console.log(`LTR-HOST ${f}: rendered inside a direction override (${hosts.join(', ')}); left untouched, needs a dedicated English fix`);
          continue;
        }
        console.log(`LTR-HOST(sheet-only) ${f}`);
      }
      const { out, report } = transform(f, src, !!hosts);
      totals.files++;
      totals.classTokens += report.classTokens;
      totals.dirRemoved += report.dirRemoved;
      totals.iconsFlipped += report.iconsFlipped;
      totals.skipped += report.skipped.length;
      if (out !== src) { totals.touched++; if (write) fs.writeFileSync(f, out); }
      for (const s of report.skipped) console.log(`SKIP   ${f}: ${s}`);
      for (const s of Array.from(new Set(report.manual))) console.log(`MANUAL ${f}: ${s}`);
    }
  }
  console.log(JSON.stringify(totals));
}
