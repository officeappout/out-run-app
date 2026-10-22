/**
 * Adaptive progression — every threshold in one place (owner approved 22.10.2026,
 * agent-briefs/generator-rules-map.md §3a / §3d / §3e).
 *
 * Three independent flags (all default OFF, super admins preview):
 *   3d enable_skill_cap_true_skills — the ≤5-rep / ≤12 s ceiling only for TRUE skills
 *   3a enable_adaptive_reps_v1      — per-exercise double progression
 *   3e enable_goal_presence_v1      — goal presence boost, performance ramp, celebration
 *
 * Pure constants — no imports, safe everywhere (engine, runner, tests).
 */

// ── 3d: true-skill ceiling ────────────────────────────────────────────────

/** Max reps for a TRUE skill move (one-arm pull-up, levers, planche, HSPU, muscle-up, flag, pistol). */
export const SKILL_REP_CEILING = 5;
/** Max hold (s) for a TRUE skill hold (was 15 s; 12 keeps the 10 s mastery mark reachable). */
export const SKILL_HOLD_CEILING_S = 12;
/** Regular exercise one level above the user (hard tier): its own range instead of 1–3. */
export const NON_SKILL_HARD_REPS = { min: 3, max: 6 } as const;
/** Regular exercise two+ levels above the user (elite tier). */
export const NON_SKILL_ELITE_REPS = { min: 2, max: 5 } as const;
/** Upper bound for a regular exercise at hard/elite tier (history / goal ramp never go past it). */
export const NON_SKILL_HARD_REP_CEILING = 8;

// ── 3a: double progression ────────────────────────────────────────────────

/** +reps after a successful session (every working set hit the target). */
export const DP_REP_STEP = 1;
/** +seconds after a successful session for a hold. */
export const DP_HOLD_STEP_S = 5;
/** Successful sessions in a row AT the top of the range before +1 set. */
export const DP_TOP_SESSIONS_FOR_SET = 2;
/** Most extra sets the progression may add on top of the generator's count. */
export const DP_MAX_EXTRA_SETS = 1;
/** Successful sessions in a row at the top before the harder variation is preferred. */
export const DP_TOP_SESSIONS_FOR_VARIATION = 3;
/** Missed sessions in a row before the target steps back. */
export const DP_MISS_SESSIONS_FOR_STEPBACK = 2;
/** How far a step back goes (reps; holds use DP_STEPBACK_HOLD_S). */
export const DP_STEPBACK_REPS = 2;
export const DP_STEPBACK_HOLD_S = 5;
/** A miss = this many sets (or more) below the range minimum, or the average below it. */
export const DP_MISS_SETS_BELOW_MIN = 2;
/** Progression state older than this is ignored (re-learned from the history floor). */
export const DP_STATE_STALE_DAYS = 21;
/** Selection score bonus for the next / previous variation the progression asks for. */
export const DP_VARIATION_SCORE_BONUS = 25;

// ── 3e: goal exercises ────────────────────────────────────────────────────

/** Selection score bonus for a goal exercise missing from the recent sessions of its area. */
export const GOAL_SCORE_BOOST = 15;
/** "Recent" = the last N sessions that trained the goal's area. */
export const GOAL_PRESENCE_EVERY_N = 2;
/** Goal ramp step after a session that reached the target. */
export const GOAL_STEP_REPS = 1;
export const GOAL_STEP_HOLD_S = 5;
/** In-workout goal celebration: total on-screen time (ms), calm. */
export const GOAL_CELEBRATION_MS = 1200;
