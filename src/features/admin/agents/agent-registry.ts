/**
 * Agents & automations registry — the ONE list of every agent / automation
 * the system runs, shown grouped by topic on /admin/agents.
 *
 * Two layers:
 *   - AUTOMATION_REGISTRY — every automation (Cloud Functions schedules and
 *     triggers, Vercel crons, on-demand admin tools). Display data + a
 *     declarative, read-only status source.
 *   - AGENT_REGISTRY — the subset that writes findings to agents/{id}
 *     (today: oncall only). The findings routes reject any agentId that is
 *     not in THIS list, so adding a display-only automation never widens
 *     what /api/admin/agents/[agentId]/findings accepts.
 *
 * Adding an automation = one entry here. Its status source (if any) is read
 * server-side by computeAutomationStatuses (src/lib/agentsPanelServer.ts)
 * with the Admin SDK: newest doc of `collection` by `orderByField`, reading
 * ONLY the whitelisted `fields` (via select) — never user content.
 *
 * Pure data (no React, no Firebase) so it is importable from both the
 * client panel and the server routes.
 */

export type AutomationTopic =
  | 'routes'
  | 'leagues'
  | 'crm'
  | 'ops'
  | 'content'
  | 'notifications';

export const AUTOMATION_TOPICS: readonly { id: AutomationTopic; label: string }[] = [
  { id: 'routes', label: 'מסלולים ומיפוי' },
  { id: 'leagues', label: 'ליגות וקהילה' },
  { id: 'crm', label: 'CRM ורשויות' },
  { id: 'ops', label: 'תפעול ויציבות' },
  { id: 'content', label: 'תוכן ואימונים' },
  { id: 'notifications', label: 'התראות' },
];

export type AutomationKind = 'scheduled' | 'trigger' | 'cron' | 'on-demand';

export const AUTOMATION_KIND_LABEL: Record<AutomationKind, string> = {
  scheduled: 'פונקציה מתוזמנת',
  trigger: 'טריגר',
  cron: 'Cron (Vercel)',
  'on-demand': 'לפי דרישה',
};

/**
 * active      — in the code and exported for deploy.
 * not-deployed — the code itself says it is not deployed yet (index.ts).
 * planned     — registered, no implementation yet.
 */
export type AutomationLifecycle = 'active' | 'not-deployed' | 'planned';

/**
 * Where the panel reads "last run" from. Every source is one indexed
 * single-field query (newest doc), read with the Admin SDK — no rules
 * change, no composite index.
 *   - latestDoc: newest doc of `collection` ordered by `orderByField` desc.
 *     `statusField` (optional) is a short enum-like string shown as-is
 *     (e.g. succeeded / failed). `countFields` are numbers shown as a summary.
 *   - agentDoc: the agents/{id} health doc (agents with findings).
 */
export type StatusSource =
  | {
      kind: 'latestDoc';
      collection: string;
      orderByField: string;
      /** Hebrew label for the timestamp, e.g. "ריצה אחרונה". */
      label: string;
      statusField?: string;
      /** Top-level numeric fields or `parent.child` paths, with Hebrew labels. */
      countFields?: readonly { path: string; label: string }[];
      /** Caveat shown under the status (what this marker does / doesn't prove). */
      note?: string;
    }
  | { kind: 'agentDoc' };

export interface AutomationDefinition {
  id: string;
  /** Hebrew name. */
  name: string;
  /** Short Hebrew description of what it does. */
  description: string;
  topic: AutomationTopic;
  kind: AutomationKind;
  /** Human schedule / trigger text (Hebrew, Israel time unless stated). */
  schedule: string;
  /** Where it writes (collections / external systems). */
  writesTo: string;
  /** Code location, for whoever maintains it. */
  source: string;
  /** Existing admin screen for this automation, if any. */
  adminHref?: string;
  /** Flag the code checks before doing anything (display only). */
  gate?: string;
  lifecycle: AutomationLifecycle;
  statusSource: StatusSource | null;
  /** True = writes findings to agents/{id}/findings (findings UI + routes). */
  hasFindings?: boolean;
}

export const AUTOMATION_REGISTRY: readonly AutomationDefinition[] = [
  // ── מסלולים ומיפוי ────────────────────────────────────────────────────────
  {
    id: 'geo-discovery',
    name: 'גילוי מסלולים לעיר',
    description: 'מושך בקשות מיפוי עיר שממתינות, מריץ גילוי מסלולים מ-OSM ושומר את התוצאה על אותה בקשה.',
    topic: 'routes',
    kind: 'scheduled',
    schedule: 'כל 5 דקות (בודק אם יש בקשה ממתינה)',
    writesTo: 'city_mapping_discovery_runs, מסלולים לעיר',
    source: 'functions/src/geoDiscoveryWorker.ts · cityMappingDiscoveryPoller',
    adminHref: '/admin/city-mapping',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'city_mapping_discovery_runs',
      orderByField: 'createdAt',
      label: 'בקשה אחרונה',
      statusField: 'status',
      countFields: [
        { path: 'keptCount', label: 'נשמרו' },
        { path: 'droppedCount', label: 'נפסלו' },
      ],
    },
  },
  {
    id: 'route-accuracy',
    name: 'בודק דיוק מסלולים',
    description: 'מחשב לכל מסלול המלצה (לפרסם / לבדוק / לפסול) לפי הרכב השבילים, תאורה, אורך וכפילויות שם. כל החלטת מנהל נרשמת יחד עם ההמלצה.',
    topic: 'routes',
    kind: 'on-demand',
    schedule: 'בכל פתיחה של תור הדיוק, ובכל אישור / דחייה / עריכה של מסלול',
    writesTo: 'route_decisions (יומן החלטות — רק קריאה בתור עצמו)',
    source: 'src/lib/route-decisions/* · /api/admin/routes/accuracy-queue',
    adminHref: '/admin/approval-center',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'route_decisions',
      orderByField: 'decidedAt',
      label: 'החלטה אחרונה שנרשמה',
      statusField: 'decisionType',
    },
  },
  {
    id: 'shape-review',
    name: 'סקירת צורת מסלולים',
    description: 'מסך סקירה גאומטרי למסלולים שלא פורסמו — רשימה ומפה לפי עיר, לאיסוף החלטות אימון.',
    topic: 'routes',
    kind: 'on-demand',
    schedule: 'ידני, מהמסך',
    writesTo: 'route_decisions (דרך חלון האישור)',
    source: 'src/app/admin/routes/shape-review/page.tsx',
    adminHref: '/admin/routes/shape-review',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'dem-recompute',
    name: 'חישוב גובה ושיפוע מחדש',
    description: 'אחרי עריכת מסלול — מושך נתוני גובה חיים ומחזיר שיפוע ורמת קושי אמיתיים (בלי ניחוש).',
    topic: 'routes',
    kind: 'on-demand',
    schedule: 'בעריכת גאומטריה של מסלול',
    writesTo: 'לא כותב (החישוב חוזר לעורך המסלול)',
    source: 'src/app/api/admin/routes/dem-recompute/route.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'osm-amenity-write',
    name: 'מתקן כושר שאושר → פארק',
    description: 'כשמאשרים מתקן כושר מ-OSM: מקשר לפארק קרוב (ומסמן שחסרים פרטי מתקנים) או יוצר פארק חדש.',
    topic: 'routes',
    kind: 'trigger',
    schedule: 'בכל שינוי ב-osm_amenities',
    writesTo: 'parks, osm_amenities',
    source: 'functions/src/onOsmAmenityWrite.ts',
    adminHref: '/admin/approval-center',
    lifecycle: 'active',
    statusSource: null,
  },

  // ── ליגות וקהילה ──────────────────────────────────────────────────────────
  {
    id: 'league-steps-rollup',
    name: 'צעדים לליגות',
    description: 'מוסיף את הצעדים של היום ואתמול לליגות (3 נקודות לכל 1,000 צעדים) ואת הק״מ בנפרד. אידמפוטנטי — מוסיף רק את מה שחדש.',
    topic: 'leagues',
    kind: 'scheduled',
    schedule: 'כל שעה, ב-:15',
    writesTo: 'league_scope_stats, league_steps_applied',
    source: 'functions/src/leagueStepsRollup.ts',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'league_steps_applied',
      orderByField: 'updatedAt',
      label: 'עדכון צעדים אחרון',
      note: 'מתעדכן רק כשנוסף משהו חדש — שעה בלי צעדים חדשים לא תופיע כאן.',
    },
  },
  {
    id: 'league-workout-stats',
    name: 'אימונים לליגות',
    description: 'כל אימון חדש נספר בליגות השכונה / העיר / הקבוצה — פעם אחת בדיוק.',
    topic: 'leagues',
    kind: 'trigger',
    schedule: 'בכל אימון חדש (workouts)',
    writesTo: 'league_scope_stats, league_scope_stats_processed',
    source: 'functions/src/leagueScopeStats.ts · onWorkoutCreateLeagueStats',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'league_scope_stats_processed',
      orderByField: 'at',
      label: 'עיבוד אחרון',
      note: 'אותו סמן משמש גם את בונוס ההזמנות — ייתכן שהעיבוד האחרון הוא הזמנה ולא אימון.',
    },
  },
  {
    id: 'league-referral-bonus',
    name: 'בונוס הזמנת חבר',
    description: '+50 לליגת העיר והשכונה של מי שהזמין, כשחבר מצטרף דרך ההזמנה שלו (עם מגבלות נגד ניצול).',
    topic: 'leagues',
    kind: 'trigger',
    schedule: 'בכל הזמנה חדשה (referrals)',
    writesTo: 'league_scope_stats, league_scope_stats_processed, users (מוני הזמנות)',
    source: 'functions/src/referralBonus.ts · onReferralCreateLeagueBonus',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'unit-league-rollup',
    name: 'ליגת יחידות (מילואים)',
    description: 'ממוצע צעדים ומרחק לכל פלוגה / גדוד / חטיבה מתוך המשתתפים הפעילים — בלי שום מזהה אישי.',
    topic: 'leagues',
    kind: 'scheduled',
    schedule: 'כל שעה עגולה',
    writesTo: 'unit_league_aggregates',
    source: 'functions/src/unitLeagueRollup.ts',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'unit_league_aggregates',
      orderByField: 'updatedAt',
      label: 'עדכון אחרון',
    },
  },
  {
    id: 'military-reserve-league',
    name: 'הצטרפות לליגת המילואים',
    description: 'מצרף / מוציא משתמש מליגת המילואים לפי ההצהרה שלו.',
    topic: 'leagues',
    kind: 'trigger',
    schedule: 'בכל שינוי ב-military_declarations',
    writesTo: 'community_groups/military_reserve_general',
    source: 'functions/src/militaryReserveLeague.ts · onMilitaryDeclarationWritten',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'leaderboard-live',
    name: 'טבלת XP — עדכון שוטף',
    description: 'כל פוסט בפיד וכל אימון מוסיפים XP לטבלת המובילים.',
    topic: 'leagues',
    kind: 'trigger',
    schedule: 'בכל פוסט / אימון חדש',
    writesTo: 'leaderboard_shards',
    source: 'functions/src/leaderboard.ts · onFeedPostCreate, onWorkoutCreate',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'leaderboard_shards',
      orderByField: 'updatedAt',
      label: 'עדכון אחרון',
    },
  },
  {
    id: 'leaderboard-rollup',
    name: 'טבלת XP — סיכום לילי',
    description: 'מסכם את טבלאות המובילים לתמונת דירוג לכל תקופה.',
    topic: 'leagues',
    kind: 'scheduled',
    schedule: 'כל יום ב-03:00',
    writesTo: 'leaderboard_snapshots',
    source: 'functions/src/leaderboard.ts · rollupLeaderboard',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'leaderboard_snapshots',
      orderByField: 'rolledUpAt',
      label: 'סיכום אחרון',
      countFields: [{ path: 'totalParticipants', label: 'משתתפים' }],
    },
  },
  {
    id: 'steps-public-sync',
    name: 'טבלת צעדים ציבורית',
    description: 'מעתיק את הצעדים של היום לטבלה הציבורית המצומצמת (שם, צעדים, רשות, קבוצת גיל) — בלי נתוני בריאות. אורחים לא נכללים.',
    topic: 'leagues',
    kind: 'scheduled',
    schedule: 'כל שעתיים',
    writesTo: 'dailyActivityPublic',
    source: 'functions/src/dailyActivityPublicSync.ts',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'dailyActivityPublic',
      orderByField: 'updatedAt',
      label: 'סנכרון אחרון',
    },
  },
  {
    id: 'group-member-count',
    name: 'ספירת חברי קבוצה',
    description: 'מעדכן את מספר החברים בקבוצה ומפעיל אותה כשמגיעה למינימום.',
    topic: 'leagues',
    kind: 'trigger',
    schedule: 'בכל שינוי בחברי קבוצה',
    writesTo: 'community_groups',
    source: 'functions/src/onGroupMemberWrite.ts · onGroupMemberWrite',
    adminHref: '/admin/community-groups-overview',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'zombie-groups',
    name: 'ניקוי קבוצות שלא הופעלו',
    description: 'מוחק קבוצות שלא הגיעו למינימום חברים.',
    topic: 'leagues',
    kind: 'scheduled',
    schedule: 'כל יום ב-03:00 UTC',
    writesTo: 'community_groups (מחיקה)',
    source: 'functions/src/onGroupMemberWrite.ts · deleteZombieGroups',
    adminHref: '/admin/community-groups-overview',
    lifecycle: 'active',
    statusSource: null,
  },

  // ── CRM ורשויות ───────────────────────────────────────────────────────────
  {
    id: 'crm-agent',
    name: 'סוכן CRM',
    description: 'סורק 3 תיבות מייל (24 שעות אחרונות), משייך לרשות, מעדכן יומן פעילות / סטטוס / מסמכים ומכין טיוטות — אף פעם לא שולח מייל.',
    topic: 'crm',
    kind: 'cron',
    schedule: 'כל יום ב-05:07 UTC (08:07 בשעון קיץ), וגם ידני מהמסך',
    writesTo: 'authorities (activityLog, pipeline), crm_runs, טיוטות Gmail, Drive',
    source: 'src/app/api/admin/crm-agent/run/route.ts · vercel.json',
    adminHref: '/admin/authorities',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'crm_runs',
      orderByField: 'savedAt',
      label: 'ריצה אחרונה שנשמרה',
      countFields: [
        { path: 'stats.threadsScanned', label: 'שרשורים' },
        { path: 'stats.threadsMatched', label: 'שויכו' },
        { path: 'stats.authoritiesUpdated', label: 'רשויות עודכנו' },
      ],
      note: 'נשמר רק בריצה אמיתית שהסתיימה (לא בריצת ניסיון ולא בכשל).',
    },
  },
  {
    id: 'authority-write',
    name: 'סנכרון רשות צבאית',
    description: 'לרשויות צבאיות: מחלץ סוג חיל וסטטוס מהשם ומעדכן את אינדקס היחידות הציבורי.',
    topic: 'crm',
    kind: 'trigger',
    schedule: 'בכל שינוי ב-authorities',
    writesTo: 'authorities, unitDirectory',
    source: 'functions/src/onAuthorityWrite.ts',
    adminHref: '/admin/authorities',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'unit-write',
    name: 'ספירת יחידות ואינדקס יחידות',
    description: 'סופר יחידות לכל ארגון / רשות ומעדכן את אינדקס היחידות הציבורי.',
    topic: 'crm',
    kind: 'trigger',
    schedule: 'בכל יצירה / מחיקה של יחידה',
    writesTo: 'tenants, authorities, unitDirectory',
    source: 'functions/src/onUnitWrite.ts',
    adminHref: '/admin/organizations',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'access-code',
    name: 'אימות קוד גישה',
    description: 'בודק קוד גישה של משתמש ומצרף אותו לרשות / ארגון (עם הגבלת ניסיונות ובדיקת גיל).',
    topic: 'crm',
    kind: 'on-demand',
    schedule: 'כשמשתמש מזין קוד באפליקציה',
    writesTo: 'users, access_codes',
    source: 'functions/src/validateAccessCode.ts',
    adminHref: '/admin/access-codes',
    lifecycle: 'active',
    statusSource: null,
  },

  // ── תפעול ויציבות ─────────────────────────────────────────────────────────
  {
    id: 'oncall',
    name: 'On-call — קריסות',
    description: 'סורק את Sentry כל שעה: issues חדשים / מזנקים / חוזרים, מוצלבים מול הדיפלוי וה-PR האחרונים. report-only.',
    topic: 'ops',
    kind: 'scheduled',
    schedule: 'כל שעה (מתוכנן)',
    writesTo: 'agents/oncall, agents/oncall/findings',
    source: 'אין מימוש עדיין',
    lifecycle: 'planned',
    statusSource: { kind: 'agentDoc' },
    hasFindings: true,
  },
  {
    id: 'cleanup-ephemeral',
    name: 'ניקוי נתונים זמניים',
    description: 'מוחק נוכחות, אימונים פעילים, מפגשים שפג תוקפם ועוד — לפי מדיניות שמירת הנתונים.',
    topic: 'ops',
    kind: 'scheduled',
    schedule: 'כל שעה, ב-:07 (UTC)',
    writesTo: 'presence, active_workouts, planned_sessions ועוד (מחיקה)',
    source: 'functions/src/cleanupEphemeralDocs.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'cleanup-old-logs',
    name: 'ניקוי לוגים ישנים',
    description: 'יומן ביקורת נשמר 24 חודשים, הודעות Push נשמרות 90 יום — מה שישן יותר נמחק.',
    topic: 'ops',
    kind: 'scheduled',
    schedule: 'ב-1 לכל חודש, 03:00 UTC',
    writesTo: 'audit_logs, push_messages (מחיקה)',
    source: 'functions/src/cleanupOldLogs.ts',
    adminHref: '/admin/audit-logs',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'legal-hold',
    name: 'ארכיון משפטי — מחיקה אחרי 7 שנים',
    description: 'מוחק ארכיונים משפטיים של משתמשים שנמחקו, אחרי שתמה תקופת ההתיישנות.',
    topic: 'ops',
    kind: 'scheduled',
    schedule: 'ב-2 לכל חודש, 03:00 UTC',
    writesTo: 'legal_hold (מחיקה), audit_logs',
    source: 'functions/src/legalHold.ts · purgeExpiredLegalHolds',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'user-delete',
    name: 'מחיקת חשבון',
    description: 'בקשת מחיקה מהאפליקציה + ניקוי כל נתוני המשתמש אחרי המחיקה (עם ארכיון משפטי).',
    topic: 'ops',
    kind: 'trigger',
    schedule: 'בבקשת מחיקה / במחיקת משתמש ב-Auth',
    writesTo: 'users, workouts, dailyActivity, feed_posts, chats, legal_hold ועוד',
    source: 'functions/src/onUserDelete.ts · requestAccountDeletion, onUserDelete',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'user-public-sync',
    name: 'פרופיל ציבורי',
    description: 'מעתיק את השדות הציבוריים בלבד של המשתמש (שם, תמונה וכו׳) לאוסף החיפוש — רק כשהם משתנים.',
    topic: 'ops',
    kind: 'trigger',
    schedule: 'בכל שינוי ב-users',
    writesTo: 'userPublic',
    source: 'functions/src/userPublicSync.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'upload-content-type',
    name: 'בדיקת סוג קובץ שהועלה',
    description: 'בודק את התוכן האמיתי של קבצים שמשתמשים מעלים ומוחק קבצים שמתחזים לתמונה / PDF.',
    topic: 'ops',
    kind: 'trigger',
    schedule: 'בכל העלאת קובץ (Storage)',
    writesTo: 'Storage (מחיקה)',
    source: 'functions/src/verifyUploadContentType.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'audit-logger',
    name: 'רישום ליומן ביקורת',
    description: 'רושם פעולות מנהלים ביומן הביקורת מצד השרת.',
    topic: 'ops',
    kind: 'on-demand',
    schedule: 'בכל פעולת מנהל מתועדת',
    writesTo: 'audit_logs',
    source: 'functions/src/auditLogger.ts · logAuditAction',
    adminHref: '/admin/audit-logs',
    lifecycle: 'active',
    statusSource: null,
  },

  // ── תוכן ואימונים ─────────────────────────────────────────────────────────
  {
    id: 'award-workout-xp',
    name: 'XP ומטבעות על אימון',
    description: 'הכותב היחיד של XP / מטבעות / רמה על אימון פעיל (הלקוח לא יכול לכתוב אותם בעצמו).',
    topic: 'content',
    kind: 'on-demand',
    schedule: 'בסיום כל אימון באפליקציה',
    writesTo: 'users (progression)',
    source: 'functions/src/awardWorkoutXP.ts',
    adminHref: '/admin/levels',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'reverse-workout-xp',
    name: 'ביטול XP על אימון שנמחק',
    description: 'מחזיר את ה-XP של אימון שנמחק כדי שהרמה תישאר מדויקת.',
    topic: 'content',
    kind: 'on-demand',
    schedule: 'במחיקת אימון',
    writesTo: 'users (progression), workouts',
    source: 'functions/src/reverseWorkoutXP.ts',
    adminHref: '/admin/levels',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'ingest-health',
    name: 'קליטת נתוני בריאות',
    description: 'קולט צעדים ודקות פעילות מ-HealthKit / Health Connect אל הפעילות היומית ו-XP כללי בלבד.',
    topic: 'content',
    kind: 'on-demand',
    schedule: 'בסנכרון מהאפליקציה (כמה פעמים ביום)',
    writesTo: 'dailyActivity, healthSamples, users (globalXP)',
    source: 'functions/src/ingestHealthSamples.ts',
    lifecycle: 'active',
    statusSource: null,
  },

  // ── התראות ────────────────────────────────────────────────────────────────
  {
    id: 'push-queue',
    name: 'שליחת Push מהתור',
    description: 'שולח כל הודעת Push שנכנסת לתור (כולל חסימת שבת וחג) ומסמן נשלח / נכשל.',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל הודעה חדשה ב-push_messages',
    writesTo: 'push_messages, FCM',
    source: 'functions/src/sendPushFromQueue.ts',
    adminHref: '/admin/notifications',
    lifecycle: 'active',
    statusSource: {
      kind: 'latestDoc',
      collection: 'push_messages',
      orderByField: 'processedAt',
      label: 'הודעה אחרונה שטופלה',
      statusField: 'status',
    },
  },
  {
    id: 'onboarding-dropoff',
    name: 'החזרת נוטשי אונבורדינג',
    description: 'מזהה משתמשים שהתחילו הרשמה ונעלמו ושולח להם Push מותאם.',
    topic: 'notifications',
    kind: 'scheduled',
    schedule: 'פעמיים בשעה (:17 ו-:47)',
    writesTo: 'users, push_messages',
    source: 'functions/src/onboardingDropoffDispatcher.ts',
    adminHref: '/admin/notifications',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'retention',
    name: 'החזרת משתמשים לא פעילים',
    description: 'Push למשתמשים שסיימו הרשמה אבל הפסיקו להתאמן.',
    topic: 'notifications',
    kind: 'scheduled',
    schedule: 'כל יום ב-10:00',
    writesTo: 'users, FCM',
    source: 'functions/src/retentionScheduler.ts',
    adminHref: '/admin/notifications',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'training-reminder',
    name: 'תזכורת אימון מתוכנן',
    description: 'תזכורת למי שיש לו אימון מתוכנן היום ועוד לא ביצע.',
    topic: 'notifications',
    kind: 'scheduled',
    schedule: 'כל שעה עגולה',
    writesTo: 'push_rate, FCM',
    source: 'functions/src/trainingReminderScheduler.ts',
    adminHref: '/admin/notifications',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'reminder-sweep',
    name: 'תזכורות אימון לפי שעה שנבחרה',
    description: 'Push לפני שעת האימון שהמשתמש קבע בהגדרות / בלוח האימונים.',
    topic: 'notifications',
    kind: 'scheduled',
    schedule: 'כל 5 דקות',
    writesTo: 'reminder_fired, FCM',
    source: 'functions/src/reminderSweepScheduler.ts',
    adminHref: '/admin/notifications',
    gate: 'app_config/feature_flags.enableReminderSweepPush',
    lifecycle: 'not-deployed',
    statusSource: null,
  },
  {
    id: 'step-goal-nudge',
    name: 'תזכורת יעד צעדים',
    description: 'דחיפה בערב למי שעוד לא הגיע ליעד הצעדים היומי, מתוך ספריית התוכן של מנהל ההתראות.',
    topic: 'notifications',
    kind: 'scheduled',
    schedule: 'כל יום ב-18:00',
    writesTo: 'FCM',
    source: 'functions/src/stepGoalNudgeScheduler.ts',
    adminHref: '/admin/notifications',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'push-outcome-sweeper',
    name: 'מדידת תוצאת Push',
    description: 'בודק אם אחרי פתיחת Push המשתמש באמת עשה את הפעולה (אימון / יעד צעדים) ורושם תוצאה.',
    topic: 'notifications',
    kind: 'scheduled',
    schedule: 'כל 30 דקות',
    writesTo: 'push_events',
    source: 'functions/src/pushOutcomeSweeper.ts',
    adminHref: '/admin/notifications',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'push-opened',
    name: 'פתיחת Push — תחילת מדידה',
    description: 'כשמשתמש פותח Push, מתחיל את חלון המדידה של התוצאה (מהפתיחה, לא מהשליחה).',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל אירוע ב-push_events',
    writesTo: 'push_events',
    source: 'functions/src/onPushOpened.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'chat-push',
    name: 'Push על הודעת צ׳אט',
    description: 'Push לכל משתתפי השיחה חוץ מהשולח.',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל הודעת צ׳אט חדשה',
    writesTo: 'FCM',
    source: 'functions/src/chatMessageNotification.ts',
    gate: 'app_config/feature_flags.chatNotificationsEnabled',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'level-up-push',
    name: 'Push על עליית רמה',
    description: 'Push אישי כשמשתמש עולה רמה (עם שעות שקט ומגבלת תדירות).',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל עדכון ב-users (רק כשהרמה עלתה)',
    writesTo: 'FCM',
    source: 'functions/src/onLevelUp.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'contribution-approved-push',
    name: 'Push על מיקום שאושר',
    description: 'מודיע לתושב שהמיקום שהציע אושר ועלה למפה.',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'כשתרומה עוברת ל"אושר"',
    writesTo: 'FCM',
    source: 'functions/src/onContributionApproved.ts',
    adminHref: '/admin/approval-center',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'group-join-push',
    name: 'Push על הצטרפות לקבוצה',
    description: 'ברוך הבא למצטרף + עדכון למנהל הקבוצה.',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל חבר חדש בקבוצה',
    writesTo: 'FCM',
    source: 'functions/src/onGroupMemberJoin.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'kudos-push',
    name: 'Push על כיף (high-five)',
    description: 'Push מקובץ על כיפים שהתקבלו — לא אחד לכל כיף.',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל כיף חדש',
    writesTo: 'FCM',
    source: 'functions/src/onKudosCreated.ts',
    lifecycle: 'active',
    statusSource: null,
  },
  {
    id: 'planned-activity-push',
    name: 'Push על פעילות קרובה',
    description: 'כשמישהו מתכנן פעילות — Push לשותפים ולמי שגר קרוב (פעם אחת לכל אחד).',
    topic: 'notifications',
    kind: 'trigger',
    schedule: 'בכל פעילות מתוכננת חדשה',
    writesTo: 'FCM',
    source: 'functions/src/onPlannedActivityCreated.ts',
    gate: 'app_config/feature_flags.socialActivityNearbyPushEnabled',
    lifecycle: 'not-deployed',
    statusSource: null,
  },
  {
    id: 'preview-notification',
    name: 'תצוגה מקדימה להתראה',
    description: 'מראה איזה תוכן התראה היה נבחר למשתמש — בלי לשלוח כלום.',
    topic: 'notifications',
    kind: 'on-demand',
    schedule: 'מהסימולטור',
    writesTo: 'לא כותב',
    source: 'functions/src/previewNotificationContent.ts',
    adminHref: '/admin/simulator',
    lifecycle: 'not-deployed',
    statusSource: null,
  },
];

export interface AgentDefinition {
  /** Firestore doc id under agents/ — must match AGENT_ID_PATTERN. */
  id: string;
  label: string;
  description: string;
}

/** Agents that write findings to agents/{id} — the findings routes' allowlist. */
export const AGENT_REGISTRY: readonly AgentDefinition[] = AUTOMATION_REGISTRY
  .filter((a) => a.hasFindings)
  .map((a) => ({ id: a.id, label: a.name, description: a.description }));

export function isRegisteredAgent(agentId: string): boolean {
  return AGENT_REGISTRY.some((a) => a.id === agentId);
}

/** Registry entries grouped in AUTOMATION_TOPICS order (empty topics dropped). */
export function groupAutomationsByTopic(
  list: readonly AutomationDefinition[] = AUTOMATION_REGISTRY,
): { topic: AutomationTopic; label: string; automations: AutomationDefinition[] }[] {
  return AUTOMATION_TOPICS
    .map((t) => ({ topic: t.id, label: t.label, automations: list.filter((a) => a.topic === t.id) }))
    .filter((g) => g.automations.length > 0);
}
