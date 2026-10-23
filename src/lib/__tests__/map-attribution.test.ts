import { describe, it, expect } from 'vitest';
import { attributionControlStyle, ATTRIBUTION_PANEL_LIFT_PX } from '../map-attribution';

describe('attributionControlStyle', () => {
  it('does not lift when no bottom panel is shown', () => {
    expect(attributionControlStyle(false)).toEqual({ marginBottom: 0 });
  });
  it('lifts above the bottom panel when shown', () => {
    expect(attributionControlStyle(true)).toEqual({ marginBottom: ATTRIBUTION_PANEL_LIFT_PX });
  });
});
