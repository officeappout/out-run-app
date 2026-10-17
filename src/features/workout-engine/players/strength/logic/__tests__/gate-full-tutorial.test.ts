import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { isDemoGateView, gateFullTutorial } from '../demo-gate';

/** G5.5 — the demo gate's first-time view plays the FULL narrated tutorial with sound. */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const FULL = { videoId: 'bunny-full-1', provider: 'bunny' as const, thumbnailUrl: 'https://x/t.jpg' };

describe('isDemoGateView — clip running while the player is held paused = the gate', () => {
  it('gate up', () => expect(isDemoGateView(true, false)).toBe(true));
  it('normal pause / find screen (both paused)', () => expect(isDemoGateView(true, true)).toBe(false));
  it('running set / rest', () => {
    expect(isDemoGateView(false, false)).toBe(false);
    expect(isDemoGateView(false, undefined)).toBe(false);
  });
  it('pinned: StrengthRunner still passes the clip/player paused pair', () => {
    expect(src('../../StrengthRunner.tsx')).toContain('videoPaused={gateActive ? false : sm.isPaused}');
  });
});

describe('gateFullTutorial — which video the gate plays', () => {
  it('first-time gate view + a full tutorial → the full tutorial', () => {
    expect(gateFullTutorial(true, FULL)).toBe(FULL);
  });
  it('no full tutorial → null (the preview loop, as today)', () => {
    expect(gateFullTutorial(true, null)).toBeNull();
    expect(gateFullTutorial(true, undefined)).toBeNull();
    expect(gateFullTutorial(true, { videoId: '', provider: 'bunny' })).toBeNull();
  });
  it('non-Bunny tutorials (no inline HLS autoplay) → preview fallback', () => {
    expect(gateFullTutorial(true, { videoId: 'yt12345678a', provider: 'youtube' })).toBeNull();
    expect(gateFullTutorial(true, { videoId: 'x', provider: 'internal' })).toBeNull();
  });
  it('everywhere else (sets, rest, pause, repeats — no gate view) → preview loop', () => {
    expect(gateFullTutorial(isDemoGateView(false, false), FULL)).toBeNull();
    expect(gateFullTutorial(isDemoGateView(true, true), FULL)).toBeNull();
    expect(gateFullTutorial(false, FULL)).toBeNull();
  });
});

describe('wiring', () => {
  it('ActiveExerciseView feeds the gate decision with the per-method-resolved full tutorial', () => {
    const view = src('../../components/ActiveExerciseView.tsx');
    expect(view).toContain('gateFullTutorial(isDemoGateView(isPaused, videoPaused), exerciseFullTutorial)');
    expect(view).toContain('gateFullTutorial={gateTutorial}');
  });
  it('the player swaps the preview for the full tutorial with sound (session mute respected) and hides the CTA', () => {
    const player = src('../../components/ExerciseVideoPlayer.tsx');
    expect(player).toContain('!gateFullTutorial && effectiveVideoUrl');
    expect(player).toContain('startUnmuted={!isPlayerAudioMuted()}');
    expect(player).toContain('!showTutorial && !gateFullTutorial');
    // the preview loop's playback driver re-runs when it remounts after the gate
    expect(player).toMatch(/shouldMuteVideo, showingGateTutorial\]\);/);
  });
  it('tutorial player: unmuted start only on request, muted fallback; default unchanged', () => {
    const tut = src('../../../../../content/exercises/client/components/ExerciseVideoPlayer.tsx');
    expect(tut).toContain('startUnmuted = false');
    expect(tut).toMatch(/if \(!startUnmutedRef\.current\) \{ v\.play\(\)\.catch\(\(\) => \{\}\); return; \}/);
    expect(tut).toMatch(/v\.muted = false;\s*v\.play\(\)\.catch\(\(\) => \{\s*v\.muted = true;/);
  });
  it('StrengthRunner is untouched by this change', () => {
    expect(src('../../StrengthRunner.tsx')).not.toContain('gateFullTutorial');
  });
});
