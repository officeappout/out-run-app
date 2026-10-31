/**
 * Per-step timing of a slow signup save (AH7, owner 31.10: "logged only, not shown"). Each
 * `mark(name)` records the ms since the previous mark; `line()` is the compact record
 * ("t=5230;ctx=120;doc=310;sync=4200;ref=600"), sent once through the existing signup telemetry
 * (reportSignupFailure → signup_failures, no PII) under a *_TIMING stage.
 */
import { reportSignupFailure } from '@/lib/reportSignupFailure';
import type { SignupFailureStage } from '@/lib/signupFailureLog';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createStepTimer(clock: () => number = now) {
  const start = clock();
  let last = start;
  const parts: string[] = [];
  return {
    mark(name: string) {
      const t = clock();
      parts.push(`${name}=${Math.round(t - last)}`);
      last = t;
    },
    line(): string {
      return [`t=${Math.round(clock() - start)}`, ...parts].join(';').slice(0, 100);
    },
    report(stage: Extract<SignupFailureStage, 'ASSESSMENT_SAVE_TIMING' | 'HEALTH_SYNC_TIMING'>) {
      reportSignupFailure(stage, this.line());
    },
  };
}
