import { describe, it, expect } from 'vitest';
import { isLayerOn, withLayerVisibility } from '../layer-visibility';

describe('withLayerVisibility (layers panel, enable_map_polish_v1)', () => {
  it('visible → the very same layout (default map unchanged)', () => {
    const layout = { 'icon-image': 'pin' };
    expect(withLayerVisibility(layout, true)).toBe(layout);
    expect(withLayerVisibility(undefined, true)).toBeUndefined();
  });
  it('hidden → visibility none, the layer id stays (click queries keep working)', () => {
    expect(withLayerVisibility({ 'icon-image': 'pin' }, false)).toEqual({ 'icon-image': 'pin', visibility: 'none' });
    expect(withLayerVisibility(undefined, false)).toEqual({ visibility: 'none' });
  });
});

describe('isLayerOn', () => {
  it('reads the panel list; no list → on', () => {
    expect(isLayerOn(['parks', 'routes', 'gym'], 'parks')).toBe(true);
    expect(isLayerOn(['routes', 'gym'], 'parks')).toBe(false);
    expect(isLayerOn(undefined, 'routes')).toBe(true);
  });
});
