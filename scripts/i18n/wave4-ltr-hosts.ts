/**
 * Wave 4 LTR-host scan. Usage: npx tsx scripts/i18n/wave4-ltr-hosts.ts [srcRoot=src] [file...]
 *
 * Finds every file with a direction override on a wrapper (`direction: 'ltr'`, `dir="ltr"`, `dir={'ltr'}`,
 * `style={{ direction: <non-rtl> }}`) and lists the component FILES rendered inside it:
 *   - direct host: components whose JSX tag appears inside the override element's subtree (one level, resolved through the file's imports);
 *   - prop host (renders children / render-props / items, e.g. a carousel): the CALLERS of the host, plus the
 *     components those callers render, plus two more levels (cards wrapped by slide/row components; barrels such as HomeWidgets are looked through).
 * A file in that set may rely on its own explicit dir="rtl" to undo the override, so removing the dir (or
 * flipping physical classes) is NOT Hebrew-safe: the codemod skips it as LTR-HOST.
 * By-reference (v2): components passed as identifiers (`component: X`, `render: X`, `slides: [X]`, createElement, lazy/dynamic import)
 * count as rendered, and any file mentioning a carousel host / useDrag / Embla / swiper is a host whose used components (transitively, 4 levels) are inside.
 * Over-approximation is intentional: a false positive only costs a manual English fix later.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const OVERRIDE_RE = /direction:\s*['"`]ltr['"`]|\bdir=\{?['"`]ltr['"`]\}?|style=\{\{\s*direction:[ \t]*(?![ \t]|['"`]rtl['"`])/;
/** Files that mention a carousel-style direction host by name, or use drag/slider machinery, are hosts by reference. */
export const HOST_MENTION_RE = /\b(?:StatsCarousel|SuggestionCarousel|WorkoutSelectionCarousel|DashedGoalCarousel)\b|\buseDrag\b|\bembla\b|\bswiper\b/i;
const PROP_SUBTREE_RE = /\{children\}|\bchildren\b|\.map\(|\brender[A-Z]\w*\(|\bslides\b/;

/** True when an element carrying the override wraps caller-supplied content (children / mapped items / render props). */
export function isPropHost(file: string, src: string): boolean {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(n) && OVERRIDE_RE.test(n.openingElement.getText()) && PROP_SUBTREE_RE.test(n.children.map((c) => c.getText()).join(''))) found = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** Source text of every JSX element that carries the override itself (its whole subtree). */
export function overrideSubtrees(file: string, src: string): string {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parts: string[] = [];
  const visit = (n: ts.Node) => {
    const open = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
    if (open && OVERRIDE_RE.test(open.getText())) { parts.push(n.getText()); return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return parts.join('\n');
}

const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];

export type HostInfo = { host: string; kind: 'direct' | 'prop'; callers: string[]; inside: string[] };
export type ScanResult = { hosts: HostInfo[]; inside: Map<string, string[]> };

function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '__snapshots__' || f === '__tests__') continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string, root: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(path.dirname(root), 'src', spec.slice(2)); // '@/' = src/
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (spec.startsWith('@/') && !fs.existsSync(path.dirname(base))) base = path.join(root, spec.slice(2));
  for (const e of ['', ...EXTS]) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** Import statements (static, multi-line safe) removed so imported names are not counted as usages. */
function stripImports(src: string): string {
  return src.replace(/import\s+(?:type\s+)?[^;'"]*?\s+from\s+['"][^'"]+['"];?/g, '').replace(/^\s*import\s+['"][^'"]+['"];?/gm, '');
}

/**
 * Component files used in `file` (one level), resolved through the file's imports. A component counts when it appears
 * as a JSX tag OR as a bare identifier (passed BY REFERENCE: `component: X`, `Component={X}`, `render: X`, `slides: [X, Y]`,
 * `createElement(X)`, objects/arrays a host iterates). Dynamic `import('./X')` / `lazy(() => import(...))` specifiers count too.
 */
function renderedFiles(file: string, src: string, root: string, scope: string = src): string[] {
  const body = stripImports(scope);
  const tags = new Set([...Array.from(body.matchAll(/<([A-Z]\w*)/g), (m) => m[1]), ...Array.from(body.matchAll(/(?<![.\w$])([A-Z]\w*)\b/g), (m) => m[1])]);
  const out = new Set<string>();
  for (const m of Array.from(scope.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g))) {
    const r = resolveImport(file, m[1], root);
    if (r) out.add(path.resolve(r));
  }
  for (const m of Array.from(src.matchAll(/import\s+(?:type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/g))) {
    const names: string[] = [];
    const clause = m[1];
    const def = clause.match(/^([A-Za-z_]\w*)\s*(,|$)/);
    if (def) names.push(def[1]);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) for (const part of named[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.push(n); }
    if (names.some((n) => tags.has(n))) {
      const r = resolveImport(file, m[2], root);
      if (r) out.add(path.resolve(r));
    }
  }
  // Barrel / boundary-wrapper modules (HomeWidgets: `export const X = withWidgetBoundary(XRaw)`): the real
  // component file is an import of the barrel, so a tag rendered through it reaches all of the barrel's imports.
  for (const r of Array.from(out)) {
    const rs = fs.readFileSync(r, 'utf8');
    if (!/withWidgetBoundary|export\s+\*\s+from|export\s*\{[^}]*\}\s*from/.test(rs)) continue;
    for (const m of Array.from(rs.matchAll(/(?:import|export)\s+[^;]*?\s+from\s+['"]([^'"]+)['"]/g))) {
      const t = resolveImport(r, m[1], root);
      if (t) out.add(path.resolve(t));
    }
  }
  return Array.from(out);
}

export function scanLtrHosts(root = 'src'): ScanResult {
  const files = walk(root).map((f) => path.resolve(f));
  const srcOf = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')] as const));
  const rendered = new Map<string, string[]>();
  const renders = (f: string) => {
    if (!rendered.has(f)) rendered.set(f, renderedFiles(f, srcOf.get(f) ?? '', root));
    return rendered.get(f)!;
  };
  const hosts = files.filter((f) => OVERRIDE_RE.test(srcOf.get(f)!));
  const importers = new Map<string, string[]>(); // module file -> files that render it
  for (const f of files) for (const r of renders(f)) importers.set(r, [...(importers.get(r) ?? []), f]);

  const inside = new Map<string, Set<string>>();
  const add = (target: string, host: string) => {
    if (target === host) return;
    if (!inside.has(target)) inside.set(target, new Set());
    inside.get(target)!.add(host);
  };
  const result: HostInfo[] = [];
  // Hosts by reference: files naming a carousel host / drag machinery; everything they use (tag or bare identifier) plus 3 levels is inside.
  const mentionHosts = files.filter((f) => !hosts.includes(f) && HOST_MENTION_RE.test(srcOf.get(f)!));
  for (const host of [...hosts, ...mentionHosts]) {
    if (!OVERRIDE_RE.test(srcOf.get(host)!)) {
      let frontier = renders(host);
      const set = new Set<string>();
      for (let depth = 0; depth < 4; depth++) { frontier.forEach((r) => set.add(r)); frontier = frontier.flatMap((r) => renders(r)).filter((r) => !set.has(r)); }
      for (const t of Array.from(set)) add(t, host);
      result.push({ host: path.relative(process.cwd(), host), kind: 'prop', callers: [], inside: Array.from(set).map((x) => path.relative(process.cwd(), x)) });
      continue;
    }
    const direct = renderedFiles(host, srcOf.get(host)!, root, overrideSubtrees(host, srcOf.get(host)!));
    const isProp = isPropHost(host, srcOf.get(host)!);
    const callers = isProp ? (importers.get(host) ?? []) : [];
    const set = new Set<string>(direct);
    // callers -> what they render -> two more levels (cards wrapped by slide/row components)
    let frontier = callers.flatMap((c) => renders(c));
    for (let depth = 0; depth < 3; depth++) {
      frontier.forEach((r) => set.add(r));
      frontier = frontier.flatMap((r) => renders(r)).filter((r) => !set.has(r));
    }
    for (const t of Array.from(set)) add(t, host);
    result.push({ host: path.relative(process.cwd(), host), kind: isProp ? 'prop' : 'direct', callers: callers.map((c) => path.relative(process.cwd(), c)), inside: Array.from(set).map((s) => path.relative(process.cwd(), s)) });
  }
  const out = new Map<string, string[]>();
  for (const [t, h] of Array.from(inside)) out.set(path.relative(process.cwd(), t), Array.from(h).map((x) => path.relative(process.cwd(), x)));
  return { hosts: result, inside: out };
}

if (process.argv[1]?.endsWith('wave4-ltr-hosts.ts')) {
  const [root = 'src', ...targets] = process.argv.slice(2);
  const { hosts, inside } = scanLtrHosts(root);
  if (!targets.length) {
    for (const h of hosts) console.log(`${h.kind.toUpperCase()} HOST ${h.host}${h.callers.length ? ` callers: ${h.callers.join(', ')}` : ''}\n  inside: ${h.inside.join(', ')}`);
  }
  for (const t of targets) {
    const hs = inside.get(path.relative(process.cwd(), path.resolve(t)));
    console.log(hs ? `LTR-HOST ${t} <- ${hs.join(', ')}` : `ok       ${t}`);
  }
}
