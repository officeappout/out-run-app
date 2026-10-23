import { describe, it, expect } from 'vitest';
import { ADMIN_NAV_SECTIONS, isNavGroup, sectionLinks } from '../adminNavItems';
import { SECTION_PATHS } from '../adminSections';

describe('adminNavItems (main sidebar as data)', () => {
  it('keeps the sidebar section order', () => {
    expect(ADMIN_NAV_SECTIONS.map((s) => s.id)).toEqual([
      'strategy', 'crm', 'municipal', 'military', 'educational', 'marketing', 'product', 'finance', 'dev',
    ]);
  });
  it('every section id is a real AdminSectionId', () => {
    for (const s of ADMIN_NAV_SECTIONS) expect(Object.keys(SECTION_PATHS)).toContain(s.id);
  });
  it('no duplicate href inside the main sidebar', () => {
    const hrefs = ADMIN_NAV_SECTIONS.flatMap((s) => sectionLinks(s).map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it('military renders MILITARY_ROOT_NAV_ITEMS (no entries of its own); verticals are marked', () => {
    const military = ADMIN_NAV_SECTIONS.find((s) => s.id === 'military')!;
    expect(military.entries).toEqual([]);
    expect(ADMIN_NAV_SECTIONS.filter((s) => s.vertical).map((s) => s.id)).toEqual(['municipal', 'military', 'educational']);
  });
  it('groups are non-empty', () => {
    for (const s of ADMIN_NAV_SECTIONS) for (const e of s.entries) if (isNavGroup(e)) expect(e.links.length).toBeGreaterThan(0);
  });
});

describe('city-mapping hub link', () => {
  const links = ADMIN_NAV_SECTIONS.flatMap((s) => sectionLinks(s));
  it('sits directly under "מיפוי עיר", gated by the hub-flag audience', () => {
    const i = links.findIndex((l) => l.href === '/admin/city-mapping');
    expect(links[i + 1]).toMatchObject({ href: '/admin/city-mapping/hub', label: 'מרכז מיפוי ערים', audience: 'cityMappingHubLink' });
  });
  it('the parent link is not highlighted on the hub page', () => {
    const parent = links.find((l) => l.href === '/admin/city-mapping')!;
    expect(parent.active).toEqual({ kind: 'prefixExcept', except: ['/admin/city-mapping/hub'] });
  });
});
