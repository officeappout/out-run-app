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
};

export const ORG_TYPE_OPTIONS: { value: TenantType; label: string }[] = [
  { value: 'municipal', label: 'רשות מקומית (עירוני)' },
  { value: 'military', label: 'יחידה צבאית' },
  { value: 'educational', label: 'מוסד חינוכי' },
];

export function getTenantLabels(tenantType?: TenantType | string | null): TenantLabelSet {
  if (tenantType && tenantType in TENANT_LABELS) {
    return TENANT_LABELS[tenantType as TenantType];
  }
  return TENANT_LABELS.municipal;
}

/** Alias kept for backward compatibility */
export const getOrgLabels = getTenantLabels;

export function authorityTypeToTenantType(authorityType?: string | null): TenantType {
  if (!authorityType) return 'municipal';
  const t = authorityType.toLowerCase();
  if (t === 'military' || t === 'military_unit' || t.includes('military') || t.includes('army') || t.includes('צבא')) return 'military';
  if (t === 'educational' || t === 'school' || t.includes('school') || t.includes('education') || t.includes('חינוך')) return 'educational';
  return 'municipal';
}

export function orgTypeDisplayName(t?: TenantType | string | null): string {
  if (t && t in TENANT_LABELS) return TENANT_LABELS[t as TenantType].orgTypeLabel;
  return 'עירוני';
}
