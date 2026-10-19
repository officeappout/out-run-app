/**
 * Connector catalogue — labels, env var NAMES and Hebrew setup steps. Client-safe: no values,
 * only names. The server reports configured: true/false per connector, never the env value.
 */
import type { ConnectorId, VendorKey } from './cost-types';

export interface ConnectorMeta {
  id: ConnectorId;
  vendor: VendorKey;
  label: string;
  /** higher wins when two connectors report the same vendor (Anthropic admin > our ledger) */
  priority: number;
  /** env vars that must ALL be set; empty = always available */
  requiredEnv: string[];
  optionalEnv?: string[];
  /** Hebrew setup steps, shown under "לא מחובר" */
  setupHe: string[];
  /** can fetch any past month (true) or only the running month (false) */
  historical: boolean;
}

export const VENDOR_LABEL_HE: Record<VendorKey, string> = {
  anthropic: 'Anthropic · קלי AI',
  gcp: 'Google Cloud / Firebase',
  vercel: 'Vercel',
  bunny: 'Bunny CDN',
  github: 'GitHub',
  mapbox: 'Mapbox',
};

export const CONNECTORS: ConnectorMeta[] = [
  {
    id: 'ai_ledger',
    vendor: 'anthropic',
    label: 'קלי AI — יומן השימוש שלנו (הערכה)',
    priority: 1,
    requiredEnv: [],
    historical: true,
    setupHe: ['עובד בלי הגדרה: סוכם מ-ai_usage_global (עלות משוערת לפי מחירון, לכל קריאה של קלי).'],
  },
  {
    id: 'anthropic_admin',
    vendor: 'anthropic',
    label: 'Anthropic — דוח עלויות רשמי',
    priority: 2,
    requiredEnv: ['ANTHROPIC_ADMIN_KEY'],
    historical: true,
    setupHe: [
      'ב-Claude Console ← Settings ← Admin keys ← "Create admin key" (נדרש תפקיד admin בארגון). המפתח מתחיל ב-sk-ant-admin.',
      'ב-Vercel ← Project ← Settings ← Environment Variables: להוסיף ANTHROPIC_ADMIN_KEY (Production בלבד) ולפרוס מחדש.',
      'כשמחובר, הוא מחליף את ההערכה מהיומן שלנו לאותו ספק (אין ספירה כפולה).',
    ],
  },
  {
    id: 'gcp_billing',
    vendor: 'gcp',
    label: 'Google Cloud / Firebase (כולל Cloud Run GraphHopper)',
    priority: 1,
    requiredEnv: ['GCP_BILLING_EXPORT_TABLE'],
    optionalEnv: ['GCP_BILLING_SA_KEY'],
    historical: true,
    setupHe: [
      'Google Cloud Console ← Billing ← Billing export ← BigQuery export ← "Standard usage cost" ← Edit settings: לבחור פרויקט (appout-1) ו-dataset חדש, למשל billing_export (מיקום EU). הנתונים מתחילים להגיע תוך כמה שעות, מהיום והלאה בלבד.',
      'IAM: לתת לחשבון השירות של Firebase Admin (זה שב-FIREBASE_SERVICE_ACCOUNT_KEY) את התפקידים BigQuery Job User על הפרויקט ו-BigQuery Data Viewer על ה-dataset.',
      'ב-Vercel: GCP_BILLING_EXPORT_TABLE = project.dataset.table, למשל appout-1.billing_export.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX (השם המדויק מופיע ב-BigQuery אחרי שהטבלה נוצרה).',
    ],
  },
  {
    id: 'vercel',
    vendor: 'vercel',
    label: 'Vercel',
    priority: 1,
    requiredEnv: ['VERCEL_BILLING_TOKEN', 'VERCEL_TEAM_ID'],
    historical: true,
    setupHe: [
      'vercel.com ← Account Settings ← Tokens ← Create: טוקן עם Scope של הצוות (תפקיד Owner / Billing / Member בצוות).',
      'Team ID: Team Settings ← General ← "Team ID" (מתחיל ב-team_).',
      'ב-Vercel env: VERCEL_BILLING_TOKEN ו-VERCEL_TEAM_ID.',
    ],
  },
  {
    id: 'bunny',
    vendor: 'bunny',
    label: 'Bunny CDN / Stream',
    priority: 1,
    requiredEnv: ['BUNNY_ACCOUNT_API_KEY'],
    historical: false,
    setupHe: [
      'BUNNY_API_KEY הקיים הוא מפתח של ספריית הווידאו (Stream) ולא עובד מול חיוב החשבון.',
      'dash.bunny.net ← Account settings ← API key: להעתיק את מפתח החשבון.',
      'ב-Vercel env: BUNNY_ACCOUNT_API_KEY. בני מחזיר רק את החודש הרץ — החודשים הקודמים נשמרים מהצילום היומי האחרון.',
    ],
  },
  {
    id: 'github',
    vendor: 'github',
    label: 'GitHub',
    priority: 1,
    requiredEnv: ['GITHUB_BILLING_TOKEN'],
    optionalEnv: ['GITHUB_BILLING_ORG'],
    historical: true,
    setupHe: [
      'github.com ← Settings ← Developer settings ← Fine-grained tokens ← Generate: Resource owner = הארגון officeappout, הרשאת ארגון Administration: Read-only. בעל הטוקן צריך להיות owner או billing manager בארגון.',
      'ב-Vercel env: GITHUB_BILLING_TOKEN (ואם הארגון אינו officeappout — גם GITHUB_BILLING_ORG).',
      'מנוי GitHub קבוע (Team וכו׳) — אם אינו מופיע בדוח השימוש, להוסיף כפריט ידני.',
    ],
  },
  {
    id: 'mapbox',
    vendor: 'mapbox',
    label: 'Mapbox',
    priority: 1,
    requiredEnv: [],
    historical: true,
    setupHe: [
      'ל-Mapbox אין API חיוב, ואין אצלנו מונה שימוש משלנו. החשבונית ב-account.mapbox.com ← Invoices.',
      'להוסיף כפריט ידני (חודשי) עם הסכום מהחשבונית האחרונה. עד 50,000 טעינות מפה בחודש — חינם.',
    ],
  },
];

export const CONNECTOR_BY_ID: Record<ConnectorId, ConnectorMeta> = Object.fromEntries(
  CONNECTORS.map((c) => [c.id, c]),
) as Record<ConnectorId, ConnectorMeta>;

export function isConfigured(meta: ConnectorMeta, env: Record<string, string | undefined>): boolean {
  return meta.requiredEnv.every((k) => typeof env[k] === 'string' && env[k]!.trim().length > 0);
}
