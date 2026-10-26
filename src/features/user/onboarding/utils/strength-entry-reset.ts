/**
 * The cleanup every strength-track visitor needs before any strength content renders. Moved verbatim
 * out of program-path/page.tsx's mount effect so the strength questionnaire v3 entry (which replaces
 * that screen's content under enable_strength_quiz_v3) runs exactly the same cleanup.
 */
import { clearStaleMiniAssessmentState } from '../services/mini-domain-assessment';

export function resetStaleStrengthEntryState(logTag = '[ProgramPath]'): void {
  if (typeof window === 'undefined') return;
  // A running-questionnaire attempt earlier in this same tab (abandoned,
  // or a track switch) can leave real answers in
  // onboarding_running_answers: that key is never cleared anywhere else
  // (confirmed 04.09.2026 investigation) and only needs goalPath +
  // targetDistance to read as "completed" (isRunningBranchCompleted).
  // Left alone, a later strength completion in this tab would silently
  // also run the running bridge and flip primaryTrack/dashboardMode to
  // 'run'. This is the one place every strength-track visitor passes
  // through before any strength content renders: clear it here so a
  // stale attempt can't leak into an unrelated completion.
  if (sessionStorage.getItem('onboarding_running_answers')) {
    sessionStorage.removeItem('onboarding_running_answers');
    console.log(`${logTag} Cleared stale onboarding_running_answers: entering the strength path.`);
  }
  // Pilot B1 / Q4: the full questionnaire starts here, so an abandoned mini top-up
  // must not turn this run into a single-domain (push) write.
  if (clearStaleMiniAssessmentState()) {
    console.log(`${logTag} Cleared stale mini assessment flags: entering the full strength questionnaire.`);
  }
}
