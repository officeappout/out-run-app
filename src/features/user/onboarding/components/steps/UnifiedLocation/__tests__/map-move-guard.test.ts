import { describe, it, expect } from 'vitest';
import { isUserCameraMove } from '../map-move-guard';

describe('isUserCameraMove', () => {
  it('treats events with a DOM originalEvent as user gestures', () => {
    expect(isUserCameraMove({ originalEvent: { type: 'touchend' } })).toBe(true);
    expect(isUserCameraMove({ originalEvent: { type: 'wheel' } })).toBe(true);
  });

  it('treats programmatic moves (fitBounds / flyTo / jumpTo) as not user-initiated', () => {
    expect(isUserCameraMove({})).toBe(false);
    expect(isUserCameraMove({ originalEvent: undefined })).toBe(false);
    expect(isUserCameraMove({ originalEvent: null })).toBe(false);
  });

  it('is safe with a missing event', () => {
    expect(isUserCameraMove(undefined)).toBe(false);
    expect(isUserCameraMove(null)).toBe(false);
  });
});
