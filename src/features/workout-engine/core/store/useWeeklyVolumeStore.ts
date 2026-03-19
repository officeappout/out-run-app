/**
 * Weekly Volume Store
 * 
 * Global volume budget tracker across all strength programs.
 * Tracks completed sets reactively based on StrengthSummaryPage reports.
 * 
 * Key Business Rules:
 * - Only updates from completed sets (not planned)
 * - Recovery workouts (isRecovery=true) are excluded from budget
 * - Weekly budget resets on Sunday (calendar week start)
 * - Remaining budget feeds into WorkoutGenerator for smart volume adjustment
 * - Future-proofed for running metrics (duration/distance)
 * 
 * @see TRAINING_LOGIC.md Rule 2.3 (Reactivation Protocol)
 */

import { create } from 'zustand';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Strength-specific volume metrics
 */
export interface StrengthVolumeMetrics {
  /** Total sets completed this week (non-recovery only) */
  totalSetsCompleted: number;
  /** Total sets planned across all sessions this week */
  totalSetsPlanned: number;
  /** Weekly budget (calculated from level + schedule frequency) */
  weeklyBudget: number;
  /** Number of 3-bolt (intense) sessions completed this week */
  intenseSessionsCompleted: number;
  /** Per-domain completed sets this week (e.g. { push: 8, pull: 6, legs: 4, core: 3 }) */
  domainSetsCompleted: Record<string, number>;
  /** Total straight-arm (static) sets completed this week */
  saSetsCompleted: number;
}

/**
 * Weekly active minutes tracking.
 * Used as a goal for beginners (WHO 150 min target) and a safety
 * cap for advanced athletes (overtraining prevention).
 */
export interface WeeklyActiveMinutes {
  /** Total active minutes this week (all sessions, including recovery) */
  totalMinutes: number;
  /** Weekly minutes goal — beginners aim for 150, advanced capped higher */
  weeklyGoal: number;
  /** Number of sessions contributing to the total */
  sessionCount: number;
}

/**
 * Running volume metrics (future-proofing)
 */
export interface RunningVolumeMetrics {
  /** Total distance in km this week */
  totalDistance: number;
  /** Total duration in minutes this week */
  totalDuration: number;
  /** Weekly target distance in km */
  weeklyTargetDistance: number;
  /** Weekly target duration in minutes */
  weeklyTargetDuration: number;
}

/**
 * Individual session log for auditing
 */
export interface SessionLog {
  /** Timestamp of session completion */
  completedAt: Date;
  /** Sets completed in this session */
  setsCompleted: number;
  /** Sets that were planned for this session */
  setsPlanned: number;
  /** Difficulty level used (1-3 bolts) */
  difficulty: 1 | 2 | 3;
  /** Whether this was flagged as recovery */
  isRecovery: boolean;
  /** Program ID of the session */
  programId?: string;
  /** Duration of the session in minutes (for weekly minutes tracking) */
  durationMinutes?: number;
  /** Per-domain set counts for this session (e.g. { push: 4, pull: 3 }) */
  domainSets?: Record<string, number>;
  /** Exercise IDs performed in this session (for Variety Guard). */
  exerciseIds?: string[];
}

/**
 * Full weekly volume state
 */
interface WeeklyVolumeState {
  // Identity
  userId: string;
  weekStartDate: string; // ISO date of Sunday (YYYY-MM-DD)

  // Strength metrics
  strength: StrengthVolumeMetrics;

  // Running metrics (future-proofing)
  running: RunningVolumeMetrics;

  // Weekly active minutes (goal for beginners / cap for advanced)
  activeMinutes: WeeklyActiveMinutes;

  // Session history for the current week
  sessionLogs: SessionLog[];

  // Metadata
  lastUpdated: Date | null;
  isInitialized: boolean;

  // ── Actions ──
  /** Initialize/reset for a new week */
  initializeWeek: (userId: string, weeklyBudget: number, weeklyMinutesGoal?: number) => void;

  /**
   * Record a completed strength session.
   * Only updates budget if !isRecovery.
   * @param durationMinutes — session duration for weekly minutes tracking
   * @param domainSets — per-domain set counts (e.g. { push: 4, pull: 3 })
   * @param exerciseIds — exercise IDs performed in this session (for Variety Guard)
   */
  recordStrengthSession: (
    setsCompleted: number,
    setsPlanned: number,
    difficulty: 1 | 2 | 3,
    isRecovery: boolean,
    programId?: string,
    durationMinutes?: number,
    domainSets?: Record<string, number>,
    exerciseIds?: string[],
  ) => void;

  /**
   * Record a completed running session (future use).
   */
  recordRunningSession: (distanceKm: number, durationMin: number) => void;

  /** Get the remaining weekly strength budget */
  getRemainingBudget: () => number;

  /** Get budget usage as a percentage (0-100) */
  getBudgetUsagePercent: () => number;

  /** Get the count of intense sessions this week */
  getIntenseSessionCount: () => number;

  /** Get weekly active minutes progress as a percentage (0-100) */
  getActiveMinutesPercent: () => number;

  /** Get remaining budget for a specific domain (Phase 3 — per-domain tracking) */
  getDomainRemainingBudget: (domain: string, weeklyTarget: number) => number;

  /** Get all per-domain completed sets for this week */
  getDomainSetsCompleted: () => Record<string, number>;

  /** Get exercise IDs from the last N sessions (for Variety Guard anti-boredom). */
  getRecentExerciseIds: (lastN?: number) => string[];

  /** Check if the week needs to be reset (new calendar week) */
  checkAndResetWeek: (userId: string, weeklyBudget: number, weeklyMinutesGoal?: number) => void;

  /**
   * Recalculate running session count from the Activity Store's weekActivities.
   * Scans all daily activities for the current week and sums cardio sessions.
   */
  recalculateFromActivities: () => void;

  /** Full reset (logout) */
  reset: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the Sunday of the current calendar week as 'YYYY-MM-DD'.
 * Uses local date (not UTC) so the boundary matches the user's timezone.
 */
function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, '0');
  const d = String(sunday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fallback weekly budget when Admin Panel (ProgramLevelSettings) has no value.
 * Formula: userLevel * 2 (e.g. L10 → 20 sets/week).
 * Prefer weeklyVolumeTarget from Lead Program / ProgramLevelSettings.
 */
export function calculateWeeklyBudget(userLevel: number, _scheduleDays?: number): number {
  return Math.max(4, userLevel * 2);
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialStrength: StrengthVolumeMetrics = {
  totalSetsCompleted: 0,
  totalSetsPlanned: 0,
  weeklyBudget: 0,
  intenseSessionsCompleted: 0,
  domainSetsCompleted: {},
  saSetsCompleted: 0,
};

const initialRunning: RunningVolumeMetrics = {
  totalDistance: 0,
  totalDuration: 0,
  weeklyTargetDistance: 0,
  weeklyTargetDuration: 0,
};

const initialActiveMinutes: WeeklyActiveMinutes = {
  totalMinutes: 0,
  weeklyGoal: 150, // WHO guideline: 150 min/week moderate activity
  sessionCount: 0,
};

// ============================================================================
// STORE
// ============================================================================

export const useWeeklyVolumeStore = create<WeeklyVolumeState>((set, get) => ({
  userId: '',
  weekStartDate: getCurrentWeekStart(),
  strength: { ...initialStrength },
  running: { ...initialRunning },
  activeMinutes: { ...initialActiveMinutes },
  sessionLogs: [],
  lastUpdated: null,
  isInitialized: false,

  // ── Initialize / Reset Week ──────────────────────────────────────────
  initializeWeek: (userId: string, weeklyBudget: number, weeklyMinutesGoal?: number) => {
    set({
      userId,
      weekStartDate: getCurrentWeekStart(),
      strength: { ...initialStrength, weeklyBudget },
      running: { ...initialRunning },
      activeMinutes: { ...initialActiveMinutes, weeklyGoal: weeklyMinutesGoal ?? 150 },
      sessionLogs: [],
      lastUpdated: new Date(),
      isInitialized: true,
    });
  },

  // ── Record Strength Session ──────────────────────────────────────────
  recordStrengthSession: (
    setsCompleted: number,
    setsPlanned: number,
    difficulty: 1 | 2 | 3,
    isRecovery: boolean,
    programId?: string,
    durationMinutes?: number,
    domainSets?: Record<string, number>,
    exerciseIds?: string[],
    saSets?: number,
  ) => {
    set((state) => {
      const log: SessionLog = {
        completedAt: new Date(),
        setsCompleted,
        setsPlanned,
        difficulty,
        isRecovery,
        programId,
        durationMinutes,
        domainSets,
        exerciseIds,
      };

      // Active minutes always accrue (including recovery)
      const minutesDelta = durationMinutes ?? 0;
      const updatedActiveMinutes: WeeklyActiveMinutes = {
        ...state.activeMinutes,
        totalMinutes: state.activeMinutes.totalMinutes + minutesDelta,
        sessionCount: state.activeMinutes.sessionCount + 1,
      };

      // Recovery workouts don't consume the volume budget
      if (isRecovery) {
        return {
          activeMinutes: updatedActiveMinutes,
          sessionLogs: [...state.sessionLogs, log],
          lastUpdated: new Date(),
        };
      }

      // Merge per-domain sets into cumulative tracker
      const updatedDomainSets = { ...state.strength.domainSetsCompleted };
      if (domainSets) {
        for (const [domain, sets] of Object.entries(domainSets)) {
          updatedDomainSets[domain] = (updatedDomainSets[domain] ?? 0) + sets;
        }
      }

      return {
        strength: {
          ...state.strength,
          totalSetsCompleted: state.strength.totalSetsCompleted + setsCompleted,
          totalSetsPlanned: state.strength.totalSetsPlanned + setsPlanned,
          intenseSessionsCompleted:
            difficulty === 3
              ? state.strength.intenseSessionsCompleted + 1
              : state.strength.intenseSessionsCompleted,
          domainSetsCompleted: updatedDomainSets,
          saSetsCompleted: state.strength.saSetsCompleted + (saSets ?? 0),
        },
        activeMinutes: updatedActiveMinutes,
        sessionLogs: [...state.sessionLogs, log],
        lastUpdated: new Date(),
      };
    });

    const domainLog = domainSets
      ? ' | Domains: ' + Object.entries(domainSets).map(([d, s]) => `${d}=${s}`).join(', ')
      : '';
    console.log(
      `[WeeklyVolume] Session recorded: ${setsCompleted}/${setsPlanned} sets` +
        ` (D${difficulty}, recovery=${isRecovery}).` +
        ` Budget: ${get().strength.totalSetsCompleted}/${get().strength.weeklyBudget}` +
        ` | Active: ${get().activeMinutes.totalMinutes}/${get().activeMinutes.weeklyGoal} min` +
        domainLog,
    );
  },

  // ── Record Running Session (future) ──────────────────────────────────
  recordRunningSession: (distanceKm: number, durationMin: number) => {
    set((state) => ({
      running: {
        ...state.running,
        totalDistance: state.running.totalDistance + distanceKm,
        totalDuration: state.running.totalDuration + durationMin,
      },
      activeMinutes: {
        ...state.activeMinutes,
        totalMinutes: state.activeMinutes.totalMinutes + durationMin,
        sessionCount: state.activeMinutes.sessionCount + 1,
      },
      lastUpdated: new Date(),
    }));
  },

  // ── Derived Getters ──────────────────────────────────────────────────
  getRemainingBudget: () => {
    const { strength } = get();
    return Math.max(0, strength.weeklyBudget - strength.totalSetsCompleted);
  },

  getBudgetUsagePercent: () => {
    const { strength } = get();
    if (strength.weeklyBudget === 0) return 0;
    return Math.min(100, Math.round((strength.totalSetsCompleted / strength.weeklyBudget) * 100));
  },

  getIntenseSessionCount: () => {
    return get().strength.intenseSessionsCompleted;
  },

  getActiveMinutesPercent: () => {
    const { activeMinutes } = get();
    if (activeMinutes.weeklyGoal === 0) return 0;
    return Math.min(100, Math.round((activeMinutes.totalMinutes / activeMinutes.weeklyGoal) * 100));
  },

  getDomainRemainingBudget: (domain: string, weeklyTarget: number) => {
    const completed = get().strength.domainSetsCompleted[domain] ?? 0;
    return Math.max(0, weeklyTarget - completed);
  },

  getDomainSetsCompleted: () => {
    return { ...get().strength.domainSetsCompleted };
  },

  getSASetsCompleted: () => {
    return get().strength.saSetsCompleted;
  },

  getRecentExerciseIds: (lastN = 2) => {
    const logs = get().sessionLogs;
    const recentLogs = logs.slice(-lastN);
    const ids: string[] = [];
    for (const log of recentLogs) {
      if (log.exerciseIds) {
        for (const id of log.exerciseIds) {
          if (!ids.includes(id)) ids.push(id);
        }
      }
    }
    return ids;
  },

  // ── Week Boundary Check ────────────────────────────────────────────── 
  checkAndResetWeek: (userId: string, weeklyBudget: number, weeklyMinutesGoal?: number) => {
    const currentWeek = getCurrentWeekStart();
    const state = get();

    // Only reset when the calendar week actually changed
    if (state.weekStartDate !== currentWeek) {
      console.log(
        `[WeeklyVolume] New week detected (${state.weekStartDate} → ${currentWeek}). Resetting.`,
      );
      get().initializeWeek(userId, weeklyBudget, weeklyMinutesGoal);
      return;
    }

    // First load or user switch — initialize without wiping existing same-week data
    if (!state.isInitialized || state.userId !== userId) {
      set({
        userId,
        strength: { ...state.strength, weeklyBudget },
        activeMinutes: { ...state.activeMinutes, weeklyGoal: weeklyMinutesGoal ?? state.activeMinutes.weeklyGoal },
        lastUpdated: new Date(),
        isInitialized: true,
      });
    }
  },

  // ── Recalculate from Activity Store ─────────────────────────────────
  recalculateFromActivities: () => {
    try {
      // Dynamic import to avoid circular dependency at module level
      const { useActivityStore } = require('@/features/activity/store/useActivityStore');
      const activityState = useActivityStore.getState();
      const weekActivities = activityState.weekActivities ?? {};

      const weekStart = getCurrentWeekStart();

      let totalCardioSessions = 0;
      let totalCardioMinutes = 0;
      let totalDistanceKm = 0;

      for (const [dateStr, activity] of Object.entries(weekActivities)) {
        if (dateStr < weekStart) continue;

        const cardio = (activity as { categories?: { cardio?: { sessions?: number; minutes?: number } } })
          ?.categories?.cardio;
        totalCardioSessions += cardio?.sessions ?? 0;
        totalCardioMinutes += cardio?.minutes ?? 0;
      }

      // Estimate distance from minutes (rough 6 min/km for recalculation fallback)
      totalDistanceKm = totalCardioMinutes / 6;

      set((state) => ({
        running: {
          ...state.running,
          totalDuration: totalCardioMinutes,
          totalDistance: Math.max(state.running.totalDistance, totalDistanceKm),
        },
        activeMinutes: {
          ...state.activeMinutes,
          sessionCount: Math.max(state.activeMinutes.sessionCount, totalCardioSessions),
        },
        lastUpdated: new Date(),
      }));

      console.log(
        `[WeeklyVolume] Recalculated from activities: ` +
        `${totalCardioSessions} cardio sessions, ${totalCardioMinutes} min`,
      );
    } catch (err) {
      console.warn('[WeeklyVolume] recalculateFromActivities failed:', err);
    }
  },

  // ── Full Reset ───────────────────────────────────────────────────────
  reset: () => {
    set({
      userId: '',
      weekStartDate: getCurrentWeekStart(),
      strength: { ...initialStrength },
      running: { ...initialRunning },
      activeMinutes: { ...initialActiveMinutes },
      sessionLogs: [],
      lastUpdated: null,
      isInitialized: false,
    });
  },
}));
