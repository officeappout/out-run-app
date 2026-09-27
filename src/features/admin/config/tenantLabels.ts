import type { TenantType } from '@/types/admin-types';

/** Organization type labels — used as the canonical display name for TenantType */
export type OrgType = TenantType;

export interface TenantLabelSet {
  orgTypeLabel: string;
  portalBadge: string;
  portalTitle: string;
  subUnitsTitle: string;
  subUnitSingular: string;
  membersTitle: string;
  memberSingular: string;
  readinessTitle: string;
  dashboardTitle: string;
  hierarchyLabels: string[];
  /**
   * §13.40 (27.09.2026) — the people who MANAGE this org in the admin
   * panel (team/page.tsx's "team members"), NOT the general population.
   * A distinct axis from membersTitle/memberSingular (חיילים/תלמידים/
   * תושבים = the org's members) — e.g. military managerTitle='קצינים' vs
   * membersTitle='חיילים'. Every prior use of "רכזים"/"רכז" on
   * team/page.tsx meant THIS axis, always municipal-worded regardless of
   * vertical — that's the bug this field exists to fix.
   */
  managerTitle: string;
  managerSingular: string;
  /** team/page.tsx's own page title — must match the sidebar's per-vertical link label (admin/layout.tsx) */
  teamTitle: string;
  /** The org itself — for org-picker labels/placeholders and breadcrumb roots (municipal: רשות, military: חטיבה, educational: בית ספר) */
  orgSingular: string;
  orgPlural: string;
}

/** Visual theme color tokens per vertical */
export interface VerticalTheme {
  sidebarIcon: string;
  sidebarActiveText: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
  accentBg: string;
  accentText: string;
}

export const VERTICAL_THEMES: Record<TenantType, VerticalTheme> = {
  municipal: {
    sidebarIcon: 'text-blue-400',
    sidebarActiveText: 'text-blue-400',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    headerBorder: 'border-blue-600',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-700',
  },
  military: {
    sidebarIcon: 'text-lime-400',
    sidebarActiveText: 'text-lime-400',
    badgeBg: 'bg-lime-100',
    badgeText: 'text-lime-800',
    headerBorder: 'border-lime-700',
    accentBg: 'bg-lime-50',
    accentText: 'text-lime-700',
  },
  educational: {
    sidebarIcon: 'text-orange-400',
    sidebarActiveText: 'text-orange-400',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800',
    headerBorder: 'border-orange-500',
    accentBg: 'bg-orange-50',
    accentText: 'text-orange-700',
  },
  company: {
    sidebarIcon: 'text-sky-400',
    sidebarActiveText: 'text-sky-400',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    headerBorder: 'border-sky-600',
    accentBg: 'bg-sky-50',
    accentText: 'text-sky-700',
  },
  youth_movement: {
    sidebarIcon: 'text-emerald-400',
    sidebarActiveText: 'text-emerald-400',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    headerBorder: 'border-emerald-600',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
  },
};

export const TENANT_LABELS: Record<TenantType, TenantLabelSet> = {
  municipal: {
    orgTypeLabel: 'עירוני',
    portalBadge: 'פורטל עירוני',
    portalTitle: 'מנהלת ספורט',
    subUnitsTitle: 'שכונות',
    subUnitSingular: 'שכונה',
    membersTitle: 'תושבים',
    memberSingular: 'תושב',
    readinessTitle: 'מדד בריאות',
    dashboardTitle: 'דשבורד עירוני',
    hierarchyLabels: ['עיר', 'שכונה'],
    managerTitle: 'רכזים',
    managerSingular: 'רכז',
    teamTitle: 'ניהול צוות רשותי',
    orgSingular: 'רשות',
    orgPlural: 'רשויות',
  },
  military: {
    orgTypeLabel: 'צבאי',
    portalBadge: 'פורטל צבאי',
    portalTitle: 'מפקד כושר',
    subUnitsTitle: 'יחידות',
    subUnitSingular: 'יחידה',
    membersTitle: 'חיילים',
    memberSingular: 'חייל',
    readinessTitle: 'כשירות',
    dashboardTitle: 'דשבורד כשירות',
    hierarchyLabels: ['חטיבה', 'גדוד', 'פלוגה', 'מחלקה'],
    managerTitle: 'קצינים',
    managerSingular: 'קצין',
    teamTitle: 'ניהול צוות צבאי',
    orgSingular: 'חטיבה',
    orgPlural: 'חטיבות',
  },
  educational: {
    orgTypeLabel: 'חינוכי',
    portalBadge: 'פורטל חינוכי',
    portalTitle: 'מורה לחנ"ג',
    subUnitsTitle: 'כיתות',
    subUnitSingular: 'כיתה',
    membersTitle: 'תלמידים',
    memberSingular: 'תלמיד',
    readinessTitle: 'ציוני חנ"ג',
    dashboardTitle: 'דשבורד בית ספר',
    hierarchyLabels: ['בית ספר', 'שכבה', 'כיתה'],
    // §13.40 — proposed by pattern-match with the existing portalTitle
    // ('מורה לחנ"ג'), not from an explicit instruction — flagged for
    // confirmation in the completion report, same as the officer-title
    // equivalents in §13.40's item 1.
    managerTitle: 'רכזי חנ"ג',
    managerSingular: 'רכז חנ"ג',
    teamTitle: 'ניהול צוות בית ספר',
    orgSingular: 'בית ספר',
    orgPlural: 'בתי ספר',
  },
  company: {
    orgTypeLabel: 'ארגון',
    portalBadge: 'פורטל ארגוני',
    portalTitle: 'מנהל/ת רווחה',
    subUnitsTitle: 'מחלקות',
    subUnitSingular: 'מחלקה',
    membersTitle: 'עובדים',
    memberSingular: 'עובד',
    readinessTitle: 'מדד בריאות',
    dashboardTitle: 'דשבורד ארגוני',
    hierarchyLabels: ['חברה', 'מחלקה', 'צוות'],
    managerTitle: 'מנהלים',
    managerSingular: 'מנהל',
    teamTitle: 'ניהול צוות ארגוני',
    orgSingular: 'חברה',
    orgPlural: 'חברות',
  },
  youth_movement: {
    orgTypeLabel: 'תנועת נוער',
    portalBadge: 'פורטל תנועה',
    portalTitle: 'רכז/ת',
    subUnitsTitle: 'קנים',
    subUnitSingular: 'קן',
    membersTitle: 'חניכים',
    memberSingular: 'חניך',
    readinessTitle: 'מדד פעילות',
    dashboardTitle: 'דשבורד תנועה',
    hierarchyLabels: ['תנועה', 'מחוז', 'קן', 'שכבה'],
    managerTitle: 'רכזים',
    managerSingular: 'רכז',
    teamTitle: 'ניהול צוות תנועה',
    orgSingular: 'תנועה',
    orgPlural: 'תנועות',
  },
};

export const ORG_TYPE_OPTIONS: { value: TenantType; label: string }[] = [
  { value: 'municipal', label: 'רשות מקומית (עירוני)' },
  { value: 'military', label: 'יחידה צבאית' },
  { value: 'educational', label: 'מוסד חינוכי' },
  { value: 'company', label: 'ארגון / חברה' },
  { value: 'youth_movement', label: 'תנועת נוער' },
];

export function getTenantLabels(tenantType?: TenantType | string | null): TenantLabelSet {
  if (tenantType && tenantType in TENANT_LABELS) {
    return TENANT_LABELS[tenantType as TenantType];
  }
  return TENANT_LABELS.municipal;
}

/** Alias kept for backward compatibility */
export const getOrgLabels = getTenantLabels;

function classifyByTypeString(authorityType?: string | null): TenantType {
  if (!authorityType) return 'municipal';
  const t = authorityType.toLowerCase();
  if (t === 'military' || t === 'military_unit' || t.includes('military') || t.includes('army') || t.includes('צבא')) return 'military';
  if (t === 'educational' || t === 'school' || t.includes('school') || t.includes('education') || t.includes('חינוך')) return 'educational';
  return 'municipal';
}

/**
 * Resolves an authority's real vertical. `AuthorityType` (the `type` field)
 * has no 'company'/'youth_movement' value — those orgs are stored with
 * type='city' and get their real vertical from `tenantType` or the legacy
 * `vertical` field instead (see the comment on `Authority.tenantType` in
 * admin-types.ts). Passing just `.type` as a bare string — several call
 * sites still do this — silently collapses company/youth_movement orgs
 * into 'municipal', the same class of bug fixed in /admin/access-codes on
 * 01.09.2026. Prefer passing the whole authority/org object; the plain
 * string overload is kept only for callers that truly have nothing else.
 */
export function authorityTypeToTenantType(
  authority?: { type?: string | null; tenantType?: TenantType | string | null; vertical?: string | null } | string | null,
): TenantType {
  if (!authority) return 'municipal';
  if (typeof authority === 'string') return classifyByTypeString(authority);
  if (authority.tenantType && authority.tenantType in TENANT_LABELS) return authority.tenantType as TenantType;
  if (authority.vertical && authority.vertical in TENANT_LABELS) return authority.vertical as TenantType;
  return classifyByTypeString(authority.type);
}

export function orgTypeDisplayName(t?: TenantType | string | null): string {
  if (t && t in TENANT_LABELS) return TENANT_LABELS[t as TenantType].orgTypeLabel;
  return 'עירוני';
}
