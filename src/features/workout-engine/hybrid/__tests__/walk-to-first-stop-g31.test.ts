import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolveWalkUiState, nextArmed, walkingLine } from '../hybrid-walk-state';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** G3.1 (Sderot pilot) — walk-to-first-stop, behind `enable_walk_to_first_stop`. */

const base = { phase: 'aerobic', isFinalLeg: false, hasNextStation: true, withinRadius: false, armed: false };

describe('walk state', () => {
  it('starting INSIDE the radius (park at the drop-in point) → walking card, NOT the big CTA', () => {
    expect(resolveWalkUiState({ ...base, withinRadius: true, armed: false })).toBe('walking');
  });
  it('walking in from outside the radius → the big CTA', () => {
    let armed = nextArmed(false, 300, false); // first fix 300 m out
    expect(armed).toBe(true);
    armed = nextArmed(armed, 40, true);
    expect(resolveWalkUiState({ ...base, withinRadius: true, armed })).toBe('approach');
  });
  it('a fix inside the radius never arms; no fix / no coordinates never arms', () => {
    expect(nextArmed(false, 30, true)).toBe(false);
    expect(nextArmed(false, null, false)).toBe(false);
  });
  it('outside the radius → walking; final leg → final; station phase → none', () => {
    expect(resolveWalkUiState({ ...base, armed: true })).toBe('walking');
    expect(resolveWalkUiState({ ...base, isFinalLeg: true })).toBe('final');
    expect(resolveWalkUiState({ ...base, phase: 'station' })).toBe('none');
  });
  it('a next station without coordinates (full-park) still gets the walking card (manual "הגעתי")', () => {
    expect(resolveWalkUiState({ ...base, hasNextStation: true, withinRadius: false, armed: false })).toBe('walking');
  });
});

describe('walking line (gendered, live distance)', () => {
  it('first station', () => {
    expect(walkingLine('male', 1, 350)).toBe('התחל ללכת · בעוד 350 מ׳ תחנה ראשונה');
    expect(walkingLine('female', 1, 350)).toBe('התחילי ללכת · בעוד 350 מ׳ תחנה ראשונה');
    expect(walkingLine('other', 1, 350)).toBe('מתחילים ללכת · בעוד 350 מ׳ תחנה ראשונה');
  });
  it('every later stop', () => {
    expect(walkingLine('male', 2, 1200)).toBe('המשך ללכת · בעוד 1.2 ק"מ התחנה הבאה');
    expect(walkingLine('female', 3, 80)).toBe('המשיכי ללכת · בעוד 80 מ׳ התחנה הבאה');
  });
  it('no fix yet → no distance', () => {
    expect(walkingLine('male', 1, null)).toBe('התחל ללכת · לתחנה הראשונה');
  });
  it('no slash forms', () => {
    for (const gen of ['male', 'female', 'other', null] as const) {
      for (const n of [1, 2]) expect(walkingLine(gen, n, 100)).not.toMatch(/[א-ת]\/[א-ת]/);
    }
  });
});

describe('flag + wiring', () => {
  it('fail-closed flag', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_walk_to_first_stop');
    expect(def).toMatchObject({ key: 'enableWalkToFirstStop', defaultValue: false });
    const admin = readFileSync(fileURLToPath(new URL('../../../../app/admin/system-settings/page.tsx', import.meta.url)), 'utf8');
    expect(admin).toContain("key: 'enable_walk_to_first_stop'");
    expect(admin).toContain('enable_walk_to_first_stop: boolean;');
  });
  it('flag off → `approaching` is exactly the old proximity check; the intro is untouched', () => {
    const layer = readFileSync(fileURLToPath(new URL('../HybridStationLayer.tsx', import.meta.url)), 'utf8');
    expect(layer).toContain('const approaching = walkFlag ? walkUi === \'approach\' : withinApproachRadius;');
    expect(layer).toContain("if (phase === 'aerobic' && (isFinalLeg || approaching)) {");
    expect(layer).toContain('if (walkFlag) return;'); // intro suppressed only when on
    expect(layer).toContain("if (walkFlag && walkUi === 'walking') {");
    expect(layer).toContain('onClick={() => arrive()}');
  });
  it('the store exposes the next station number for every leg', () => {
    const store = readFileSync(fileURLToPath(new URL('../useHybridRun.ts', import.meta.url)), 'utf8');
    expect(store.match(/nextStationNumber: computeNextStationNumber\(controllerRef\.getState\(\)\),/g)?.length).toBe(3);
  });
});
