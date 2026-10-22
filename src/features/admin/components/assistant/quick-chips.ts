/** The six "תשובה מהירה" chips (plan §9), in display order. Pure data, shared with tests. */
export const QUICK_CHIPS: Array<{ metric: string; label: string; rootOnly?: boolean }> = [
  { metric: 'pending_approvals', label: 'ממתינים לאישור' },
  { metric: 'ai_cost_today', label: 'עלות AI היום' },
  { metric: 'crm_pipeline', label: 'צנרת CRM' },
  { metric: 'wae_week', label: 'WAE השבוע' },
  { metric: 'signup_failures_week', label: 'כשלי הרשמה השבוע', rootOnly: true },
  { metric: 'cities_mapping', label: 'ערים במיפוי' },
];
