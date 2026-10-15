/**
 * 06.10.2026 (David's explicit 7-item spec) — the military nav for root
 * and a chief fitness officer, in order. Both admin/layout.tsx's
 * hasSec('military') block (root/super-admin, alongside municipal/
 * educational sections) and its isolated chief-officer-only block
 * render from this SAME array — one source of order/labels/hrefs,
 * each block supplying its own isActive logic (the hasSec block needs
 * extra disambiguation against sibling verticals; the isolated block
 * doesn't, since a chief officer never sees any other vertical).
 *
 * A real brigade officer (tenant_owner/unit_admin) never sees this
 * array at all — their own sidebar comes from sidebarConfigs.ts's
 * military_unit entry, which has no "כל החטיבות" item by construction
 * (they have no cross-brigade access to link to).
 */

export type MilitaryNavIconName = 'Dumbbell' | 'LayoutDashboard' | 'ShieldCheck' | 'BarChart3' | 'Shield' | 'ClipboardList';

export interface MilitaryNavItem {
  href: string;
  icon: MilitaryNavIconName;
  label: string;
}

export const MILITARY_ROOT_NAV_ITEMS: MilitaryNavItem[] = [
  { href: '/admin/authority/readiness/vertical-overview', icon: 'Dumbbell', label: 'כל החטיבות' },
  { href: '/admin/dashboard', icon: 'LayoutDashboard', label: 'דשבורד כשירות' },
  { href: '/admin/authority/readiness', icon: 'ShieldCheck', label: 'חיילים ותוצאות' },
  // 06.10.2026 (David) — was reachable only via a button inside the
  // roster screen, no sidebar item at all.
  { href: '/admin/authority/readiness/entry', icon: 'ClipboardList', label: 'רישום תוצאות בוחן' },
  { href: '/admin/authority/readiness/trends', icon: 'BarChart3', label: 'מגמות' },
  { href: '/admin/authority/units?type=military', icon: 'Shield', label: 'היררכיית יחידות' },
  { href: '/admin/authority/team?type=military', icon: 'Shield', label: 'ניהול צוות צבאי' },
];
