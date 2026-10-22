/**
 * metric-defs — the ONE dictionary of what every number the admin assistant reports means
 * (plan §5.1). Every tool result's meta.definitionId points here; the dictionary itself goes in
 * the model's cached prompt prefix so it can cite the id. Pure data, Hebrew names.
 *
 * Adding a metric: add an entry here first, then the tool that returns it.
 */
export interface MetricDef {
  id: string;
  nameHe: string;
  /** formula / exact definition */
  def: string;
  /** denominator, when the metric is a rate */
  denominator?: string;
  window?: string;
  minSample?: number;
  source: string;
}

export const METRIC_DEFS: MetricDef[] = [
  // ── operations (wave 3) ──
  { id: 'pending_approvals', nameHe: 'ממתינים לאישור', def: 'parks published=false (not draft/rejected) + official_routes published=false (not archived/rejected) + climb_segments/user_contributions/pending_units/osm_amenities status=pending', window: 'now (snapshot)', source: 'approval-center/page.tsx loadPending*' },
  { id: 'attention_queue', nameHe: 'דורש תשומת לב', def: 'pending parks; open maintenance reports older than 7 days; transactions approval=pending; signup failures last 7 days (root only)', window: 'now / 7 days', source: 'api/admin/home-today' },
  { id: 'crm_pipeline', nameHe: 'צנרת CRM', def: 'authorities by pipelineStatus (missing = lead); draft = database only, not pipeline; urgent = follow_up + closing', window: 'now (snapshot)', source: 'authorities.pipelineStatus' },
  { id: 'ai_cost', nameHe: 'עלות AI (הערכה)', def: 'sum of estimated costUsd in ai_usage_global per Israel day (ai-pricing.ts estimates; the Console bill is the truth)', window: 'today / 7 days / month to date', source: 'ai_usage_global, admin_ai_stats' },
  { id: 'city_mapping_readiness', nameHe: 'מוכנות מיפוי ערים', def: 'stored city_inventory.readiness level (red/yellow/green) and score per city with an inventory', window: 'now (snapshot)', source: 'city_inventory (computeReadiness)' },
  { id: 'authority_overview', nameHe: 'סקירת רשות', def: 'one authority: stored CRM pipelineStatus (missing = lead), isActiveClient, population; city_inventory layers + readiness; count() of official_routes / parks by authorityId (pending = unpublished minus archived/rejected, parks minus draft/rejected; connectors = displayRole connector); users with core.authorityId = id (<5 masked)', window: 'now (snapshot)', source: 'authorities, city_inventory, official_routes, parks, users' },
  { id: 'signup_failures', nameHe: 'כשלי הרשמה', def: 'signup_failures docs with timestamp in the window, counted by stage / reason', window: 'last 7 days', source: 'signup_failures' },
  // ── product (journey / statistics) ──
  { id: 'wae', nameHe: 'מתאמנים פעילים בשבוע (WAE)', def: 'distinct users with ≥1 workout in the last 7 days (real accounts only)', window: '7 days', source: 'computeGrowthMetrics northStar' },
  { id: 'workouts_per_active', nameHe: 'אימונים למתאמן פעיל', def: 'workouts in the last 7 days ÷ WAE', denominator: 'WAE', window: '7 days', source: 'computeGrowthMetrics northStar' },
  { id: 'stickiness', nameHe: 'דביקות DAU/MAU', def: 'DAU ÷ MAU × 100, MAU = distinct users with a workout in 30 days', denominator: 'MAU', window: '1 / 30 days', source: 'computeGrowthMetrics northStar' },
  // ── product advisor, batch 1 (wave 4) — locked KPI definitions: docs/product/kpi-definitions.md ──
  { id: 'real_workout', nameHe: 'אימון אמיתי', def: 'isRealWorkoutCompletion: recovery never counts; strength only with setsCompleted ≥ 1; run/walk/hybrid = the doc exists. Known gap: a warm-up-only strength session still counts', source: 'workout-completion-kpi.ts' },
  { id: 'real_user', nameHe: 'משתמש אמיתי', def: 'not a test / demo account', source: 'testAccountFilter.ts' },
  { id: 'activated', nameHe: 'הופעל', def: '≥1 real_workout, any time', source: 'kpi-definitions.md' },
  { id: 'activated_7d', nameHe: 'הופעל תוך 7 ימים', def: '≥1 real_workout within 7 days of signup', denominator: 'real users who signed up in the range, ≥7 days ago', window: '7 days from signup', source: 'journey-sources' },
  { id: 'retained_lifetime', nameHe: 'נשאר (מצטבר)', def: '≥3 real_workouts', source: 'kpi-definitions.md' },
  { id: 'cohort_dN', nameHe: 'שימור קוהורטה ביום N', def: 'weekly signup cohort: % active on day N (0/1/3/7/14/30) ±1 day; day N unknown until the cohort is N+1 days old', denominator: 'cohort size', window: '12 weekly cohorts', minSample: 50, source: 'retention-depth' },
  { id: 'resurrected', nameHe: 'חזרו לפעילות', def: 'active in the last 30 days after 30 full days with nothing', window: '30 + 30 days', minSample: 50, source: 'retention-depth' },
  { id: 'retained_14_28', nameHe: 'נשאר ימים 14-28', def: '≥1 real_workout between day 14 and day 28 after signup; drivers = first-week behaviours compared (correlation, not cause)', denominator: 'users who signed up 28-148 days ago', minSample: 30, source: 'journey-retention-drivers' },
  { id: 'onboarding_stall', nameHe: 'תקיעה באונבורדינג', def: 'SNAPSHOT: signups in the range still mid-onboarding, by current users.onboardingStep (not a step-to-step funnel)', window: 'signup range (default 30 days)', source: 'journey-activation' },
  { id: 'first_workout_road', nameHe: 'הדרך לאימון הראשון', def: 'of the signups: how many reached recommendation_shown → workout_detail_viewed → workout_start_pressed → workout_session_started → workout_complete within 7 days', source: 'journey-activation' },
  { id: 'push_delivered_opened_acted', nameHe: 'ביצועי פוש', def: 'cascading: delivered/sent, opened/delivered, acted/opened; acted = post_push_outcome.goalCompleted in the open-anchored window; unmeasured push types = not measured', window: 'optional date range', source: 'push-performance-summary' },
  { id: 'push_started_workout', nameHe: 'פוש → אימון', def: 'sent → delivered → opened → started a workout from the push', window: 'all time', source: 'push-funnel-summary' },
];

const BY_ID = new Map(METRIC_DEFS.map((d) => [d.id, d]));

export function metricDef(id: string): MetricDef | null {
  return BY_ID.get(id) ?? null;
}

/** Compact text of the dictionary for the cached prompt prefix (stable order). */
export function metricDictionaryText(): string {
  return METRIC_DEFS.map((d) => {
    const parts = [`${d.id} — ${d.nameHe}: ${d.def}`];
    if (d.denominator) parts.push(`denominator: ${d.denominator}`);
    if (d.window) parts.push(`window: ${d.window}`);
    if (d.minSample) parts.push(`minSample: ${d.minSample}`);
    return parts.join('; ');
  }).join('\n');
}
