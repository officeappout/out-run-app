import { describe, it, expect } from 'vitest';
import { SIDEBAR_CONFIGS, getSidebarConfig } from '../sidebarConfigs';

describe('SIDEBAR_CONFIGS.military_unit — a real brigade officer (tenant_owner/unit_admin) (06.10.2026, David\'s test)', () => {
  const allLinks = SIDEBAR_CONFIGS.military_unit.sections.flatMap((s) => s.links);

  it('never includes "כל החטיבות" or the vertical-overview link — a real brigade officer has no cross-brigade access to link to', () => {
    expect(allLinks.some((l) => l.href === '/admin/authority/readiness/vertical-overview')).toBe(false);
    expect(allLinks.some((l) => l.label === 'כל החטיבות')).toBe(false);
  });

  it('dashboard and trends are both reachable — the two screens David found reachable only by direct URL', () => {
    expect(allLinks.some((l) => l.href === '/admin/dashboard')).toBe(true);
    expect(allLinks.some((l) => l.href === '/admin/authority/readiness/trends')).toBe(true);
  });

  it('the roster link is labeled "חיילים ותוצאות", not "מד כשירות" (David: that name belongs to the dashboard category, not this screen)', () => {
    const rosterLink = allLinks.find((l) => l.href === '/admin/authority/readiness');
    expect(rosterLink?.label).toBe('חיילים ותוצאות');
  });

  it('getSidebarConfig("military_unit") resolves to this exact config (not a fallback)', () => {
    expect(getSidebarConfig('military_unit')).toBe(SIDEBAR_CONFIGS.military_unit);
  });
});
