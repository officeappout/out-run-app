import { describe, expect, it } from 'vitest';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { readLiveFlag } from '../feature-flag-live';
import { aerobicCompletionLabels } from '@/features/workout-engine/services/completion-sync.service';

describe('enable_cycling_fixes_v1', () => {
  const def = FLAG_DEFS.find((d) => d.key === 'enableCyclingFixesV1');
  it('is registered fail-closed, super-admin included (the panel toggle is the one switch)', () => {
    expect(def).toBeDefined();
    expect(def!.firestoreKey).toBe('enable_cycling_fixes_v1');
    expect(def!.defaultValue).toBe(false);
    expect(def!.superAdminValue).toBe(false);
    expect(readLiveFlag('enableCyclingFixesV1')).toBe(false);
  });

  it('history labels: a ride is a run unless ride mode is on (home v2 or the flag)', () => {
    expect(aerobicCompletionLabels('cycling', false)).toEqual({ workoutType: 'running', displayIcon: 'run-fast' });
    expect(aerobicCompletionLabels('cycling', true)).toEqual({ workoutType: 'cycling', displayIcon: 'bike' });
  });
});
