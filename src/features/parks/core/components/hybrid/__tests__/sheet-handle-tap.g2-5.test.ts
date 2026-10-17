import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { nextDetentOnHandleTap, isHandleExpanded, isHandleTap, TAP_SLOP_PX } from '../sheet-handle-tap';

/**
 * Sderot pilot G2.5 — tapping the route-overview drawer's handle / top edge toggles docked ↔ open,
 * in addition to dragging. A tap must not be read as a drag and vice versa; keyboard-accessible.
 */
describe('nextDetentOnHandleTap', () => {
  it('docked (peek) → open (half)', () => {
    expect(nextDetentOnHandleTap('peek')).toBe('half');
  });
  it('open (half / full) → docked (peek)', () => {
    expect(nextDetentOnHandleTap('half')).toBe('peek');
    expect(nextDetentOnHandleTap('full')).toBe('peek');
  });
  it('unknown anchor (treated like the default half) → peek', () => {
    expect(nextDetentOnHandleTap(null)).toBe('peek');
    expect(nextDetentOnHandleTap(undefined)).toBe('peek');
  });
});

describe('isHandleExpanded (aria-expanded)', () => {
  it('peek is collapsed, everything else expanded', () => {
    expect(isHandleExpanded('peek')).toBe(false);
    expect(isHandleExpanded('half')).toBe(true);
    expect(isHandleExpanded('full')).toBe(true);
  });
});

describe('isHandleTap — tap vs drag', () => {
  const at = (x: number, y: number) => ({ x, y });
  it('a still pointer is a tap', () => {
    expect(isHandleTap(false, at(100, 500), at(101, 502))).toBe(true);
  });
  it('travel within the slop is still a tap; beyond it is not', () => {
    expect(isHandleTap(false, at(0, 0), at(0, TAP_SLOP_PX))).toBe(true);
    expect(isHandleTap(false, at(0, 0), at(0, TAP_SLOP_PX + 1))).toBe(false);
  });
  it('framer reported a drag → never a tap, even if the pointer came back to where it started', () => {
    expect(isHandleTap(true, at(100, 500), at(100, 500))).toBe(false);
  });
  it('keyboard activation (no pointerdown) is a tap', () => {
    expect(isHandleTap(false, null, at(0, 0))).toBe(true);
  });
});

describe('HybridOverviewScreen wiring', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../HybridOverviewScreen.tsx', import.meta.url)),
    'utf8',
  );

  it('the handle is a real button with aria-expanded inside the drag grabber (drag still starts there)', () => {
    const grabber = src.match(/onPointerDown=\{\(e\) => dragControls\.start\(e\)\}[\s\S]*?<\/div>/);
    expect(grabber, 'grabber not found').toBeTruthy();
    expect(grabber![0]).toContain('onClick={onHandleClick}');
    expect(grabber![0]).toContain('aria-expanded={isHandleExpanded(currentAnchor)}');
    expect(grabber![0]).toContain('type="button"');
  });

  it('a framer drag marks the gesture so its trailing click does not toggle', () => {
    expect(src).toContain('onDragStart={() => { handleDraggedRef.current = true; springRef.current?.stop(); }}');
  });

  it('the toggle uses the same detent path as a drag (setAnchor + springTo)', () => {
    const fn = src.match(/const onHandleClick = [\s\S]*?\n {2}\};/);
    expect(fn, 'onHandleClick not found').toBeTruthy();
    expect(fn![0]).toContain('nextDetentOnHandleTap(currentAnchor)');
    expect(fn![0]).toContain('setAnchor(target)');
    expect(fn![0]).toContain('springTo(target)');
  });
});
