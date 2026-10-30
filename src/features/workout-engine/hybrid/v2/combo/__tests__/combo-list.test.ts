import { describe, expect, it } from 'vitest';
import { comboDotIndex, comboSectionMode, comboSkippable, liveIndex } from '../combo-list';

describe('comboSectionMode', () => {
  it('done / skipped blocks collapse, a station ahead stays closed, the rest is open', () => {
    expect(comboSectionMode('run', 'done')).toBe('collapsed');
    expect(comboSectionMode('station', 'skipped')).toBe('collapsed');
    expect(comboSectionMode('station', 'active')).toBe('open');
    expect(comboSectionMode('station', 'not_reached')).toBe('closed');
    expect(comboSectionMode('run', 'not_reached')).toBe('open');
  });
});

describe('liveIndex / comboDotIndex', () => {
  const walkToStation = ['done', 'active', 'not_reached'] as const;
  it('the dot sits on the active block', () => {
    expect(liveIndex(walkToStation)).toBe(1);
    expect(comboDotIndex(walkToStation, null, null)).toBe(1);
  });
  it('all done → the last block; nothing reached → the first', () => {
    expect(liveIndex(['done', 'done'])).toBe(1);
    expect(liveIndex(['not_reached', 'not_reached'])).toBe(0);
    expect(liveIndex([])).toBe(0);
  });
  it('while the list drops on a stage change the dot is still on the block just left, then moves', () => {
    expect(comboDotIndex(walkToStation, 'toStation', 'reveal')).toBe(0);
    expect(comboDotIndex(walkToStation, 'toStation', 'move')).toBe(1);
    expect(comboDotIndex(walkToStation, 'toWalk', 'reveal')).toBe(0);
    expect(comboDotIndex(['active'], 'toWalk', 'reveal')).toBe(0);
  });
  it('the start run never moves the dot backwards', () => {
    expect(comboDotIndex(['active', 'not_reached'], 'start', 'reveal')).toBe(0);
  });
});

describe('comboSkippable', () => {
  it('only while the list is dropping or the dot is moving', () => {
    expect(comboSkippable('reveal')).toBe(true);
    expect(comboSkippable('move')).toBe(true);
    expect(comboSkippable('open')).toBe(false);
    expect(comboSkippable(null)).toBe(false);
  });
});
