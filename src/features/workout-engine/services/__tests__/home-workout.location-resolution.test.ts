import { describe, it, expect } from 'vitest';
import { resolveEffectivePipelineLocation } from '../home-workout.service';

describe('resolveEffectivePipelineLocation — "Ultimate Park Force" location decision', () => {
  it('BEFORE (documented bug): the home caller\'s `location` was read only for a log message and ' +
     'never applied — a request for "home" was silently force-reset to "park" every time. ' +
     'AFTER: an explicit `location` is honored, exactly like `testLocation` already was.', () => {
    expect(resolveEffectivePipelineLocation(undefined, 'home')).toBe('home');
    expect(resolveEffectivePipelineLocation(undefined, 'street')).toBe('street');
  });

  it('testLocation (QA/Master-Simulator bypass) still wins when both are set — unchanged priority', () => {
    expect(resolveEffectivePipelineLocation('office', 'home')).toBe('office');
  });

  it('testLocation alone behaves exactly as before (WorkoutBuilderSheet — the manual builder)', () => {
    expect(resolveEffectivePipelineLocation('gym', undefined)).toBe('gym');
  });

  it('neither provided → defaults to "park" — the ONLY default, unchanged by this fix', () => {
    expect(resolveEffectivePipelineLocation(undefined, undefined)).toBe('park');
  });

  it('an explicit "park" location is honored the same as any other explicit value (not special-cased)', () => {
    expect(resolveEffectivePipelineLocation(undefined, 'park')).toBe('park');
  });
});
