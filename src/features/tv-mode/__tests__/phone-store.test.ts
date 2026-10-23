import { beforeEach, describe, expect, it } from 'vitest';
import { clearConnection, readConnection, saveConnection, useTvPhoneStore } from '../phone/phone-store';
import { workoutInfoFrom } from '../phone/workout-info';

const s = () => useTvPhoneStore.getState();

beforeEach(() => {
  s().reset();
  const mem = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

describe('phone store', () => {
  it('pair → connected as host / participant → hide → reset', () => {
    const pending = { info: { title: 't', kind: 'strength' as const, durationMin: 30, exerciseCount: 4 }, onStart: () => {} };
    s().openPair(pending);
    expect(s().view).toBe('pair');
    s().setConnected('482913', 'host');
    expect(s()).toMatchObject({ view: 'host', role: 'host', code: '482913' });
    s().hide();
    expect(s().view).toBe('none');
    expect(s().code).toBe('482913'); // still connected, only the panel is gone
    s().reset();
    expect(s()).toMatchObject({ view: 'none', code: null, role: null, pending: null });
    s().setConnected('111111', 'participant');
    expect(s().view).toBe('joined');
  });
  it('closing the connect screen without a connection forgets everything; with one it goes back', () => {
    s().openPair(null, '482913');
    expect(s().code).toBe('482913');
    s().closePair();
    expect(s()).toMatchObject({ view: 'none', code: null });
    s().setConnected('482913', 'host');
    s().openPair(null);
    s().closePair();
    expect(s().view).toBe('host');
  });
  it('"phone only" is reset by a fresh connection', () => {
    s().setPhoneOnly(true);
    s().setConnected('482913', 'host');
    expect(s().phoneOnly).toBe(false);
  });
  it('the stored connection survives a reload and ignores garbage', () => {
    saveConnection('482913', 'host');
    expect(readConnection()).toEqual({ code: '482913', role: 'host' });
    clearConnection();
    expect(readConnection()).toBeNull();
    sessionStorage.setItem('tv:phone', '{"code":5,"role":"x"}');
    expect(readConnection()).toBeNull();
  });
  it('workout info from a generated workout', () => {
    expect(workoutInfoFrom({ title: ' מתח ', estimatedDuration: 34.6, exercises: [1, 2, 3] })).toEqual({ title: 'מתח', kind: 'strength', durationMin: 35, exerciseCount: 3 });
    expect(workoutInfoFrom({})).toEqual({ title: '', kind: 'strength', durationMin: 0, exerciseCount: 0 });
  });
});
