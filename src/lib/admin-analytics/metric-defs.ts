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
  { id: 'signup_failures', nameHe: 'כשלי הרשמה', def: 'signup_failures docs with timestamp in the window, counted by stage / reason', window: 'last 7 days', source: 'signup_failures' },
  // ── product (journey / statistics) ──
  { id: 'wae', nameHe: 'מתאמנים פעילים בשבוע (WAE)', def: 'distinct users with ≥1 workout in the last 7 days (real accounts only)', window: '7 days', source: 'computeGrowthMetrics northStar' },
  { id: 'workouts_per_active', nameHe: 'אימונים למתאמן פעיל', def: 'workouts in the last 7 days ÷ WAE', denominator: 'WAE', window: '7 days', source: 'computeGrowthMetrics northStar' },
  { id: 'stickiness', nameHe: 'דביקות DAU/MAU', def: 'DAU ÷ MAU × 100, MAU = distinct users with a workout in 30 days', denominator: 'MAU', window: '1 / 30 days', source: 'computeGrowthMetrics northStar' },
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
