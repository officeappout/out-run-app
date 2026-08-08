import { describe, it, expect, beforeEach } from 'vitest';
import { useLegPlanStore } from '../useLegPlanStore';

const ORIGIN = { lat: 32.05, lng: 34.77 };

beforeEach(() => {
  useLegPlanStore.setState({ isComposing: false, origin: null, activity: 'running', legs: [] });
});

describe('useLegPlanStore — startComposing', () => {
  it('sets isComposing/origin/activity and starts with an empty leg list', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'cycling');
    const s = useLegPlanStore.getState();
    expect(s.isComposing).toBe(true);
    expect(s.origin).toEqual(ORIGIN);
    expect(s.activity).toBe('cycling');
    expect(s.legs).toEqual([]);
  });

  it('is a no-op when already composing — preserves the in-progress list instead of restarting it', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'stop 1');
    // Calling startComposing again (e.g. user taps "add stop" a second time) must not wipe the list.
    useLegPlanStore.getState().startComposing({ lat: 99, lng: 99 }, 'walking');
    const s = useLegPlanStore.getState();
    expect(s.legs).toHaveLength(1);
    expect(s.origin).toEqual(ORIGIN); // unchanged
    expect(s.activity).toBe('running'); // unchanged
  });
});

describe('useLegPlanStore — addLeg / removeLeg', () => {
  it('appends legs in call order with unique ids', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');
    useLegPlanStore.getState().addLeg({ lat: 32.07, lng: 34.79 }, 'b');
    const legs = useLegPlanStore.getState().legs;
    expect(legs).toHaveLength(2);
    expect(legs[0].label).toBe('a');
    expect(legs[1].label).toBe('b');
    expect(legs[0].id).not.toBe(legs[1].id);
    expect(legs.every((l) => l.kind === 'to_point')).toBe(true);
  });

  it('removeLeg removes exactly the targeted leg, preserving the rest in order', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');
    useLegPlanStore.getState().addLeg({ lat: 32.07, lng: 34.79 }, 'b');
    useLegPlanStore.getState().addLeg({ lat: 32.08, lng: 34.80 }, 'c');
    const middleId = useLegPlanStore.getState().legs[1].id;
    useLegPlanStore.getState().removeLeg(middleId);
    const labels = useLegPlanStore.getState().legs.map((l) => l.label);
    expect(labels).toEqual(['a', 'c']);
  });

  it('removeLeg on an unknown id is a no-op (no crash)', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');
    useLegPlanStore.getState().removeLeg('does-not-exist');
    expect(useLegPlanStore.getState().legs).toHaveLength(1);
  });
});

describe('useLegPlanStore — reorderLegs', () => {
  it('reorders legs to match the given id order', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');
    useLegPlanStore.getState().addLeg({ lat: 32.07, lng: 34.79 }, 'b');
    useLegPlanStore.getState().addLeg({ lat: 32.08, lng: 34.80 }, 'c');
    const [idA, idB, idC] = useLegPlanStore.getState().legs.map((l) => l.id);

    useLegPlanStore.getState().reorderLegs([idC, idA, idB]);

    expect(useLegPlanStore.getState().legs.map((l) => l.label)).toEqual(['c', 'a', 'b']);
  });

  it('defensively no-ops if the id list does not match the current legs (does not drop legs silently)', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');
    useLegPlanStore.getState().addLeg({ lat: 32.07, lng: 34.79 }, 'b');

    useLegPlanStore.getState().reorderLegs(['bogus-id']);

    expect(useLegPlanStore.getState().legs).toHaveLength(2);
    expect(useLegPlanStore.getState().legs.map((l) => l.label)).toEqual(['a', 'b']);
  });
});

describe('useLegPlanStore — reset', () => {
  it('clears isComposing/origin/legs entirely', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');

    useLegPlanStore.getState().reset();

    const s = useLegPlanStore.getState();
    expect(s.isComposing).toBe(false);
    expect(s.origin).toBeNull();
    expect(s.legs).toEqual([]);
  });

  it('after reset, startComposing works again as a fresh session', () => {
    useLegPlanStore.getState().startComposing(ORIGIN, 'running');
    useLegPlanStore.getState().addLeg({ lat: 32.06, lng: 34.78 }, 'a');
    useLegPlanStore.getState().reset();

    useLegPlanStore.getState().startComposing({ lat: 1, lng: 2 }, 'cycling');
    const s = useLegPlanStore.getState();
    expect(s.isComposing).toBe(true);
    expect(s.origin).toEqual({ lat: 1, lng: 2 });
    expect(s.legs).toEqual([]);
  });
});
