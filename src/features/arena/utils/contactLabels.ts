/**
 * Resolves a human-readable contact-role label based on groupType or tenantType.
 * Used by the Access Code Gate UI to render dynamic CTAs like
 * "פנה למפקד כושר" or "פנה למורה לחנ"ג".
 */

export interface ContactLabel {
  he: string;
  icon: string;
}

const CONTACT_LABELS: Record<string, ContactLabel> = {
  military:     { he: 'מפקד כושר',      icon: '🎖️' },
  school:       { he: 'מורה לחנ"ג',     icon: '🏫' },
  university:   { he: 'רכז/ת ספורט',    icon: '🎓' },
  work:         { he: 'מנהל/ת רווחה',   icon: '💼' },
  neighborhood: { he: 'מנהל הקבוצה',    icon: '🏘️' },
};

const DEFAULT_LABEL: ContactLabel = { he: 'מנהל הארגון', icon: '📩' };

export function getContactLabel(
  groupType?: string | null,
  tenantType?: string | null,
): ContactLabel {
  return CONTACT_LABELS[tenantType || '']
      || CONTACT_LABELS[groupType || '']
      || DEFAULT_LABEL;
}
