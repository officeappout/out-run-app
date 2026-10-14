import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  extendRestSeconds, REST_EXTEND_SECONDS, restBeepForSecond, setCounterLabel,
} from '../player-controls.utils';

/**
 * G2.4 (Sderot field test) — strength player controls: "+15 שנ׳", the earlier rest warning
 * beep, "סט X מתוך Y", session-wide mute, and skip-rest during tabata.
 */

describe('"+15 שנ׳" — extend the current rest', () => {
  it('adds 15s to the running countdown', () => {
    expect(REST_EXTEND_SECONDS).toBe(15);
    expect(extendRestSeconds(7)).toBe(22);
  });
  it('a rest already at 0 (waiting for a tap) restarts from 0 → full 15s', () => {
    expect(extendRestSeconds(0)).toBe(15);
    expect(extendRestSeconds(-3)).toBe(15);
    expect(extendRestSeconds(Number.NaN)).toBe(15);
  });
});

describe('rest countdown cues', () => {
  it('early warning at 5s on top of the existing 3-2-1', () => {
    expect(restBeepForSecond(5)).toBe('short');
    expect(restBeepForSecond(4)).toBeNull();
    expect(restBeepForSecond(3)).toBe('short');
    expect(restBeepForSecond(2)).toBe('short');
    expect(restBeepForSecond(1)).toBe('long');
    expect(restBeepForSecond(0)).toBeNull();
  });
});

describe('"סט X מתוך Y"', () => {
  it('uses the first incomplete set when present, else the current round', () => {
    expect(setCounterLabel(1, 3, 4)).toBe('סט 2 מתוך 4');
    expect(setCounterLabel(-1, 3, 4)).toBe('סט 3 מתוך 4');
  });
  it('clamps and hides for single-set exercises', () => {
    expect(setCounterLabel(-1, 9, 4)).toBe('סט 4 מתוך 4');
    expect(setCounterLabel(-1, 1, 1)).toBeNull();
  });
});

describe('session-wide mute persists (rest of the session)', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    });
    vi.resetModules();
  });

  it('muting is visible to the beep code and survives a fresh module load (remount / reload)', async () => {
    const first = await import('../player-audio-mute');
    expect(first.isPlayerAudioMuted()).toBe(false);
    first.usePlayerAudioMute.getState().setMuted(true);
    expect(first.isPlayerAudioMuted()).toBe(true);
    expect(sessionStorage.getItem(first.PLAYER_AUDIO_MUTED_KEY)).toBe('1');

    vi.resetModules();
    const second = await import('../player-audio-mute');
    expect(second.isPlayerAudioMuted()).toBe(true); // read back from sessionStorage

    second.usePlayerAudioMute.getState().toggleMuted();
    expect(second.isPlayerAudioMuted()).toBe(false);
    expect(sessionStorage.getItem(second.PLAYER_AUDIO_MUTED_KEY)).toBeNull();
  });
});

// Source-level (this repo's vitest can't render .tsx — see vitest-node-only-no-jsdom).
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('skip rest during tabata', () => {
  const runner = read('../../StrengthRunner.tsx');
  const machine = read('../../hooks/useWorkoutStateMachine.ts');

  it('the tabata RestScreen now receives the skip action', () => {
    const tabataBlock = runner.slice(runner.indexOf("if (sm.blockProtocol?.id === 'tabata') {"), runner.indexOf('<RestingStateView'));
    expect(tabataBlock).toContain('onSkip={sm.skipRest}');
    expect(tabataBlock).not.toContain('onExtend'); // tabata keeps its fixed protocol rest
  });

  it('skipRest runs the same transition the rest timer runs at 0 (moveToNext), incl. the side-rest branch', () => {
    const skip = machine.slice(machine.indexOf('const skipRest = useCallback'), machine.indexOf('const extendRest = useCallback'));
    expect(skip).toContain('tabataSideRestRef.current');
    expect(skip).toContain('moveToNextRef.current()');
    const done = machine.slice(machine.indexOf('const handleRestTimerDone = useCallback'), machine.indexOf('const handlePrepComplete'));
    expect(done).toContain('moveToNextRef.current()');
  });

  it('beeps respect the mute in both the rest timer and the work timer card', () => {
    expect(read('../../hooks/useWorkoutTimers.ts')).toContain('isPlayerAudioMuted()');
    expect(read('../../components/IsometricTimerCard.tsx')).toContain('if (isPlayerAudioMuted()) return;');
  });

  it('the work timer card freezes on the player-level pause (this is what makes tabata pausable)', () => {
    const card = read('../../components/IsometricTimerCard.tsx');
    expect(card).toContain('if (isPaused || externalPaused) {');
    expect(read('../../components/ActiveExerciseView.tsx')).toContain('externalPaused={isPaused}');
  });
});
