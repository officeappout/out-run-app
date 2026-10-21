import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  resolveGuidedMode, readGuidedSettings, isCompletedStation, shouldShowFastPrompt,
  guidanceLine, welcomeCta, exerciseTypeChip, FAST_PROMPT_AFTER_STATIONS,
  GUIDED_COMPLETED_COUNT_KEY, GUIDED_FAST_PROMPT_ASKED_KEY, GUIDED_SETTING_KEY,
} from '../guided-station';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/**
 * PR-B1 — guided ("ליווי צעד-אחר-צעד") station layer: default rules, kill-switch, the
 * completed-station count, the one-time switch-to-fast prompt, and fast-mode = unchanged.
 */

describe('default rules + kill-switch', () => {
  it('unset → ON (default for everyone)', () => {
    expect(resolveGuidedMode(undefined, true)).toBe(true);
  });
  it('an explicit choice wins', () => {
    expect(resolveGuidedMode(false, true)).toBe(false);
    expect(resolveGuidedMode(true, true)).toBe(true);
  });
  it('kill-switch off → fast mode regardless of the user choice', () => {
    expect(resolveGuidedMode(undefined, false)).toBe(false);
    expect(resolveGuidedMode(true, false)).toBe(false);
  });
  it('the kill-switch flag exists and fails OPEN (enabled by default)', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableGuidedStation');
    expect(def).toMatchObject({ firestoreKey: 'enable_guided_station', defaultValue: true });
  });
  it('reads the settings map field-guarded (missing/garbage → defaults)', () => {
    expect(readGuidedSettings(null)).toEqual({ guidedStation: undefined, guidedStationsCompleted: 0, guidedFastPromptAsked: false });
    expect(readGuidedSettings({ settings: { guidedStation: 'yes', guidedStationsCompleted: 'x' } })).toEqual({
      guidedStation: undefined, guidedStationsCompleted: 0, guidedFastPromptAsked: false,
    });
    expect(readGuidedSettings({ settings: { guidedStation: false, guidedStationsCompleted: 3, guidedFastPromptAsked: true } })).toEqual({
      guidedStation: false, guidedStationsCompleted: 3, guidedFastPromptAsked: true,
    });
  });
});

describe('completed-station count', () => {
  it('a station counts only when ≥1 set was logged (skips / empty exits never count)', () => {
    expect(isCompletedStation(undefined)).toBe(false);
    expect(isCompletedStation([])).toBe(false);
    expect(isCompletedStation([{ confirmedReps: [] }])).toBe(false);
    expect(isCompletedStation([{ confirmedReps: [] }, { confirmedReps: [8] }])).toBe(true);
  });
});

describe('switch-to-fast prompt: exactly once, from the 2nd completed guided station', () => {
  it('threshold is 2', () => expect(FAST_PROMPT_AFTER_STATIONS).toBe(2));
  it('not before the 2nd, yes at the 2nd (and later if it could not be shown yet), never once asked', () => {
    expect(shouldShowFastPrompt(true, 1, false)).toBe(false);
    expect(shouldShowFastPrompt(true, 2, false)).toBe(true);
    expect(shouldShowFastPrompt(true, 3, false)).toBe(true);
    expect(shouldShowFastPrompt(true, 2, true)).toBe(false);
    expect(shouldShowFastPrompt(false, 5, false)).toBe(false); // fast-mode users never see it
  });
});

describe('guided-station.service writes (count + asked flag + choice)', () => {
  const writes: Array<Record<string, unknown>> = [];
  let profile: { settings?: Record<string, unknown> } | null = null;

  beforeEach(() => {
    writes.length = 0;
    profile = { settings: {} };
    vi.resetModules();
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      updateDoc: async (_ref: unknown, update: Record<string, unknown>) => { writes.push(update); },
      increment: (n: number) => ({ __increment: n }),
    }));
    vi.doMock('@/lib/firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {} }));
    vi.doMock('@/features/user', () => ({
      useUserStore: {
        getState: () => ({
          profile,
          updateProfile: (u: { settings?: Record<string, unknown> }) => { profile = { ...profile, ...u }; },
        }),
      },
    }));
  });

  it('recordGuidedStationCompleted: +1 locally and an atomic increment in Firestore', async () => {
    const svc = await import('../guided-station.service');
    expect(svc.recordGuidedStationCompleted()).toBe(1);
    expect(svc.recordGuidedStationCompleted()).toBe(2);
    expect(readGuidedSettings(profile).guidedStationsCompleted).toBe(2);
    await Promise.resolve();
    expect(writes).toEqual([
      { [GUIDED_COMPLETED_COUNT_KEY]: { __increment: 1 } },
      { [GUIDED_COMPLETED_COUNT_KEY]: { __increment: 1 } },
    ]);
  });

  it('markFastPromptAsked → the prompt can never show again; accepting turns guided off', async () => {
    const svc = await import('../guided-station.service');
    svc.recordGuidedStationCompleted();
    const count = svc.recordGuidedStationCompleted();
    expect(shouldShowFastPrompt(true, count, readGuidedSettings(profile).guidedFastPromptAsked)).toBe(true);
    svc.markFastPromptAsked();
    expect(shouldShowFastPrompt(true, count, readGuidedSettings(profile).guidedFastPromptAsked)).toBe(false);
    svc.setGuidedStationChoice(false);
    expect(resolveGuidedMode(readGuidedSettings(profile).guidedStation, true)).toBe(false);
    await Promise.resolve();
    expect(writes).toContainEqual({ [GUIDED_FAST_PROMPT_ASKED_KEY]: true });
    expect(writes).toContainEqual({ [GUIDED_SETTING_KEY]: false });
  });
});

describe('copy', () => {
  it('reps guidance is gendered; timed is neutral', () => {
    expect(guidanceLine('reps', 'male', 10)).toBe('עשה 10 חזרות בקצב שלך, ואז לחץ סיימתי');
    expect(guidanceLine('reps', 'female', 10)).toBe('עשי 10 חזרות בקצב שלך, ואז לחצי סיימתי');
    expect(guidanceLine('reps', undefined)).toBe('עשה חזרות בקצב שלך, ואז לחץ סיימתי');
    expect(guidanceLine('time', 'female')).toBe('ממשיכים עד שהטיימר נגמר');
  });
  it('welcome CTA is one neutral form for every gender', () => {
    expect(welcomeCta('male')).toBe('מתחילים');
    expect(welcomeCta('female')).toBe('מתחילים');
    expect(welcomeCta(undefined)).toBe('מתחילים');
  });
  it('type chip: time (Timer) for timed and tabata, reps (Repeat) for reps', () => {
    expect(exerciseTypeChip({ exerciseType: 'time' }, false)).toBe('time');
    expect(exerciseTypeChip({ isTimeBased: true }, false)).toBe('time');
    expect(exerciseTypeChip({ exerciseType: 'reps' }, true)).toBe('time');
    expect(exerciseTypeChip({ exerciseType: 'reps' }, false)).toBe('reps');
  });
});

// Source-level (vitest here can't render .tsx — see vitest-node-only-no-jsdom).
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('guided-only screens are absent in fast mode', () => {
  const layer = read('../HybridStationLayer.tsx');
  const runner = read('../../players/strength/StrengthRunner.tsx');

  it('the welcome screen is gated on guided', () => {
    expect(layer).toContain('guided && stationContext && welcomeDoneFor !== stationContext.stationNumber ? (');
  });
  it('the count + prompt only run in guided mode', () => {
    expect(layer).toContain('if (guided && isCompletedStation(exerciseLog)) {');
  });
  it('StrengthRunner: guidance lines + rest auto-expand only when guided (default false)', () => {
    expect(runner).toContain('  guided = false,');
    expect(runner).toContain('!guided || sm.exerciseType');
    expect((runner.match(/autoExpandPreview=\{guided\}/g) ?? []).length).toBe(2);
  });
  it('the RestScreen tile keeps its old default (collapsed) without the guided prop', () => {
    const rest = read('../../players/strength/components/RestScreen.tsx');
    expect(rest).toContain('autoExpandPreview = false,');
    expect(rest).toContain('useState(autoExpandPreview)');
  });
});
