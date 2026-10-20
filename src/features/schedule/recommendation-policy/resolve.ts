/**
 * Recommendation policy resolver (enable_home_v2, owner 20.10.2026). Pure.
 *
 * signals (level, running ability, goals, audience, tracks, available days)
 *   + policy (policy.config.ts today, a Firestore doc later — same shape)
 *   → how many strength / run sessions a week, the split (the policy's own
 *     level × sessions table, policy.strength.splits), optional add-ons and
 *     Hebrew reasons.
 *
 * Order: base by band → rules in order → hard-skill minimum → bounds →
 * available days → split → free-day add-ons.
 */
import { getLevelTier } from '@/features/workout-engine/services/split-decision/split-decision.types';
import { RECOMMENDATION_POLICY } from './policy.config';
import type {
  PolicyAddOn,
  PolicyRecommendation,
  PolicySignals,
  PolicyWhen,
  RecommendationPolicy,
  RunBand,
  StrengthBand,
} from './types';

interface Ctx {
  signals: PolicySignals;
  band: StrengthBand;
  runBand: RunBand;
  available: number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

/** Does a rule's condition match? (omitted fields match anything) */
export function matchesWhen(when: PolicyWhen, ctx: Ctx): boolean {
  const s = ctx.signals;
  if (when.tracks && !when.tracks.includes(s.tracks)) return false;
  if (when.strengthBands && !when.strengthBands.includes(ctx.band)) return false;
  if (when.runBands && (s.runBand == null || !when.runBands.includes(ctx.runBand))) return false;
  if (when.goalsAny && !when.goalsAny.some((g) => s.goals.includes(g))) return false;
  if (when.goalsNone && when.goalsNone.some((g) => s.goals.includes(g))) return false;
  if (when.audiences && !when.audiences.includes(s.audience)) return false;
  if (when.minHardSkills != null && s.hardSkillCount < when.minHardSkills) return false;
  if (when.maxHardSkills != null && s.hardSkillCount > when.maxHardSkills) return false;
  if (when.minAvailableDays != null && ctx.available < when.minAvailableDays) return false;
  if (when.maxAvailableDays != null && ctx.available > when.maxAvailableDays) return false;
  if (when.minChosenDays != null && (s.availableDays == null || s.availableDays < when.minChosenDays)) return false;
  if (when.targetDistances && (!s.targetDistance || !when.targetDistances.includes(s.targetDistance))) return false;
  return true;
}

/** "{n}" → the number, "{split}" → the split's Hebrew name. */
function fill(template: string, vars: { n?: number | null; split?: string; runs?: number | null; k?: number | null }): string {
  return template
    .replace(/\{n\}/g, vars.n != null ? String(vars.n) : '')
    .replace(/\{k\}/g, vars.k != null ? String(vars.k) : '')
    .replace(/\{runs\}/g, vars.runs != null ? String(vars.runs) : '')
    .replace(/\{split\}/g, vars.split ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveRecommendation(
  signals: PolicySignals,
  policy: RecommendationPolicy = RECOMMENDATION_POLICY,
): PolicyRecommendation {
  const hasStrength = signals.tracks !== 'running';
  const hasRun = signals.tracks !== 'strength';
  const band = getLevelTier(typeof signals.strengthLevel === 'number' && signals.strengthLevel > 0 ? signals.strengthLevel : 1);
  const runBand: RunBand = signals.runBand ?? 'beginner';
  const available = clamp(signals.availableDays ?? policy.defaultAvailableDays, 1, 7);
  const ctx: Ctx = { signals, band, runBand, available };

  let sf: number | null = hasStrength ? policy.strength.base[band].frequency : null;
  let rf: number | null = hasRun ? policy.running.base[runBand].frequency : null;
  let sMin = policy.strength.bounds.min;
  let sMax = policy.strength.bounds.max;
  let rMin = policy.running.bounds.min;
  let rMax = policy.running.bounds.max;

  // Reasons: the base lines are rendered last (they carry the final numbers).
  const ruleReasons: string[] = [];
  const fired: string[] = [];
  const addOns = new Map<string, PolicyAddOn>();

  for (const rule of policy.rules) {
    if (!matchesWhen(rule.when, ctx)) continue;
    const t = rule.then;
    let touched = false;
    if (sf != null) {
      if (t.strengthFrequency != null) { sf = t.strengthFrequency; touched = true; }
      if (t.strengthDelta != null) { sf += t.strengthDelta; touched = true; }
      if (t.strengthMax != null) { sMax = Math.min(sMax, t.strengthMax); touched = true; }
      if (t.strengthMin != null) { sMin = Math.max(sMin, t.strengthMin); touched = true; }
    }
    if (rf != null) {
      if (t.runFrequency != null) { rf = t.runFrequency; touched = true; }
      if (t.runDelta != null) { rf += t.runDelta; touched = true; }
      if (t.runMax != null) { rMax = Math.min(rMax, t.runMax); touched = true; }
      if (t.runMin != null) { rMin = Math.max(rMin, t.runMin); touched = true; }
    }
    if (t.addOns?.length) {
      for (const a of t.addOns) addOns.set(a.kind, a);
      touched = true;
    }
    // A rule that only explains (reasonHe) still fires; one with nothing to say and
    // nothing it could change for these tracks does not.
    if (!touched && !t.reasonHe) continue;
    fired.push(rule.id);
    if (t.reasonHe) ruleReasons.push(t.reasonHe);
  }

  // Hard skills need their own days (the existing ERR_DAYS_MIN table).
  if (sf != null && signals.hardSkillCount > 0) {
    const key = String(Math.min(signals.hardSkillCount, 4));
    const min = policy.strength.skillMinDays[key] ?? 0;
    if (min > sf) {
      sf = min;
      fired.push('skill_min_days');
      ruleReasons.push(fill(policy.strength.skillMinReasonHe, { n: min }));
    }
  }

  if (sf != null) sf = clamp(sf, Math.min(sMin, sMax), sMax);
  if (rf != null) rf = clamp(rf, Math.min(rMin, rMax), rMax);

  // Available days: each track fits its days; both tracks share them (strength gives
  // way first, never below its floor; a remaining overflow becomes doubles).
  let cut = false;
  if (sf != null && sf > available) { sf = available; cut = true; }
  if (rf != null && rf > available) { rf = Math.max(policy.running.bounds.min, available); cut = true; }
  if (sf != null && rf != null) {
    const sFloor = Math.min(sMin, sf);
    while (sf + rf > available && sf > Math.max(sFloor, 1)) { sf--; cut = true; }
    while (sf + rf > available && rf > policy.running.bounds.min) { rf--; cut = true; }
  }
  if (cut) {
    fired.push('available_days');
    ruleReasons.push(fill(policy.availableDaysReasonHe, { n: available }));
  }

  const split = sf != null ? policy.strength.splits[band]?.[String(clamp(sf, 1, 6))] ?? null : null;

  // Add-ons that fill the free days (e.g. a beginner's light movement days):
  // count = available − the week's sessions; none left → dropped.
  for (const [kind, a] of Array.from(addOns.entries())) {
    if (!a.fillsFreeDays) continue;
    const k = available - (sf ?? 0) - (rf ?? 0);
    if (k <= 0) addOns.delete(kind);
    else addOns.set(kind, { ...a, perWeek: k, labelHe: fill(a.labelHe, { k }) });
  }
  const splitHe = !split ? '' : signals.hardSkillCount > 0 ? policy.skillSplitNameHe : policy.splitNamesHe[split];

  const reasonsHe: string[] = [];
  if (sf != null) reasonsHe.push(fill(policy.strength.base[band].reasonHe, { n: sf, split: splitHe }));
  if (rf != null) reasonsHe.push(fill(policy.running.base[runBand].reasonHe, { runs: rf }));
  for (const r of ruleReasons) if (!reasonsHe.includes(r)) reasonsHe.push(r);

  return {
    strength: sf != null && split ? { frequency: sf, split, splitHe, band } : null,
    running: rf != null ? { frequency: rf, band: runBand } : null,
    addOns: Array.from(addOns.values()),
    reasonsHe,
    firedRuleIds: fired,
  };
}
