/**
 * Default PaceMapConfig — the global percentage tables derived from the
 * coaching PDF (pages 7–8 for fast runners, pages 10–11 for slow runners).
 *
 * Walk zone uses fixed seconds/km values (8:30–11:30 for all profiles).
 * All other zones are expressed as percentages of the runner's basePace.
 *
 * Higher percentage → slower pace (more seconds per km).
 * Lower percentage  → faster pace (fewer seconds per km).
 */

import type { PaceMapConfig, PaceZoneRule, RunZoneType } from '../types/running.types';

// ── Helpers ──────────────────────────────────────────────────────────

const walkZone: PaceZoneRule = {
  fixedMinSeconds: 510,   // 8:30
  fixedMaxSeconds: 690,   // 11:30
  label: 'הליכה',
};

function pct(min: number, max: number, label: string): PaceZoneRule {
  return { minPercent: min, maxPercent: max, label };
}

// ── Profile 1 — Fast improver (basePace < 360s / faster than 6:00) ──

const profileFast: Record<RunZoneType, PaceZoneRule> = {
  walk:            walkZone,
  jogging:         pct(160, 180, 'ריצת ג׳וגינג'),
  recovery:        pct(145, 165, 'ריצת התאוששות'),
  easy:            pct(130, 145, 'ריצה קלה / חימום'),
  long_run:        pct(130, 160, 'ריצת נפח'),
  fartlek_medium:  pct(115, 120, 'פארטלק בינוני'),
  tempo:           pct(105, 112, 'טמפו / סף לקטט'),
  fartlek_fast:    pct(103, 107, 'פארטלק מהיר / קצב 10 ק״מ'),
  interval_short:  pct(98,  102, 'אינטרוולים קצרים'),
};

// ── Profile 2 — Slow improver (basePace >= 360s / slower than 6:00) ─

const profileSlow: Record<RunZoneType, PaceZoneRule> = {
  walk:            walkZone,
  jogging:         pct(123, 137, 'ריצת ג׳וגינג'),    // merged with recovery for this profile
  recovery:        pct(123, 137, 'ריצת התאוששות'),
  easy:            pct(108, 127, 'ריצה קלה / חימום'),
  long_run:        pct(108, 127, 'ריצת נפח'),         // same range as easy for slow runners
  fartlek_medium:  pct(106, 114, 'פארטלק בינוני'),
  tempo:           pct(101, 109, 'טמפו / סף לקטט'),
  fartlek_fast:    pct(96,  104, 'פארטלק מהיר / קצב 10 ק״מ'),
  interval_short:  pct(94,  101, 'אינטרוולים קצרים'),
};

// ── Profile 3 — Beginner (same percentages as slow, numbers hidden in UI) ─

const profileBeginner: Record<RunZoneType, PaceZoneRule> = { ...profileSlow };

// ── Profile 4 — Maintenance (same percentages as slow) ──────────────

const profileMaintenance: Record<RunZoneType, PaceZoneRule> = { ...profileSlow };

// ── Assembled default config ────────────────────────────────────────

export const DEFAULT_PACE_MAP_CONFIG: PaceMapConfig = {
  id: 'paceMapConfig',
  profileFast,
  profileSlow,
  profileBeginner,
  profileMaintenance,
  lastUpdatedBy: 'system',
  version: 1,
};
