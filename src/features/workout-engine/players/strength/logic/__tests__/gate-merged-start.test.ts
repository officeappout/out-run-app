import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { isDemoGateView, gateDemoAudible } from '../demo-gate';
import { armGateAudioOnWelcomeTap, isGateAudioArmed, useGateAudio } from '../gate-audio';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** G6.1 — guided "merged start": the welcome tap arms the demo gate's sound. */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

beforeEach(() => useGateAudio.setState({ armed: false }));

describe('isDemoGateView — the gate is the only state with the clip running while the player is paused', () => {
  it('gate up: player held paused, clip playing', () => {
    expect(isDemoGateView(true, false)).toBe(true);
  });
  it('normal pause / find screen: both paused → not the gate', () => {
    expect(isDemoGateView(true, true)).toBe(false);
  });
  it('running set / no videoPaused passed → not the gate', () => {
    expect(isDemoGateView(false, false)).toBe(false);
    expect(isDemoGateView(false, undefined)).toBe(false);
    expect(isDemoGateView(true, undefined)).toBe(false);
  });
  it('pinned: StrengthRunner still passes the clip state this relies on', () => {
    const runner = src('../../StrengthRunner.tsx');
    expect(runner).toContain('videoPaused={gateActive ? false : sm.isPaused}');
  });
});

describe('flag OFF → today exactly', () => {
  it('flag is fail-closed (default false, super-admin false)', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_guided_merged_start');
    expect(def).toBeDefined();
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(false);
  });
  it('welcome tap with the flag off leaves the gate muted', () => {
    armGateAudioOnWelcomeTap(false);
    expect(isGateAudioArmed()).toBe(false);
    expect(gateDemoAudible(isDemoGateView(true, false), isGateAudioArmed())).toBe(false);
  });
  it('turning the flag off disarms at the next welcome tap', () => {
    armGateAudioOnWelcomeTap(true);
    armGateAudioOnWelcomeTap(false);
    expect(isGateAudioArmed()).toBe(false);
  });
  it('never armed without a welcome tap (fast mode never has one)', () => {
    expect(gateDemoAudible(true, isGateAudioArmed())).toBe(false);
  });
});

describe('flag ON → the gate opens with sound, nothing else changes', () => {
  it('welcome tap arms → the gate view is audible', () => {
    armGateAudioOnWelcomeTap(true);
    expect(gateDemoAudible(isDemoGateView(true, false), isGateAudioArmed())).toBe(true);
  });
  it('sets / rest / a normal pause stay on the muted loop', () => {
    armGateAudioOnWelcomeTap(true);
    expect(gateDemoAudible(isDemoGateView(false, false), true)).toBe(false);
    expect(gateDemoAudible(isDemoGateView(true, true), true)).toBe(false);
  });
});

describe('wiring', () => {
  it('HybridStationLayer arms on the welcome tap from the flag, before leaving the welcome screen', () => {
    const layer = src('../../../../hybrid/HybridStationLayer.tsx');
    const i = layer.indexOf('armGateAudioOnWelcomeTap(flags.enableGuidedMergedStart)');
    expect(i).toBeGreaterThan(-1);
    expect(layer.indexOf('setWelcomeDoneFor(stationContext.stationNumber)', i)).toBeGreaterThan(i);
  });
  it('ActiveExerciseView passes the audible decision to the player; the player honours session mute', () => {
    const view = src('../../components/ActiveExerciseView.tsx');
    expect(view).toContain('playWithSound={gateAudible}');
    const player = src('../../components/ExerciseVideoPlayer.tsx');
    expect(player).toMatch(/if \(!playWithSound\) return;[\s\S]*v\.muted = isPlayerAudioMuted\(\);/);
  });
  it('the set still starts only on the gate tap — StrengthRunner is untouched by this change', () => {
    const runner = src('../../StrengthRunner.tsx');
    expect(runner).not.toContain('gate-audio');
    expect(runner).toContain('onStart={handleGateStart}');
  });
});
