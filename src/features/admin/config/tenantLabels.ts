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
