import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { isFollowingNow, recenterControlLabel } from '../recenter-control';

/** G2.6 (Sderot pilot) — one recenter/heading control; the centering bug. */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('control state', () => {
  it('following only when the flag is on AND no turn-preview lock', () => {
    expect(isFollowingNow(true, 'follow_user')).toBe(true);
    expect(isFollowingNow(false, 'follow_user')).toBe(false);
    expect(isFollowingNow(true, 'preview_step')).toBe(false); // the old "pill vanished, camera frozen" case
  });
  it('label: recenter when not following, else the current orientation', () => {
    expect(recenterControlLabel(false, 'course')).toBe('מרכז אותי');
    expect(recenterControlLabel(true, 'course')).toBe('כיוון הליכה');
    expect(recenterControlLabel(true, 'north')).toBe('צפון למעלה');
  });
});

describe('centering bug fixes (camera)', () => {
  const cam = src('../../../features/parks/core/hooks/useCameraController.ts');
  it('the follow effect re-runs when the turn-preview lock is released (was not a dep → recenter tap did nothing)', () => {
    expect(cam).toContain('const cameraModeDep = useMapStore((s) => s.cameraMode);');
    expect(cam).toMatch(/recenterTick,\s*\n\s*\/\/ G2\.6[^\n]*\n\s*cameraModeDep,\s*\n\s*headingMode,\s*\n\s*\]\);/);
  });
  it('the 15 s idle re-follow tells the owner (flag stayed false → "מרכז אותי" showed while centered)', () => {
    expect(cam).toContain('onFollowRestoredRef.current?.();');
    expect(src('../layers/FreeRunLayer.tsx')).toContain('onFollowRestored={() => setMapFollowEnabled(true)}');
    expect(src('../MapShell.tsx')).toContain('onFollowRestored={() => setMapFollowEnabled(true)}');
  });
  it('north-up pins the follow bearing to 0; heading-up unchanged', () => {
    expect(cam).toContain("const bearing = headingModeRef.current === 'north'\n        ? 0");
  });
});

describe('one control', () => {
  it("TurnCarousel's own \"חזור למיקומי\" pill is gone; it resyncs when follow resumes from the map control", () => {
    const tc = src('../../../features/parks/core/components/TurnCarousel.tsx');
    expect(tc).not.toContain('חזור למיקומי</');
    expect(tc).toContain("if (cameraModeNow === 'follow_user' && userHasManuallySelected) handleResumeFollow();");
  });
  it('heading mode resets to heading-up at every run start', () => {
    const rp = src('../../../features/workout-engine/players/running/store/useRunningPlayer.ts');
    expect(rp.match(/mapHeadingMode: 'course',/g)?.length).toBe(2);
  });
});
