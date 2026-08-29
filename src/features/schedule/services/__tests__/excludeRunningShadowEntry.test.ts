import { describe, it, expect } from 'vitest';
import { excludeRunningShadowEntry } from '../excludeRunningShadowEntry';

describe('excludeRunningShadowEntry', () => {
  it('removes the entry whose programIds[0] matches the running program id', () => {
    const entries = [
      { id: 'strength', programIds: ['FULL_BODY'] },
      { id: 'shadow', programIds: ['running_template_xyz'] },
    ];
    const result = excludeRunningShadowEntry(entries, 'running_template_xyz');
    expect(result).toEqual([{ id: 'strength', programIds: ['FULL_BODY'] }]);
  });

  it('leaves everything untouched when runningProgramId is undefined (no active running program)', () => {
    const entries = [{ id: 'a', programIds: ['FULL_BODY'] }];
    expect(excludeRunningShadowEntry(entries, undefined)).toEqual(entries);
  });

  it('leaves everything untouched when nothing matches', () => {
    const entries = [{ id: 'a', programIds: ['FULL_BODY'] }, { id: 'b', programIds: ['PLANCHE'] }];
    expect(excludeRunningShadowEntry(entries, 'some_other_running_id')).toEqual(entries);
  });

  it('does not touch community entries just because they lack programIds', () => {
    const entries = [{ id: 'community', programIds: [] }];
    expect(excludeRunningShadowEntry(entries, 'running_template_xyz')).toEqual(entries);
  });

  it('empty entries array returns empty', () => {
    expect(excludeRunningShadowEntry([], 'running_template_xyz')).toEqual([]);
  });
});
