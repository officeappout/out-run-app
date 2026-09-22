/**
 * mock-location-storage — David, 22.09.2026, field-test doc 37.
 * Node env has no `window`/`localStorage` by default — stub a minimal
 * Map-backed localStorage so the real save/load round-trip is exercised,
 * not just the "no window" early-return branches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadMockLocationState,
  saveMockLocationState,
  clearMockLocationState,
  type StoredMockLocationState,
} from '../mock-location-storage';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

describe('mock-location-storage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: fakeLocalStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadMockLocationState returns null when nothing is stored', () => {
    expect(loadMockLocationState()).toBeNull();
  });

  it('round-trips a real override (city preset shape)', () => {
    const state: StoredMockLocationState = {
      isMockEnabled: true,
      mockLocation: { lat: 31.525, lng: 34.5955 },
      selectedCity: 'שדרות',
    };
    saveMockLocationState(state);
    expect(loadMockLocationState()).toEqual(state);
  });

  it('round-trips a manual lat/lng override (no city name)', () => {
    const state: StoredMockLocationState = {
      isMockEnabled: true,
      mockLocation: { lat: 31.1, lng: 34.2 },
      selectedCity: null,
    };
    saveMockLocationState(state);
    expect(loadMockLocationState()).toEqual(state);
  });

  it('round-trips the disabled state', () => {
    const state: StoredMockLocationState = { isMockEnabled: false, mockLocation: null, selectedCity: null };
    saveMockLocationState(state);
    expect(loadMockLocationState()).toEqual(state);
  });

  it('clearMockLocationState removes the stored value entirely', () => {
    saveMockLocationState({ isMockEnabled: true, mockLocation: { lat: 1, lng: 2 }, selectedCity: 'x' });
    clearMockLocationState();
    expect(loadMockLocationState()).toBeNull();
  });

  it('a corrupt/malformed stored value is treated as absent, not thrown', () => {
    (window as unknown as { localStorage: ReturnType<typeof fakeLocalStorage> }).localStorage.setItem(
      'dev_mock_location_state',
      '{not valid json',
    );
    expect(loadMockLocationState()).toBeNull();
  });

  it('a value missing required fields is rejected, not returned partially', () => {
    (window as unknown as { localStorage: ReturnType<typeof fakeLocalStorage> }).localStorage.setItem(
      'dev_mock_location_state',
      JSON.stringify({ isMockEnabled: true }), // missing mockLocation/selectedCity
    );
    expect(loadMockLocationState()).toBeNull();
  });

  it('no window (server / not yet hydrated) never throws — returns null / no-ops', () => {
    vi.unstubAllGlobals();
    expect(loadMockLocationState()).toBeNull();
    expect(() => saveMockLocationState({ isMockEnabled: true, mockLocation: null, selectedCity: null })).not.toThrow();
    expect(() => clearMockLocationState()).not.toThrow();
  });
});
