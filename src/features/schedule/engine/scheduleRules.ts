/**
 * Smart Schedule v1.3 — Rule Engine
 *
 * Pure functions, zero React imports. Decoupled from the view layer.
 * Source of truth: src/features/schedule/out-run-schedule-logic-v1.3.md
 *
 * Implements:
 *   - validateInitial         (ERR_01, ERR_02, ERR_03 + minimum-days table §2.3)
 *   - buildDefaultTemplate    (uses PREFERRED_DAYS, FIX-01 PULL+PULL guard,
 *                              HANDSTAND morning-slot stacking)
 *   - validateSchedule        (WARN_01–WARN_15 cross-day + WARN_MS_01–WARN_MS_04)
 *   - validateMultiSession    (same-day combinations)
 *   - getUpperBodyDominance   (PUSH_DOM / PULL_DOM / BALANCED)
 *   - buildUpperCalisthenicsSession (§5.5 ordering)
 *
 * RULES:
 *   - HANDSTAND is a Free Slot — never adds a multi-session warning.
 *   - sessions[] is ALWAYS an array.
 *   - Auto-fill never creates Multi-Session days (except HANDSTAND morning slot).
 */

import {
  type DayOfWeek,
  type MovementType,
  type PrioritizedSkill,
  type ProgramId,
  type ScheduleDay,
  type ScheduleItemId,
  type SessionItem,
  type SessionType,
  type SkillId,
  type UBDominance,
  type Warning,
  ALL_SKILL_IDS,
  countActiveSkills,
  DYNAMIC_SKILLS,
  MAX_ACTIVE_SKILLS,
  MIN_REST_HOURS,
  MOVEMENT_OF,
  NEURAL_SKILLS,
  PULL_SKILLS,
  PUSH_SKILLS,
  SCHEDULE_POLICY,
  SESSION_ORDER_IN_DAY,
} from '../types/smartSchedule.types';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const SAT: DayOfWeek = 6;

function emptyDay(dow: DayOfWeek): ScheduleDay {
  return { dayOfWeek: dow, sessions: [], isRestDay: true, warnings: [] };
}

function makeWeek(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => emptyDay(i as DayOfWeek));
}

function isPushItem(id: ScheduleItemId): boolean {
  return (PUSH_SKILLS as string[]).includes(id);
}

function isPullItem(id: ScheduleItemId): boolean {
  return (PULL_SKILLS as string[]).includes(id);
}

function isDynamicItem(id: ScheduleItemId): boolean {
  return (DYNAMIC_SKILLS as string[]).includes(id);
}

function isNeuralItem(id: ScheduleItemId): boolean {
  return (NEURAL_SKILLS as string[]).includes(id);
}

function isProgramItem(id: ScheduleItemId): boolean {
  return id === 'FULL_BODY' || id === 'UPPER_BODY' || id === 'UPPER_CALISTHENICS';
}

function dayHasMovement(day: ScheduleDay, predicate: (id: ScheduleItemId) => boolean): boolean {
  return day.sessions.some((s) => predicate(s.skillId));
}

function dayIsRest(day: ScheduleDay): boolean {
  return day.sessions.length === 0 || day.isRestDay;
}

function pushWarning(
  bag: Warning[],
  code: string,
  level: 'ERROR' | 'WARN',
  message: string,
  affectedDays: number[],
): void {
  bag.push({ code, level, message, affectedDays });
}

function sortSessionsInPlace(day: ScheduleDay): void {
  day.sessions.sort((a, b) => {
    const ai = SESSION_ORDER_IN_DAY.indexOf(a.skillId);
    const bi = SESSION_ORDER_IN_DAY.indexOf(b.skillId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  day.sessions.forEach((s, i) => {
    s.orderInDay = i;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. validateInitial — pre-template gating
// ──────────────────────────────────────────────────────────────────────────

const MIN_DAYS_FOR_HARD_SKILLS: Record<number, number> = {
  1: 2, // 1 hard skill → 2 days minimum
  2: 3,
  3: 4,
  4: 5,
};

/**
 * Up-front sanity checks before building a template:
 *   - ERR_03: countActiveSkills > 4
 *   - Days vs hard-skill count (§2.3 table)
 *
 * ERR_01 / ERR_02 are evaluated against `SessionItem[]` *inside a single session*.
 * We expose a separate helper for that path because at the wizard's "initial"
 * stage there are no built sessions yet.
 */
// David, 01.09.2026: both rules below were 'ERROR' (blocking) until this
// date — reconnected as 'WARN' (visible, non-blocking), the same ruling
// already applied to the day-count/frequency mismatch case. Codes kept as
// ERR_03/ERR_DAYS_MIN for continuity even though they're WARN-level now —
// renaming them wasn't asked for and the code string isn't user-facing.
export function validateInitial(
  skills: SkillId[],
  daysPerWeek: number,
): Warning[] {
  const warnings: Warning[] = [];
  const hardCount = countActiveSkills(skills);

  // ERR_03's real home is src/app/onboarding-new/program-path/page.tsx —
  // that's the only screen where hardCount is actually chosen (toggleSkill,
  // program-path/page.tsx:165, has no cap; its own continue-gate,
  // program-path/page.tsx:217, only checks that something was selected —
  // confirmed zero feedback there today). Deliberately NOT consumed from
  // ScheduleStep.tsx (David, 01.09.2026) — nothing on that screen can
  // change hardCount, so the warning would sit there unactionable forever,
  // next to ERR_DAYS_MIN which genuinely is actionable there. Wiring it
  // into program-path/page.tsx is separate work — that screen has no
  // warning-display infrastructure at all today (checked, none exists).
  if (hardCount > MAX_ACTIVE_SKILLS) {
    pushWarning(
      warnings,
      'ERR_03',
      'WARN',
      `${hardCount} סקילים קשים — האימון מתפזר וההתקדמות בכולם תואט.`,
      [],
    );
  }

  const required = MIN_DAYS_FOR_HARD_SKILLS[hardCount];
  if (required !== undefined && daysPerWeek < required) {
    pushWarning(
      warnings,
      'ERR_DAYS_MIN',
      'WARN',
      `${daysPerWeek} ימים ל-${hardCount} סקילים קשים — מומלץ ${required} לפחות.`,
      [],
    );
  }

  return warnings;
}

/**
 * ERR_01 / ERR_02 — evaluated on a *single* SessionItem[] (one session, not a day).
 * Callers running the UPPER_CALISTHENICS builder use this to validate
 * the items they're about to push.
 */
export function validateSingleSession(items: SessionItem[]): Warning[] {
  const warnings: Warning[] = [];

  const hasPlanche = items.some((i) => i.skillId === 'PLANCHE');
  const hasHSPU = items.some((i) => i.skillId === 'HSPU');
  if (hasPlanche && hasHSPU) {
    pushWarning(
      warnings,
      'ERR_01',
      'ERROR',
      "פלאנץ' ו-HSPU באותו סשן — חלק לסשנים נפרדים.",
      [],
    );
  }

  const hasFL = items.some((i) => i.skillId === 'FRONT_LEVER');
  const hasOAPU = items.some((i) => i.skillId === 'OAPU');
  if (hasFL && hasOAPU) {
    pushWarning(
      warnings,
      'ERR_02',
      'ERROR',
      'פרונט ו-OAPU באותו סשן — חייב לחלק.',
      [],
    );
  }

  return warnings;
}

// ──────────────────────────────────────────────────────────────────────────
// 2. buildDefaultTemplate — Sun/Tue/Thu lifestyle protection
// ──────────────────────────────────────────────────────────────────────────

function preferredDays(daysPerWeek: number): number[] {
  const lookup = SCHEDULE_POLICY.PREFERRED_DAYS as Record<number, number[]>;
  if (lookup[daysPerWeek]) return [...lookup[daysPerWeek]];
  // Fallback for 1 or 7 — still skip Saturday by default.
  if (daysPerWeek <= 1) return [0];
  return Array.from({ length: Math.min(daysPerWeek, 6) }, (_, i) => i);
}

function pickPrimary(programs: ProgramId[], skills: PrioritizedSkill[]): {
  primaryItem: ScheduleItemId;
  isSkill: boolean;
} {
  // Prefer the user's #1 priority skill if any; otherwise the first program.
  if (skills.length > 0) {
    const sorted = [...skills].sort((a, b) => a.priority - b.priority);
    return { primaryItem: sorted[0].id, isSkill: true };
  }
  if (programs.length > 0) {
    return { primaryItem: programs[0], isSkill: false };
  }
  return { primaryItem: 'UPPER_BODY', isSkill: false };
}

function makeSession(
  skillId: ScheduleItemId,
  volumePercent: number,
  sessionType: SessionType,
): SessionItem {
  return { skillId, volumePercent, sessionType };
}

/**
 * buildDefaultTemplate
 *
 * Auto-generated weekly skeleton for the wizard's "first paint".
 *   - Uses SCHEDULE_POLICY.PREFERRED_DAYS[daysPerWeek] for day selection.
 *   - Saturday is NEVER assigned by default.
 *   - HANDSTAND is added as `sessions[0]` (morning) on every training day
 *     ONLY when the user has it as a skill (Free Slot).
 *   - [FIX-01] PULL+PULL 3-day: day-4 (ה') = REST, day-5 (ו') = R_PULL
 *     (≥72h after OAPU on day-2).
 *   - Auto-fill never produces Multi-Session days beyond the HANDSTAND slot.
 */
export function buildDefaultTemplate(
  programs: ProgramId[],
  skills: PrioritizedSkill[],
  daysPerWeek: number,
): ScheduleDay[] {
  const days = makeWeek();
  const trainingDayIndices = preferredDays(daysPerWeek);

  if (trainingDayIndices.length === 0) return days;

  const hasHandstand = skills.some((s) => s.id === 'HANDSTAND');
  const realSkills = skills.filter((s) => s.id !== 'HANDSTAND');

  // ── Special-case: PULL + PULL with 3 days (FIX-01) ─────────────────────
  const fl = realSkills.find((s) => s.id === 'FRONT_LEVER');
  const oapu = realSkills.find((s) => s.id === 'OAPU');
  const isPullPullPair =
    realSkills.length === 2 && fl !== undefined && oapu !== undefined;

  if (isPullPullPair && daysPerWeek === 3) {
    // Day 0 = FL(100%), Day 2 = OAPU(100%), Day 4 = REST/LEGS, Day 5 = R_PULL(50%)
    days[0].sessions = [makeSession('FRONT_LEVER', 100, 'FULL')];
    days[2].sessions = [makeSession('OAPU', 100, 'FULL')];
    // Day 4 ('ה') is intentionally rest to give 72h+ buffer.
    days[5].sessions = [makeSession('FRONT_LEVER', 50, 'RECOVERY')];

    [days[0], days[2], days[5]].forEach((d) => {
      d.isRestDay = false;
      if (hasHandstand) d.sessions.unshift(makeSession('HANDSTAND', 60, 'ACCESSORY'));
      sortSessionsInPlace(d);
    });
    return days;
  }

  // ── General case: rotate primary item across preferred days ────────────
  const { primaryItem } = pickPrimary(programs, skills.map((s) => ({ ...s })));

  // If user has multiple skills, place each skill once then use UPPER_CALISTHENICS
  // for any remaining days (§4.3 Combined Hybrid rule).
  // If only one skill / program, repeat it across all days (standard rotation).
  const rotationItems: ScheduleItemId[] =
    realSkills.length > 0
      ? realSkills.map((s) => s.id as ScheduleItemId)
      : programs.length > 0
      ? [primaryItem]
      : ['UPPER_BODY'];

  // When 2+ distinct skills exist, overflow training days beyond the skill count
  // become a Combined Hybrid (UPPER_CALISTHENICS) rather than repeating a skill.
  // Single-skill / program-only users keep the simple modulo rotation.
  const hasMultiSkillOverflow = realSkills.length >= 2;

  trainingDayIndices.forEach((dow, idx) => {
    if (dow === SAT) return; // never default-place into Saturday

    let item: ScheduleItemId;
    if (idx < rotationItems.length) {
      // First N days: one slot per skill, in priority order.
      item = rotationItems[idx];
    } else if (hasMultiSkillOverflow) {
      // Overflow days (§4.3): Combined Hybrid brings all selected skills together.
      item = 'UPPER_CALISTHENICS';
    } else {
      // Single-item rotation (repeat the same program/skill).
      item = rotationItems[idx % rotationItems.length];
    }

    const session = makeSession(item, 100, 'FULL');
    days[dow].sessions = [session];
    days[dow].isRestDay = false;

    if (hasHandstand) {
      days[dow].sessions.unshift(makeSession('HANDSTAND', 60, 'ACCESSORY'));
    }

    sortSessionsInPlace(days[dow]);
  });

  return days;
}

// ──────────────────────────────────────────────────────────────────────────
// 3. validateMultiSession — same-day combinations (LOGIC-01)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Multi-session warnings for ONE day's sessions[].
 * HANDSTAND combined with anything is silent (Free Slot).
 * Cardio (Phase 2) combined with anything is silent.
 */
export function validateMultiSession(sessions: SessionItem[]): Warning[] {
  const warnings: Warning[] = [];
  if (sessions.length < 2) return warnings;

  // Strip HANDSTAND from the conflict-detection set (Free Slot).
  const considered = sessions.filter((s) => s.skillId !== 'HANDSTAND');
  if (considered.length < 2) return warnings;

  // WARN_MS_01 — two PUSH skills on the same day
  const pushCount = considered.filter((s) => isPushItem(s.skillId)).length;
  if (pushCount >= 2) {
    pushWarning(
      warnings,
      'WARN_MS_01',
      'WARN',
      'שני אימוני דחיפה ביום אחד — הכתפיים יצטרכו לפחות 3-4 שעות מנוחה בין הסשנים.',
      [],
    );
  }

  // WARN_MS_02 — FL + OAPU same day
  const hasFL = considered.some((s) => s.skillId === 'FRONT_LEVER');
  const hasOAPU = considered.some((s) => s.skillId === 'OAPU');
  if (hasFL && hasOAPU) {
    pushWarning(
      warnings,
      'WARN_MS_02',
      'WARN',
      'פרונט ו-OAPU ביום אחד — עומס קריטי על הגידים. מינימום 4 שעות הפרדה.',
      [],
    );
  }

  // WARN_MS_03 — pull + FULL_BODY same day
  const hasPull = considered.some((s) => isPullItem(s.skillId));
  const hasFB = considered.some((s) => s.skillId === 'FULL_BODY');
  if (hasPull && hasFB) {
    pushWarning(
      warnings,
      'WARN_MS_03',
      'WARN',
      'משיכה + Full Body ביום אחד — הגב יעבוד פעמיים. שים את הסקיל בבוקר, Full Body בערב.',
      [],
    );
  }

  // WARN_MS_04 — Muscle-Up + anything else
  const hasMU = considered.some((s) => s.skillId === 'MUSCLE_UP');
  if (hasMU && considered.length >= 2) {
    pushWarning(
      warnings,
      'WARN_MS_04',
      'WARN',
      'Muscle-Up + אימון נוסף ביום אחד — MU שורף CNS. שים אותו ראשון, שאר האימונים אחרי 4+ שעות.',
      [],
    );
  }

  return warnings;
}

// ──────────────────────────────────────────────────────────────────────────
// 4. validateSchedule — cross-day rules
// ──────────────────────────────────────────────────────────────────────────

/**
 * Full template validator. Surfaces:
 *   WARN_01–WARN_15 (cross-day fatigue + lifestyle)
 *   WARN_MS_01–WARN_MS_04 (delegated to validateMultiSession per day)
 *
 * Returns a flat list ordered by day index then code. The caller can group
 * for display.
 */
export function validateSchedule(days: ScheduleDay[]): Warning[] {
  if (days.length !== 7) return [];
  const warnings: Warning[] = [];

  // Pre-compute per-day movement summaries for fast lookups.
  const isPushDay = days.map((d) => dayHasMovement(d, isPushItem));
  const isPullDay = days.map((d) => dayHasMovement(d, isPullItem));
  const isUpperDay = days.map((d) =>
    dayHasMovement(d, (id) => isPushItem(id) || isPullItem(id) || id === 'UPPER_BODY' || id === 'UPPER_CALISTHENICS'),
  );

  // ── WARN_01 — two consecutive push days ──────────────────────────────
  for (let i = 0; i < 6; i++) {
    if (isPushDay[i] && isPushDay[i + 1]) {
      pushWarning(
        warnings,
        'WARN_01',
        'WARN',
        'יומיים ברצף של דחיפה — הכתפיים לא מתאוששות.',
        [i, i + 1],
      );
    }
  }

  // ── WARN_02 — two consecutive pull days ──────────────────────────────
  for (let i = 0; i < 6; i++) {
    if (isPullDay[i] && isPullDay[i + 1]) {
      pushWarning(
        warnings,
        'WARN_02',
        'WARN',
        'יומיים ברצף של משיכה — הגידים צריכים 48 שעות.',
        [i, i + 1],
      );
    }
  }

  // ── WARN_03 — MU + any skill within 48h ──────────────────────────────
  for (let i = 0; i < 7; i++) {
    if (!days[i].sessions.some((s) => s.skillId === 'MUSCLE_UP')) continue;
    for (let j = i + 1; j <= i + 2 && j < 7; j++) {
      const hasHardSkill = days[j].sessions.some(
        (s) =>
          s.skillId !== 'MUSCLE_UP' &&
          (ALL_SKILL_IDS as string[]).includes(s.skillId) &&
          s.skillId !== 'HANDSTAND',
      );
      if (hasHardSkill) {
        pushWarning(
          warnings,
          'WARN_03',
          'WARN',
          'MU שורף CNS — הסקיל הבא לפחות יומיים אחר כך.',
          [i, j],
        );
        break;
      }
    }
  }

  // ── WARN_06 — 5+ consecutive training days ───────────────────────────
  let streak = 0;
  let streakStart = -1;
  for (let i = 0; i < 7; i++) {
    if (!dayIsRest(days[i])) {
      if (streak === 0) streakStart = i;
      streak++;
      if (streak >= 5) {
        pushWarning(
          warnings,
          'WARN_06',
          'WARN',
          '5 ימים ברצף — הוסף יום מנוחה.',
          Array.from({ length: streak }, (_, k) => streakStart + k),
        );
        break;
      }
    } else {
      streak = 0;
      streakStart = -1;
    }
  }

  // ── WARN_07 — OAPU > 3x / week ───────────────────────────────────────
  const oapuCount = days.reduce(
    (acc, d) => acc + d.sessions.filter((s) => s.skillId === 'OAPU').length,
    0,
  );
  if (oapuCount > 3) {
    pushWarning(warnings, 'WARN_07', 'WARN', 'OAPU מעל 3X — סיכון דלקת גידים כרונית.', []);
  }

  // ── WARN_09 — pull within 48h after OAPU ─────────────────────────────
  for (let i = 0; i < 7; i++) {
    if (!days[i].sessions.some((s) => s.skillId === 'OAPU')) continue;
    for (let j = i + 1; j <= i + 1 && j < 7; j++) {
      if (isPullDay[j]) {
        pushWarning(
          warnings,
          'WARN_09',
          'WARN',
          'הגידים עדיין בשחזור מה-OAPU.',
          [i, j],
        );
      }
    }
  }

  // ── WARN_14 — 3 upper-body days inside any 4-day window ──────────────
  for (let i = 0; i + 3 < 7; i++) {
    const upperInWindow = [i, i + 1, i + 2, i + 3].filter((k) => isUpperDay[k]).length;
    if (upperInWindow >= 3) {
      pushWarning(
        warnings,
        'WARN_14',
        'WARN',
        '3 ימי עליון ברצף — הוסף מנוחה או רגליים.',
        [i, i + 1, i + 2, i + 3],
      );
      break;
    }
  }

  // ── WARN_15 — Saturday manually scheduled ────────────────────────────
  if (days[SAT].sessions.length > 0 && !dayIsRest(days[SAT])) {
    pushWarning(
      warnings,
      'WARN_15',
      'WARN',
      'שבת אינו ביום ברירת המחדל — ודא שזה מתאים ללוח החיים שלך.',
      [SAT],
    );
  }

  // ── WARN_05 — HANDSTAND < 3x / week (only if user has HS at all) ────
  const handstandCount = days.reduce(
    (acc, d) => acc + d.sessions.filter((s) => s.skillId === 'HANDSTAND').length,
    0,
  );
  if (handstandCount > 0 && handstandCount < 3) {
    pushWarning(
      warnings,
      'WARN_05',
      'WARN',
      'Handstand צריך 3X/שבוע מינימום לשיפור.',
      [],
    );
  }

  // ── Per-day: Multi-Session warnings (WARN_MS_01–WARN_MS_04) ──────────
  for (let i = 0; i < 7; i++) {
    const ms = validateMultiSession(days[i].sessions);
    for (const w of ms) {
      warnings.push({ ...w, affectedDays: [i] });
    }
  }

  return warnings;
}

// ──────────────────────────────────────────────────────────────────────────
// 5. getUpperBodyDominance
// ──────────────────────────────────────────────────────────────────────────

export function getUpperBodyDominance(adjacentSkill: PrioritizedSkill): UBDominance {
  const movement: MovementType = adjacentSkill.movementType;
  if (movement === 'PUSH') return 'PULL_DOM';
  if (movement === 'PULL') return 'PUSH_DOM';
  return 'BALANCED';
}

// ──────────────────────────────────────────────────────────────────────────
// 6. buildUpperCalisthenicsSession (§5.5)
// ──────────────────────────────────────────────────────────────────────────

const PRIORITY_VOLUME_WEIGHT: Record<number, number> = {
  1: 1.0,
  2: 0.7,
  3: 0.5,
  4: 0.35,
};

const BASE_VOLUMES: Record<'FULL' | 'COMBINED' | 'RECOVERY', number> = {
  FULL: 1.0,
  COMBINED: 0.6,
  RECOVERY: 0.4,
};

function sortSkillsBySessionOrder(skills: PrioritizedSkill[]): PrioritizedSkill[] {
  return [...skills].sort((a, b) => {
    const ai = SESSION_ORDER_IN_DAY.indexOf(a.id);
    const bi = SESSION_ORDER_IN_DAY.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function buildUpperCalisthenicsSession(
  skills: PrioritizedSkill[],
  sessionType: 'FULL' | 'COMBINED' | 'RECOVERY',
): SessionItem[] {
  const items: SessionItem[] = [];
  const ordered = sortSkillsBySessionOrder(skills);

  for (const skill of ordered) {
    const baseVolume =
      BASE_VOLUMES[sessionType] * (PRIORITY_VOLUME_WEIGHT[skill.priority] ?? 0.3);
    let volume = baseVolume;
    const last = items[items.length - 1];

    if (last) {
      const lastMovement = MOVEMENT_OF[last.skillId];
      if (lastMovement === 'PUSH' && skill.movementType === 'PUSH') volume *= 0.7;
      if (lastMovement === 'PULL' && skill.id === 'OAPU') volume *= 0.5;
    }

    items.push({
      skillId: skill.id,
      volumePercent: Math.round(volume * 100),
      sessionType,
      orderInDay: items.length,
    });
  }

  return items;
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Re-export utility — combine warnings for a grid
// ──────────────────────────────────────────────────────────────────────────

/**
 * Convenience: run validateSchedule + return errors + warns separately
 * for UI consumption.
 */
export function partitionWarnings(all: Warning[]): {
  errors: Warning[];
  warns: Warning[];
} {
  const errors: Warning[] = [];
  const warns: Warning[] = [];
  for (const w of all) {
    if (w.level === 'ERROR') errors.push(w);
    else warns.push(w);
  }
  return { errors, warns };
}

// Re-exports for convenience (avoids deep imports in UI)
export {
  MIN_REST_HOURS,
  MAX_ACTIVE_SKILLS,
  countActiveSkills,
  SCHEDULE_POLICY,
};
