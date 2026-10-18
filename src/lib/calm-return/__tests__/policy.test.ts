import { describe, it, expect } from 'vitest';
import {
  tierForDaysAway,
  resolveCalmReturn,
  CALM_LOADS,
  NO_CHANGE_LOAD,
  MAKEUP_MAX_AGE_DAYS,
  WELCOME_BACK_GAP_DAYS,
  FRESH_START_GAP_DAYS,
  RE_ENTRY_GAP_DAYS,
} from '../policy';

const NOW = new Date(2026, 9, 18, 9, 0);

describe('tier selection (owner-approved table)', () => {
  it.each([
    [null, 'on_track'],
    [0, 'on_track'],
    [3, 'on_track'],
    [4, 'welcome_back'],
    [6, 'welcome_back'],
    [7, 'fresh_start'],
    [27, 'fresh_start'],
    [28, 're_entry'],
    [200, 're_entry'],
  ] as const)('%s days away → %s', (days, tier) => {
    expect(tierForDaysAway(days)).toBe(tier);
  });

  it('thresholds match the schedule advisor (#440) so both name the same day the same way', async () => {
    const advisor = await import('@/features/schedule/advisor/advisor');
    expect(MAKEUP_MAX_AGE_DAYS).toBe(advisor.MAKEUP_MAX_AGE_DAYS);
    expect(WELCOME_BACK_GAP_DAYS).toBe(advisor.WELCOME_BACK_GAP_DAYS);
    expect(FRESH_START_GAP_DAYS).toBe(advisor.FRESH_START_GAP_DAYS);
    expect([MAKEUP_MAX_AGE_DAYS, WELCOME_BACK_GAP_DAYS, FRESH_START_GAP_DAYS, RE_ENTRY_GAP_DAYS]).toEqual([2, 4, 7, 28]);
  });
});

describe('load reduction per tier', () => {
  const at = (daysAway: number | null, episode: unknown = undefined) =>
    resolveCalmReturn({ daysAway, episode, now: NOW });

  it('0–3 days: nothing changes', () => {
    for (const d of [null, 0, 1, 2, 3]) {
      const s = at(d);
      expect(s.load).toEqual(NO_CHANGE_LOAD);
      expect(s.isLightened).toBe(false);
      expect(s.shouldStartEpisode).toBe(false);
    }
  });

  it('4–6 days: strength −20%, no difficulty 3, easy runs only, full run volume, no episode', () => {
    const s = at(5);
    expect(s.load).toEqual({ strengthVolumeReduction: 0.2, strengthMaxDifficulty: 2, runVolumeReduction: 0, runEasyOnly: true });
    expect(s.shouldStartEpisode).toBe(false);
  });

  it('7–27 days: a new fresh week from today — strength −30%, ≤D2, run −20%, intervals → easy', () => {
    const s = at(10);
    expect(s.load).toEqual(CALM_LOADS.fresh_start_w1);
    expect(s.load).toEqual({ strengthVolumeReduction: 0.3, strengthMaxDifficulty: 2, runVolumeReduction: 0.2, runEasyOnly: true });
    expect(s.shouldStartEpisode).toBe(true);
    expect(s.episode).toEqual({ startDate: '2026-10-18', tier: 'fresh_start', v: 1 });
    expect(s.episodeWeek).toBe(1);
  });

  it('28+ days: re-entry — strength −40% week 1', () => {
    const s = at(40);
    expect(s.load.strengthVolumeReduction).toBe(0.4);
    expect(s.episode?.tier).toBe('re_entry');
    expect(s.shouldStartEpisode).toBe(true);
  });

  it('the lighter week outlasts the first workout back (episode week 1, back on track)', () => {
    // Episode started 3 days ago; the user trained yesterday → daysAway 1.
    const s = at(1, { startDate: '2026-10-15', tier: 'fresh_start', v: 1 });
    expect(s.tier).toBe('on_track');
    expect(s.episodeWeek).toBe(1);
    expect(s.load).toEqual(CALM_LOADS.fresh_start_w1);
    expect(s.shouldStartEpisode).toBe(false);
  });

  it('a fresh-start episode ends after one week', () => {
    const s = at(0, { startDate: '2026-10-10', tier: 'fresh_start', v: 1 });
    expect(s.episode).toBeNull();
    expect(s.load).toEqual(NO_CHANGE_LOAD);
  });

  it('re-entry: −40% in week 1, −20% in week 2, nothing in week 3', () => {
    const ep = { startDate: '2026-10-01', tier: 're_entry', v: 1 };
    expect(resolveCalmReturn({ daysAway: 0, episode: ep, now: new Date(2026, 9, 5) }).load.strengthVolumeReduction).toBe(0.4);
    const w2 = resolveCalmReturn({ daysAway: 0, episode: ep, now: new Date(2026, 9, 10) });
    expect(w2.episodeWeek).toBe(2);
    expect(w2.load).toEqual(CALM_LOADS.re_entry_w2);
    expect(w2.load.strengthVolumeReduction).toBe(0.2);
    expect(resolveCalmReturn({ daysAway: 0, episode: ep, now: new Date(2026, 9, 15) }).load).toEqual(NO_CHANGE_LOAD);
  });

  it('an episode that already covers the gap is not started again (one card per return)', () => {
    // Opened 2 days ago after a 10-day gap (episode written), still no workout: 12 days away.
    const s = at(12, { startDate: '2026-10-16', tier: 'fresh_start', v: 1 });
    expect(s.shouldStartEpisode).toBe(false);
    expect(s.episode?.startDate).toBe('2026-10-16');
    expect(s.load).toEqual(CALM_LOADS.fresh_start_w1);
  });

  it('a new 7+ day gap AFTER training in an old episode starts a new one', () => {
    // Episode from 20 days ago; trained 18 days ago; away since.
    const s = at(18, { startDate: '2026-09-28', tier: 'fresh_start', v: 1 });
    expect(s.shouldStartEpisode).toBe(true);
    expect(s.episode?.startDate).toBe('2026-10-18');
  });

  it('ignores a malformed stored episode', () => {
    expect(at(1, { startDate: 5, tier: 'x' }).episode).toBeNull();
    expect(at(1, 'garbage').load).toEqual(NO_CHANGE_LOAD);
  });
});
