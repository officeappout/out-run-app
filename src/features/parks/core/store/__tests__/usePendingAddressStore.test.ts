import { describe, it, expect, beforeEach } from 'vitest';
import { usePendingAddressStore } from '../usePendingAddressStore';

beforeEach(() => {
  usePendingAddressStore.setState({ isComposing: false, pending: null });
});

describe('usePendingAddressStore — startComposing', () => {
  it('sets isComposing', () => {
    usePendingAddressStore.getState().startComposing();
    expect(usePendingAddressStore.getState().isComposing).toBe(true);
  });

  it('is a no-op when already composing — preserves any already-set pending value', () => {
    usePendingAddressStore.getState().startComposing();
    usePendingAddressStore.getState().setPending({ lat: 32.05, lng: 34.77, label: 'כתובת א' });
    usePendingAddressStore.getState().startComposing();
    expect(usePendingAddressStore.getState().pending).toEqual({ lat: 32.05, lng: 34.77, label: 'כתובת א' });
  });
});

describe('usePendingAddressStore — setPending', () => {
  it('stores the picked address', () => {
    usePendingAddressStore.getState().startComposing();
    usePendingAddressStore.getState().setPending({ lat: 32.06, lng: 34.78, label: 'רחוב ב' });
    expect(usePendingAddressStore.getState().pending).toEqual({ lat: 32.06, lng: 34.78, label: 'רחוב ב' });
  });

  it('overwrites a previous pending value on a repeat pick ("שנה")', () => {
    usePendingAddressStore.getState().startComposing();
    usePendingAddressStore.getState().setPending({ lat: 32.06, lng: 34.78, label: 'ראשון' });
    usePendingAddressStore.getState().setPending({ lat: 32.07, lng: 34.79, label: 'שני' });
    expect(usePendingAddressStore.getState().pending).toEqual({ lat: 32.07, lng: 34.79, label: 'שני' });
  });

  it('accepts a missing label', () => {
    usePendingAddressStore.getState().setPending({ lat: 32.06, lng: 34.78 });
    expect(usePendingAddressStore.getState().pending).toEqual({ lat: 32.06, lng: 34.78 });
  });
});

describe('usePendingAddressStore — clear', () => {
  it('resets isComposing and pending together', () => {
    usePendingAddressStore.getState().startComposing();
    usePendingAddressStore.getState().setPending({ lat: 32.06, lng: 34.78, label: 'כתובת' });
    usePendingAddressStore.getState().clear();
    const s = usePendingAddressStore.getState();
    expect(s.isComposing).toBe(false);
    expect(s.pending).toBeNull();
  });

  it('after clear, startComposing works again as a fresh pick', () => {
    usePendingAddressStore.getState().startComposing();
    usePendingAddressStore.getState().setPending({ lat: 32.06, lng: 34.78, label: 'כתובת' });
    usePendingAddressStore.getState().clear();
    usePendingAddressStore.getState().startComposing();
    const s = usePendingAddressStore.getState();
    expect(s.isComposing).toBe(true);
    expect(s.pending).toBeNull();
  });
});
