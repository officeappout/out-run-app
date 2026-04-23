/**
 * Config-driven Sidebar Registry
 *
 * Maps each authority portal type to its sidebar section definitions.
 * The layout.tsx loops over these arrays instead of using branching if/else.
 *
 * Icon names reference lucide-react — the layout component resolves
 * them via an icon map for SSR safety.
 */

import type { TenantLabelSet } from './tenantLabels';

// ── Types ─────────────────────────────────────────────────────────────

export type LucideIconName =
  | 'LayoutDashboard' | 'BarChart3' | 'Activity' | 'Map' | 'Route'
  | 'Users' | 'Flag' | 'CalendarHeart' | 'ShieldCheck' | 'GraduationCap'
  | 'ClipboardCheck' | 'Trophy' | 'Building2' | 'KeyRound' | 'Shield';

export interface SidebarLink {
  href: string;
  icon: LucideIconName;
  /** Static label — if null, the renderer uses a dynamic label from TenantLabelSet */
  label: string | null;
  /** When label is null, this key into TenantLabelSet is used instead */
  labelKey?: keyof TenantLabelSet;
}

export interface SidebarSection {
  title: string;
  links: SidebarLink[];
}

export interface PortalSidebarConfig {
  badgeColorClass: string;
  badgeTextClass: string;
  sections: SidebarSection[];
}

// ── Registry ──────────────────────────────────────────────────────────

export const SIDEBAR_CONFIGS: Record<string, PortalSidebarConfig> = {
  neighborhood: {
    badgeColorClass: 'bg-emerald-900/30 border-emerald-700/30',
    badgeTextClass: 'text-emerald-400',
    sections: [
      {
        title: '',
        links: [
          { href: '/admin/authority/neighborhoods/__MANAGED_ID__', icon: 'Building2', label: 'השכונה שלי' },
          { href: '/admin/authority/locations', icon: 'Map', label: 'מיקומים' },
          { href: '/admin/authority/reports', icon: 'Flag', label: 'דיווחים' },
        ],
      },
    ],
  },

  military_unit: {
    badgeColorClass: 'bg-red-900/30 border-red-700/30',
    badgeTextClass: 'text-red-400',
    sections: [
      {
        title: '',
        links: [
          { href: '/admin/dashboard', icon: 'LayoutDashboard', label: null, labelKey: 'dashboardTitle' },
          { href: '/admin/authority/readiness', icon: 'ShieldCheck', label: 'מד כשירות' },
          { href: '/admin/authority/units', icon: 'Users', label: null, labelKey: 'subUnitsTitle' },
        ],
      },
      {
        title: 'אימונים',
        links: [
          { href: '/admin/authority-manager', icon: 'BarChart3', label: 'אנליטיקה' },
          { href: '/admin/heatmap', icon: 'Activity', label: 'מפת חום חיה' },
          { href: '/admin/authority/locations', icon: 'Map', label: 'מיקומים' },
        ],
      },
      {
        title: 'תפעול',
        links: [
          { href: '/admin/authority/team', icon: 'Users', label: 'ניהול צוות' },
          { href: '/admin/authority/users', icon: 'Users', label: null, labelKey: 'membersTitle' },
          { href: '/admin/access-codes', icon: 'KeyRound', label: 'קודי גישה' },
        ],
      },
    ],
  },

  school: {
    badgeColorClass: 'bg-amber-900/30 border-amber-700/30',
    badgeTextClass: 'text-amber-400',
    sections: [
      {
        title: 'ניהול',
        links: [
          { href: '/admin/dashboard', icon: 'LayoutDashboard', label: null, labelKey: 'dashboardTitle' },
          { href: '/admin/authority/units', icon: 'GraduationCap', label: null, labelKey: 'subUnitsTitle' },
          { href: '/admin/authority-manager', icon: 'BarChart3', label: 'אנליטיקה' },
        ],
      },
      {
        title: 'ציונים',
        links: [
          { href: '/admin/authority/grades', icon: 'ClipboardCheck', label: 'ציוני חנ״ג' },
        ],
      },
      {
        title: 'תחרות',
        links: [
          { href: '/admin/authority/users', icon: 'Trophy', label: 'לוח תוצאות' },
        ],
      },
      {
        title: 'תפעול',
        links: [
          { href: '/admin/authority/locations', icon: 'Map', label: 'מיקומים' },
          { href: '/admin/authority/team', icon: 'Users', label: 'ניהול צוות' },
          { href: '/admin/access-codes', icon: 'KeyRound', label: 'קודי גישה' },
        ],
      },
    ],
  },

  municipal: {
    badgeColorClass: 'bg-cyan-900/30 border-cyan-700/30',
    badgeTextClass: 'text-cyan-400',
    sections: [
      {
        title: 'אסטרטגיה',
        links: [
          { href: '/admin/dashboard', icon: 'LayoutDashboard', label: 'דשבורד' },
          { href: '/admin/authority-manager', icon: 'BarChart3', label: 'אנליטיקה ו-BI' },
          { href: '/admin/heatmap', icon: 'Activity', label: 'מפת חום חיה' },
        ],
      },
      {
        title: 'נכסים',
        links: [
          { href: '/admin/authority/locations', icon: 'Map', label: 'מיקומים ופארקים' },
          { href: '/admin/authority/routes', icon: 'Route', label: 'מסלולים' },
        ],
      },
      {
        title: 'תפעול',
        links: [
          { href: '/admin/authority/community', icon: 'CalendarHeart', label: 'מרכז קהילה' },
          { href: '/admin/authority/reports', icon: 'Flag', label: 'דיווח תחזוקה ודירוג' },
          { href: '/admin/authority/team', icon: 'Users', label: 'ניהול צוות' },
          { href: '/admin/authority/users', icon: 'Users', label: 'משתמשים' },
        ],
      },
    ],
  },
};

/**
 * Resolve which sidebar config to use based on authorityType.
 * Falls back to 'municipal' for any unrecognized type.
 */
export function getSidebarConfig(authorityType?: string | null): PortalSidebarConfig {
  if (authorityType && authorityType in SIDEBAR_CONFIGS) {
    return SIDEBAR_CONFIGS[authorityType];
  }
  // Map extended types to their base configs
  const typeMap: Record<string, string> = {
    city: 'municipal',
    regional_council: 'municipal',
    local_council: 'municipal',
    settlement: 'municipal',
  };
  const mapped = authorityType ? typeMap[authorityType] : undefined;
  if (mapped && mapped in SIDEBAR_CONFIGS) {
    return SIDEBAR_CONFIGS[mapped];
  }
  return SIDEBAR_CONFIGS.municipal;
}
