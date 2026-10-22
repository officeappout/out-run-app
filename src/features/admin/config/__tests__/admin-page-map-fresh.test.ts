/**
 * The committed admin page map (src/generated/admin-page-map.json) must equal what the
 * generator builds from the code right now. Red here = a page, sidebar link or synonym changed
 * without re-running:   npx tsx scripts/gen-admin-page-map.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  allSidebarHrefs,
  buildAdminPageMap,
  leadingDoc,
  serializeAdminPageMap,
  staticH1,
  type AdminPageMap,
} from '../../../../../scripts/admin-page-map/build-page-map';
import { readAdminPages } from '../../../../../scripts/admin-page-map/read-pages';
import { ADMIN_PAGE_SYNONYMS, ADMIN_PAGE_TITLE_OVERRIDES } from '../adminPageSynonyms';

const root = process.cwd();
const pages = readAdminPages(root);
const committedText = readFileSync(join(root, 'src', 'generated', 'admin-page-map.json'), 'utf8');
const committed = JSON.parse(committedText) as AdminPageMap;

describe('admin page map — freshness', () => {
  it('the committed JSON equals a fresh build (run `npx tsx scripts/gen-admin-page-map.ts`)', () => {
    expect(serializeAdminPageMap(buildAdminPageMap(pages))).toBe(committedText);
  });

  it('covers every src/app/admin/**/page.tsx', () => {
    const paths = new Set(committed.pages.map((p) => p.path));
    for (const p of pages) expect(paths.has(p.route), p.route).toBe(true);
  });

  it('every sidebar link points at a real page', () => {
    const routes = new Set(pages.map((p) => p.route));
    for (const href of allSidebarHrefs()) expect(routes.has(href.split('?')[0]), href).toBe(true);
  });

  it('every synonym / title-override key matches a page', () => {
    const keys = new Set(committed.pages.flatMap((p) => [p.href, p.path]));
    for (const k of [...Object.keys(ADMIN_PAGE_SYNONYMS), ...Object.keys(ADMIN_PAGE_TITLE_OVERRIDES)]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it('ids and hrefs are unique; ids never start with a slash', () => {
    const ids = committed.pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => !id.startsWith('/'))).toBe(true);
  });
});

describe('admin page map — access is computed from the real gates', () => {
  const byHref = new Map(committed.pages.map((p) => [p.href, p]));
  it('root-only sidebar links carry audience rootAdmin; super-only carry superAdmin', () => {
    expect(byHref.get('/admin/agents')?.audience).toBe('rootAdmin');
    expect(byHref.get('/admin/signup-failures')?.audience).toBe('rootAdmin');
    expect(byHref.get('/admin/system-settings')?.audience).toBe('superAdmin');
    expect(byHref.get('/admin/authorities')?.audience).toBeNull();
  });
  it('middleware scopes: heatmap is open to authority managers, system settings to no scoped role', () => {
    expect(byHref.get('/admin/heatmap')?.scopes).toContain('authority_manager');
    expect(byHref.get('/admin/system-settings')?.scopes).toEqual([]);
  });
  it('platform-member sections come from SECTION_PATHS (crm owns /admin/authorities)', () => {
    expect(byHref.get('/admin/authorities')?.platformSections).toContain('crm');
  });
  it('login / callback steps are not navigable', () => {
    expect(byHref.get('/admin/login')?.navigable).toBe(false);
    expect(byHref.get('/admin/auth/callback')?.navigable).toBe(false);
    expect(byHref.get('/admin/authorities')?.navigable).toBe(true);
  });
  it('dynamic routes list their params', () => {
    expect(byHref.get('/admin/authorities/[id]')?.params).toEqual(['id']);
  });
});

describe('page-map text extraction', () => {
  it('staticH1 takes the first <h1> without JSX expressions', () => {
    expect(staticH1('<h1 className="x">{title}</h1><h1 className="y">\n  ניהול <span>רשויות</span>\n</h1>')).toBe('ניהול רשויות');
    expect(staticH1('<div/>')).toBeNull();
  });
  it('leadingDoc takes the first sentence of the header JSDoc, capped', () => {
    expect(leadingDoc("'use client';\n/**\n * The panel home. More words.\n */\nexport default 1")).toBe('The panel home.');
    expect(leadingDoc('export default 1')).toBeNull();
    expect((leadingDoc(`/** ${'א'.repeat(300)} */`) ?? '').length).toBeLessThanOrEqual(160);
  });
});
