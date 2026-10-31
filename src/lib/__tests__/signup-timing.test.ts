import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: vi.fn() }));

import { createStepTimer } from '../signupTiming';
import { reportSignupFailure } from '@/lib/reportSignupFailure';
import { SIGNUP_FAILURE_STAGES } from '../signupFailureLog';

describe('createStepTimer (AH7)', () => {
  it('records ms per step and the total, compact and capped at 100 chars', () => {
    const times = [0, 120, 430, 4630, 5230, 5230];
    let i = 0;
    const timer = createStepTimer(() => times[i++]);
    timer.mark('ctx');
    timer.mark('doc');
    timer.mark('sync');
    timer.mark('ref');
    expect(timer.line()).toBe('t=5230;ctx=120;doc=310;sync=4200;ref=600');
  });
  it('reports through the signup telemetry under a timing stage that the server accepts', () => {
    const timer = createStepTimer(() => 0);
    timer.report('ASSESSMENT_SAVE_TIMING');
    expect(reportSignupFailure).toHaveBeenCalledWith('ASSESSMENT_SAVE_TIMING', 't=0');
    expect(SIGNUP_FAILURE_STAGES).toEqual(expect.arrayContaining(['ASSESSMENT_SAVE_TIMING', 'HEALTH_SYNC_TIMING']));
  });
});
