/**
 * build-page-map — pure builder of the admin page map (docs/admin/ADMIN-AI-ASSISTANT-PLAN.md §3).
 *
 *   buildAdminPageMap(pages) → AdminPageMap   (deterministic: sorted, no timestamps)
 *
 * `pages` = every src/app/admin/**\/page.tsx as { route, source } (read by the CLI or the
 * freshness test). Per entry:
 *   title    sidebar label (adminNavItems.ts / militaryNavItems.ts) → first static <h1> → folder
 *   section  the sidebar section it sits in, else the SECTION_PATHS section that owns the path
 *   access   computed with the REAL gate functions: decideAdminGateAction (middleware.ts) per
 *            scoped role, isPathAllowed (adminSections.ts) per platform-member section, plus the
 *            sidebar's own audience (root / super) — never a hand-written role list
 *   synonyms adminPageSynonyms.ts (the only hand-written part)
 * A page that is only a login/callback/redirect step is `navigable: false`.
 */
import { decideAdminGateAction, type GateSessionInfo } from '../../src/middleware';
import { SECTION_PATHS, isPathAllowed, sectionOwnsPath, type AdminSectionId } from '../../src/features/admin/config/adminSections';
import { ADMIN_NAV_SECTIONS, sectionLinks, type AdminNavAudience } from '../../src/features/admin/config/adminNavItems';
import { MILITARY_ROOT_NAV_ITEMS } from '../../src/features/admin/config/militaryNavItems';
import { ADMIN_PAGE_SYNONYMS, ADMIN_PAGE_TITLE_OVERRIDES } from '../../src/features/admin/config/adminPageSynonyms';

export const ADMIN_PAGE_MAP_VERSION = 1;

export type AdminScope = NonNullable<GateSessionInfo['scope']>;
const SCOPES: AdminScope[] = ['authority_manager', 'tenant_owner', 'unit_admin', 'readiness_chief_officer'];
const SECTION_IDS = Object.keys(SECTION_PATHS) as AdminSectionId[];

/** Steps of a flow, not destinations — never offered as a navigation button. */
const NON_NAVIGABLE = new Set(['/admin/login', '/admin/auth/callback', '/admin/authority-login', '/admin/pending-approval']);

export interface AdminPageEntry {
  /** Stable id = href without the leading slash. */
  id: string;
  /** What a button navigates to (may carry ?type=…); dynamic segments stay as [param]. */
  href: string;
  /** The page route (no query). */
  path: string;
  title: string;
  /** sidebar label, adminPageSynonyms override, first static <h1>, parent title + suffix, folder */
  titleSource: 'sidebar' | 'override' | 'h1' | 'parent' | 'folder';
  section: AdminSectionId | null;
  sectionLabel: string | null;
  group: string | null;
  description: string | null;
  /** Dynamic route params, in order (e.g. ['id']). Empty for static pages. */
  params: string[];
  /** Sidebar-only extra audience (root / super …) — null = whoever passes the gate. */
  audience: AdminNavAudience | null;
  /** Scoped roles the middleware lets in (root/super/system admins: always). */
  scopes: AdminScope[];
  /** Platform-member sections that grant the path (isPathAllowed). */
  platformSections: AdminSectionId[];
  navigable: boolean;
  synonyms: string[];
}

export interface AdminPageMap {
  version: number;
  pages: AdminPageEntry[];
}

export interface PageSource {
  /** '/admin/authorities/[id]' */
  route: string;
  source: string;
}

interface SidebarHit {
  href: string;
  title: string;
  section: AdminSectionId;
  sectionLabel: string;
  group: string | null;
  audience: AdminNavAudience | null;
}

function sidebarHits(): SidebarHit[] {
  const out: SidebarHit[] = [];
  for (const s of ADMIN_NAV_SECTIONS) {
    if (s.id === 'military') {
      for (const m of MILITARY_ROOT_NAV_ITEMS) out.push({ href: m.href, title: m.label, section: s.id, sectionLabel: s.label, group: null, audience: null });
      continue;
    }
    for (const e of s.entries) {
      if ('group' in e) {
        for (const l of e.links) out.push({ href: l.href, title: l.label, section: s.id, sectionLabel: s.label, group: e.group, audience: l.audience ?? null });
      } else {
        out.push({ href: e.href, title: e.label, section: s.id, sectionLabel: s.label, group: null, audience: e.audience ?? null });
      }
    }
  }
  return out;
}

/** All sidebar hrefs (main + military), for the "every sidebar link is a real page" test. */
export function allSidebarHrefs(): string[] {
  return [...ADMIN_NAV_SECTIONS.flatMap((s) => sectionLinks(s).map((l) => l.href)), ...MILITARY_ROOT_NAV_ITEMS.map((m) => m.href)];
}

const collapse = (t: string) => t.replace(/\s+/g, ' ').trim();

/** First <h1> whose text is static (no {expr}); null otherwise. */
export function staticH1(source: string): string | null {
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const inner = m[1].replace(/<[^>]+>/g, ' ');
    if (inner.includes('{') || inner.includes('}')) continue;
    const text = collapse(inner);
    if (text) return text;
  }
  return null;
}

/** First sentence (≤160 chars) of the file's leading JSDoc block; null when none. */
export function leadingDoc(source: string): string | null {
  const head = source.replace(/^\s*(['"]use client['"];?\s*)/, '');
  const m = /^\s*(?:(?:import|export)[^\n]*\n|\s)*?\/\*\*([\s\S]*?)\*\//.exec(head);
  if (!m) return null;
  const text = collapse(m[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join(' '));
  if (!text) return null;
  const sentence = (/^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text).trim();
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}…` : sentence;
}

const CHILD_SUFFIX: Record<string, string> = { new: 'חדש', edit: 'עריכה', import: 'ייבוא', add: 'הוספה' };

function paramsOf(path: string): string[] {
  return Array.from(path.matchAll(/\[([^\]]+)\]/g), (m) => m[1]);
}

function folderTitle(path: string): string {
  const parts = path.split('/').filter((p) => p && p !== 'admin' && !p.startsWith('['));
  return parts.length ? parts[parts.length - 1].replace(/-/g, ' ') : 'admin';
}

/** The path a gate check sees for a dynamic route ([id] → a placeholder segment). */
function probePath(path: string): string {
  return path.replace(/\[[^\]]+\]/g, '_param_');
}

function accessOf(path: string): { scopes: AdminScope[]; platformSections: AdminSectionId[] } {
  const probe = probePath(path);
  const scopes = SCOPES.filter((scope) => decideAdminGateAction(probe, { admin: false, scope }).action === 'allow');
  const platformSections = SECTION_IDS.filter((id) => isPathAllowed([id], probe));
  return { scopes, platformSections };
}

function ownerSection(path: string): AdminSectionId | null {
  return SECTION_IDS.find((id) => sectionOwnsPath(id, probePath(path))) ?? null;
}

const sectionLabelOf = (id: AdminSectionId | null): string | null =>
  id ? (ADMIN_NAV_SECTIONS.find((s) => s.id === id)?.label ?? null) : null;

export function buildAdminPageMap(pages: PageSource[]): AdminPageMap {
  const byRoute = new Map(pages.map((p) => [p.route, p.source]));
  const hits = sidebarHits();
  const entries: AdminPageEntry[] = [];
  const seenHref = new Set<string>();
  const coveredPaths = new Set<string>();

  const push = (e: Omit<AdminPageEntry, 'id' | 'synonyms'>) => {
    if (seenHref.has(e.href)) return;
    seenHref.add(e.href);
    entries.push({ ...e, id: e.href.replace(/^\//, ''), synonyms: [...(ADMIN_PAGE_SYNONYMS[e.href] ?? [])] });
  };

  for (const h of hits) {
    const path = h.href.split('?')[0];
    if (!byRoute.has(path)) continue; // the freshness test reports a sidebar link with no page
    coveredPaths.add(path);
    push({
      href: h.href,
      path,
      title: h.title,
      titleSource: 'sidebar',
      section: h.section,
      sectionLabel: h.sectionLabel,
      group: h.group,
      description: leadingDoc(byRoute.get(path) ?? ''),
      params: paramsOf(path),
      audience: h.audience,
      ...accessOf(path),
      navigable: !NON_NAVIGABLE.has(path),
    });
  }

  for (const { route, source } of [...pages].sort((a, b) => a.route.localeCompare(b.route))) {
    if (coveredPaths.has(route)) continue;
    const override = ADMIN_PAGE_TITLE_OVERRIDES[route];
    const h1 = override ? null : staticH1(source);
    const section = ownerSection(route);
    push({
      href: route,
      path: route,
      title: override ?? h1 ?? folderTitle(route),
      titleSource: override ? 'override' : h1 ? 'h1' : 'folder',
      section,
      sectionLabel: sectionLabelOf(section),
      group: null,
      description: leadingDoc(source),
      params: paramsOf(route),
      audience: null,
      ...accessOf(route),
      navigable: !NON_NAVIGABLE.has(route),
    });
  }

  entries.sort((a, b) => a.href.localeCompare(b.href));
  // Folder-named child pages (…/[id], …/new, …/edit) → "<parent title> · <suffix>", so the
  // assistant says "ניהול רשויות · פרטים" instead of "authorities".
  for (const e of entries) {
    if (e.titleSource !== 'folder') continue;
    const segs = e.path.split('/');
    const last = segs[segs.length - 1];
    const suffix = CHILD_SUFFIX[last] ?? (last.startsWith('[') ? 'פרטים' : null);
    if (!suffix) continue;
    for (let n = segs.length - 1; n > 2; n--) {
      const parentPath = segs.slice(0, n).join('/');
      const parent = entries.find((x) => x.path === parentPath && x.titleSource !== 'folder');
      if (parent) {
        e.title = `${parent.title} · ${suffix}`;
        e.titleSource = 'parent';
        break;
      }
    }
  }
  return { version: ADMIN_PAGE_MAP_VERSION, pages: entries };
}

/** Stable JSON text (2-space indent, trailing newline) — what the CLI writes and the test compares. */
export function serializeAdminPageMap(map: AdminPageMap): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}
