/**
 * adminNavItems — the main admin sidebar's links as DATA (22.10.2026, admin AI assistant
 * plan wave 2, docs/admin/ADMIN-AI-ASSISTANT-PLAN.md §3.2). Before this, the links lived only
 * as hand-written JSX in src/app/admin/layout.tsx; now layout.tsx renders them from here and
 * the generated admin page map (scripts/gen-admin-page-map.ts) reads the same labels, so a
 * page's name in the assistant is the name on the sidebar.
 *
 * Pure data, zero React/Firebase imports. Moving a link = edit here only.
 *
 * What stays in layout.tsx (not data, on purpose):
 *   - whether a whole SECTION shows (role booleans: hasSec / isSystemAdminOnly / …);
 *   - the military section's items (MILITARY_ROOT_NAV_ITEMS, already data, own active logic);
 *   - the scoped-role sidebars (sidebarConfigs.ts) and the fallback sidebar.
 *
 * `audience` is a sidebar UX filter only — the real gate is the middleware / each API route
 * (axiom §26). `active` overrides SidebarLink's default "starts with href" highlight.
 */
import type { AdminSectionId } from './adminSections';

export type AdminNavIconName =
  | 'Activity' | 'AlertCircle' | 'BarChart3' | 'Bell' | 'Bot' | 'Building2' | 'Camera' | 'ClipboardCheck'
  | 'ClipboardList' | 'Compass' | 'Dumbbell' | 'FileText' | 'Flag' | 'FlaskConical' | 'GitBranch'
  | 'GitMerge' | 'Globe' | 'GraduationCap' | 'KeyRound' | 'LayoutDashboard' | 'LayoutGrid'
  | 'LineChart' | 'Link2' | 'ListChecks' | 'ListTodo' | 'Map' | 'MapPinned' | 'Megaphone'
  | 'MessageCircle' | 'Package' | 'SearchX' | 'Settings' | 'Shield' | 'ShieldCheck' | 'Signal'
  | 'TrendingUp' | 'Users' | 'UsersRound' | 'Video' | 'Wallet' | 'Zap';

/** Extra visibility of ONE link inside a visible section (sidebar UX only). */
export type AdminNavAudience =
  | 'superAdmin'           // core.isSuperAdmin
  | 'rootAdmin'            // david@ / office@
  | 'superOrRoot'
  | 'authorityManagerLink' // layout's showAuthorityManagerLink
  | 'cityMappingLink';     // layout's showCityMappingLink

export type AdminNavActive =
  /** pathname === href */
  | { kind: 'exact' }
  /** starts with href, but not with any of `except` */
  | { kind: 'prefixExcept'; except: string[] }
  /** pathname === one of `exact`, or starts with one of `prefixes` */
  | { kind: 'anyOf'; exact?: string[]; prefixes?: string[] }
  /** shared /admin/authority/{units,team} screens: lit only in this vertical's context */
  | { kind: 'vertical'; vertical: 'municipal' | 'educational'; defaultWhenNoOrg?: boolean };

export interface AdminNavLink {
  href: string;
  label: string;
  icon: AdminNavIconName;
  audience?: AdminNavAudience;
  active?: AdminNavActive;
}

export interface AdminNavGroup {
  group: string;
  links: AdminNavLink[];
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

export interface AdminNavSection {
  id: AdminSectionId;
  label: string;
  icon: AdminNavIconName;
  /** Vertical sections get the vertical's icon color + side border (layout.tsx). */
  vertical?: 'municipal' | 'military' | 'educational';
  /** Military renders MILITARY_ROOT_NAV_ITEMS (militaryNavItems.ts) instead of `entries`. */
  entries: AdminNavEntry[];
}

export function isNavGroup(e: AdminNavEntry): e is AdminNavGroup {
  return 'group' in e;
}

/** Every link of a section, groups flattened, in sidebar order. */
export function sectionLinks(section: AdminNavSection): AdminNavLink[] {
  return section.entries.flatMap((e) => (isNavGroup(e) ? e.links : [e]));
}

/** In sidebar order — layout.tsx renders the sections in exactly this order. */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: 'strategy',
    label: 'אסטרטגיה / קלי',
    icon: 'TrendingUp',
    entries: [
      { href: '/admin', label: 'דשבורד ראשי', icon: 'LayoutDashboard' },
      { href: '/admin/master-roadmap', label: 'מפת דרכים מאוחדת', icon: 'LayoutGrid' },
      { href: '/admin/roadmap', label: 'מפת דרכים — פיתוח', icon: 'ListTodo' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM / מכירות',
    icon: 'Building2',
    entries: [
      { href: '/admin/authorities', label: 'ניהול רשויות', icon: 'Building2' },
      { href: '/admin/organizations', label: 'ארגונים', icon: 'Globe' },
      // (ספריית מנהלים → a tab of "אנשים והרשאות")
    ],
  },
  {
    id: 'municipal',
    label: 'ניהול עירוני',
    icon: 'Building2',
    vertical: 'municipal',
    entries: [
      { href: '/admin/authority/units?type=municipal', label: 'שכונות ויישובים', icon: 'Users', active: { kind: 'vertical', vertical: 'municipal' } },
      { href: '/admin/authority/team?type=municipal', label: 'ניהול צוות רשותי', icon: 'Users', active: { kind: 'vertical', vertical: 'municipal', defaultWhenNoOrg: true } },
      { href: '/admin/authority-manager', label: 'דשבורד אנליטיקה', icon: 'BarChart3', audience: 'authorityManagerLink' },
      { href: '/admin/approval-center', label: 'מרכז אישורים', icon: 'ShieldCheck' },
      { href: '/admin/city-mapping', label: 'מיפוי עיר', icon: 'MapPinned', audience: 'cityMappingLink' },
      { href: '/admin/pressure-messages', label: 'מסרי לחץ', icon: 'Megaphone' },
      { href: '/admin/authority/reports', label: 'דיווחי תחזוקה', icon: 'Flag' },
      { href: '/admin/heatmap', label: 'מפת חום חיה', icon: 'Activity' },
    ],
  },
  {
    // 24.09.2026 — was "צי צבאי"; renamed to match the sibling labels ("ניהול עירוני").
    id: 'military',
    label: 'ניהול צבאי',
    icon: 'ShieldCheck',
    vertical: 'military',
    entries: [],
  },
  {
    id: 'educational',
    label: 'רשת חינוכית',
    icon: 'GraduationCap',
    vertical: 'educational',
    entries: [
      { href: '/admin/authority/units?type=educational', label: 'בתי ספר ושכבות', icon: 'GraduationCap', active: { kind: 'vertical', vertical: 'educational' } },
      { href: '/admin/authority/grades', label: 'ציוני חנ״ג', icon: 'ClipboardCheck' },
      { href: '/admin/photo-release', label: 'אישורי צילום', icon: 'Camera' },
    ],
  },
  {
    id: 'marketing',
    label: 'שיווק ותוכן',
    icon: 'Megaphone',
    // grouped by job (audit 15.10.2026) — same links, same access
    entries: [
      { href: '/admin/marketing-hub', label: 'תור תוכן', icon: 'LayoutGrid' },
      { href: '/admin/web-traffic', label: 'תנועה באתר', icon: 'Globe' },
      { href: '/admin/links', label: 'מרכז קישורים שיווקיים', icon: 'Link2' },
      {
        group: 'תקשורת באפליקציה',
        links: [
          { href: '/admin/notifications', label: 'מרכז התראות', icon: 'Bell', active: { kind: 'exact' } },
          { href: '/admin/notifications/library', label: 'ספריית פושים', icon: 'FileText' },
          { href: '/admin/messages', label: 'הודעות חכמות', icon: 'MessageCircle' },
          { href: '/admin/workout-settings', label: 'שפה ותיאורי אימונים', icon: 'FileText' },
        ],
      },
      {
        group: 'הפקת תוכן',
        links: [
          { href: '/admin/content-matrix', label: 'ימי צילום', icon: 'Video' },
          { href: '/admin/media-library', label: 'כיסוי מדיה לתרגילים', icon: 'LayoutGrid' },
        ],
      },
      {
        group: 'כלי בדיקה',
        links: [
          { href: '/admin/simulator', label: 'סימולטור התראה ← אימון', icon: 'Bell' },
          { href: '/admin/workout-simulator', label: 'סימולטור אימונים', icon: 'FlaskConical' },
          { href: '/admin/unreachable-exercises', label: 'תרגילים שלא נשלפים', icon: 'SearchX' },
        ],
      },
    ],
  },
  {
    id: 'product',
    label: 'ניהול מוצר / צמיחה',
    icon: 'LineChart',
    entries: [
      // Journey hub — analytics / statistics / insights folded into it (owner, 15.10.2026)
      { href: '/admin/journey', label: 'מסע משתמש', icon: 'Compass' },
      { href: '/admin/users/all', label: 'כל המשתמשים', icon: 'Users' },
      // cross-city moderation — super admins only
      { href: '/admin/community-groups-overview', label: 'כל הקבוצות במערכת', icon: 'UsersRound', audience: 'superAdmin' },
      // onboarding goal notes — super admins only (API: requireSuperAdminApi)
      { href: '/admin/goal-notes', label: 'מה עוד חשוב למשתמשים', icon: 'MessageCircle', audience: 'superAdmin' },
    ],
  },
  {
    id: 'finance',
    label: 'כספים',
    icon: 'Wallet',
    entries: [
      { href: '/admin/finance/approvals', label: 'תור אישור חשבוניות', icon: 'Wallet' },
      { href: '/admin/finance/expenses', label: 'ספר הוצאות', icon: 'LayoutGrid' },
    ],
  },
  {
    // was "פיתוח" (audit 15.10.2026) — same section key ('dev'), same links, same access.
    id: 'dev',
    label: 'תוכן ומערכת',
    icon: 'Zap',
    entries: [
      {
        group: 'תוכן אימונים',
        links: [
          { href: '/admin/exercises', label: 'בנק תרגילים', icon: 'Dumbbell', active: { kind: 'prefixExcept', except: ['/admin/exercises/swap-stats'] } },
          // soft-adaptation Phase 0 — anonymous swap counters (read-only)
          { href: '/admin/exercises/swap-stats', label: 'תרגילים שמחליפים הכי הרבה', icon: 'BarChart3' },
          { href: '/admin/programs', label: 'תוכניות אימון', icon: 'ClipboardList' },
          // one area, tabs inside (EquipmentTabs): machines, brands, gear, audit
          { href: '/admin/gym-equipment', label: 'ציוד ומתקנים', icon: 'Package', active: { kind: 'anyOf', prefixes: ['/admin/gym-equipment', '/admin/brands', '/admin/gear-definitions', '/admin/audit-equipment'] } },
        ],
      },
      {
        group: 'רמות והערכה (לפי סדר הזרימה)',
        links: [
          { href: '/admin/questionnaire', label: 'שאלון אונבורדינג', icon: 'ClipboardList' },
          { href: '/admin/visual-assessment', label: 'הערכה ויזואלית', icon: 'Video' },
          { href: '/admin/assessment-rules', label: 'מנוע כללים', icon: 'GitBranch' },
          { href: '/admin/program-thresholds', label: 'סיפי תוכנית', icon: 'BarChart3' },
          { href: '/admin/levels', label: 'רמות ו־XP', icon: 'Signal' },
          { href: '/admin/progression-manager', label: 'מנהל התקדמות', icon: 'TrendingUp' },
          { href: '/admin/level-equivalence', label: 'שקילות רמות', icon: 'Zap' },
        ],
      },
      {
        group: 'מפה',
        links: [{ href: '/admin/locations', label: 'מיקומים ומסלולים', icon: 'Map' }],
      },
      {
        group: 'מנוע ריצה',
        links: [
          { href: '/admin/running', label: 'דשבורד ריצה', icon: 'LayoutDashboard' },
          { href: '/admin/running/pace-map', label: 'מפת קצבים', icon: 'Activity' },
          { href: '/admin/running/workouts', label: 'תבניות אימונים', icon: 'Dumbbell' },
          { href: '/admin/running/programs', label: 'תוכניות ריצה', icon: 'GitMerge' },
        ],
      },
      {
        group: 'מערכת והרשאות',
        links: [
          // one area, tabs inside (PeopleTabs): users & admin rights, system admins, directory + invitations
          { href: '/admin/users', label: 'אנשים והרשאות', icon: 'Shield', active: { kind: 'anyOf', exact: ['/admin/users'], prefixes: ['/admin/admins-management', '/admin/admin-directory'] } },
          { href: '/admin/access-codes', label: 'קודי גישה', icon: 'KeyRound' },
          { href: '/admin/audit-logs', label: 'יומן ביקורת', icon: 'FileText' },
          // Root only — UX gate; the real boundary is /api/admin/agents/** (generic 403 for non-root).
          { href: '/admin/agents', label: 'פאנל סוכנים', icon: 'Bot', audience: 'rootAdmin' },
          { href: '/admin/signup-failures', label: 'כשלי הרשמה', icon: 'AlertCircle', audience: 'rootAdmin' },
          { href: '/admin/system-settings', label: 'הגדרות מערכת', icon: 'Settings', audience: 'superAdmin' },
          // daily AI review of the קלי AI chat (API: requireSuperAdminApi)
          { href: '/admin/ai-coach/reviews', label: 'שיחות קלי', icon: 'MessageCircle', audience: 'superAdmin' },
          // FAQ / articles / help — one source for the app + website (API: requireSuperAdminApi)
          { href: '/admin/content', label: 'תוכן ושאלות', icon: 'MessageCircle', audience: 'superAdmin' },
          // platform running costs (API: requireSuperAdminApi)
          { href: '/admin/costs', label: 'עלויות', icon: 'Wallet', audience: 'superAdmin' },
          // demo control center — live switches, tester runs, live cost (API: requireSuperAdminApi)
          { href: '/admin/demo', label: 'מרכז הדמו', icon: 'Bot', audience: 'superAdmin' },
          // nightly review of generated workouts / routes (API: requireSuperAdminApi)
          { href: '/admin/generation-review', label: 'בקרת אימונים ומסלולים', icon: 'ListChecks', audience: 'superAdmin' },
          // unified Kelly: the team's queue + replies (API: requireKellyTeamAdmin)
          { href: '/admin/ai-coach/kelly', label: 'קלי · ממתינים למענה', icon: 'MessageCircle', audience: 'superOrRoot' },
          // Kelly phase 3: proactive sends + preview (API: requireKellyTeamAdmin)
          { href: '/admin/ai-coach/proactive', label: 'קלי · הודעות יזומות', icon: 'MessageCircle', audience: 'superOrRoot' },
        ],
      },
      // "כלי דמו" (/admin/demo-seed) removed 20.10.2026 — the old in-browser seeder is disabled.
    ],
  },
];
