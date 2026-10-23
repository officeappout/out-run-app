import { describe, expect, it } from 'vitest';
import { applyCommand, clampVolume, INITIAL_LOCAL, nextCommand } from '../core/commands';

describe('applyCommand', () => {
  it('applies a volume command once per seq', () => {
    const s1 = applyCommand(INITIAL_LOCAL, { seq: 1, type: 'volume', value: 0.4 });
    expect(s1).toMatchObject({ volume: 0.4, lastSeq: 1, muted: false });
    // the same snapshot delivered again, or an older one, changes nothing
    expect(applyCommand(s1, { seq: 1, type: 'volume', value: 0.9 })).toBe(s1);
    expect(applyCommand(s1, { seq: 0, type: 'volume', value: 0.9 })).toBe(s1);
  });
  it('clamps and survives garbage values', () => {
    expect(applyCommand(INITIAL_LOCAL, { seq: 1, type: 'volume', value: 7 }).volume).toBe(1);
    expect(applyCommand(INITIAL_LOCAL, { seq: 1, type: 'volume', value: -1 }).volume).toBe(0);
    expect(clampVolume(NaN)).toBe(1);
  });
  it('volume un-mutes, mute toggles, end ends', () => {
    let s = applyCommand(INITIAL_LOCAL, { seq: 1, type: 'mute', value: 1 });
    expect(s.muted).toBe(true);
    s = applyCommand(s, { seq: 2, type: 'volume', value: 0.5 });
    expect(s.muted).toBe(false);
    s = applyCommand(s, { seq: 3, type: 'mute', value: 0 });
    expect(s.muted).toBe(false);
    s = applyCommand(s, { seq: 4, type: 'end' });
    expect(s.ended).toBe(true);
    expect(s.lastSeq).toBe(4);
  });
  it('ignores null, non-integer seq and unknown types without advancing', () => {
    expect(applyCommand(INITIAL_LOCAL, null)).toBe(INITIAL_LOCAL);
    expect(applyCommand(INITIAL_LOCAL, { seq: 1.5, type: 'volume', value: 0.2 })).toBe(INITIAL_LOCAL);
    const s = applyCommand(INITIAL_LOCAL, { seq: 2, type: 'wat' as never });
    expect(s.volume).toBe(1);
    expect(s.lastSeq).toBe(2);
  });
  it('nextCommand increases seq and omits an undefined value', () => {
    const a = nextCommand(null, 'end');
    expect(a).toEqual({ seq: 1, type: 'end' });
    expect(nextCommand(a, 'volume', 0.3)).toEqual({ seq: 2, type: 'volume', value: 0.3 });
  });
});
