import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  COACH_TARGET_CHIPS, COACH_TARGET_SKIP, COACH_TARGET_START,
  shouldShowStationTutorial, stationTutorialSeenKey, stationTutorialSteps,
} from '../station-tutorial';

/** PR-B4 — first-time station tutorial (3 coach-marks over the guided welcome screen). */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('shown once per user', () => {
  it('shows until the seen flag exists, then never again', () => {
    expect(shouldShowStationTutorial(true, null)).toBe(true);
    expect(shouldShowStationTutorial(true, 'done')).toBe(false);
    expect(shouldShowStationTutorial(true, 'skip')).toBe(false);
  });
  it('the flag is per user and lives in onboardingPrefs (survives a hard close)', () => {
    expect(stationTutorialSeenKey('u1')).not.toBe(stationTutorialSeenKey('u2'));
    const screen = src('../StationWelcomeScreen.tsx');
    expect(screen).toContain("import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';");
    expect(screen).toContain('getOnboardingPrefAsync(stationTutorialSeenKey(uid))');
    expect(screen).toContain('setOnboardingPref(stationTutorialSeenKey(uid), reason)');
    expect(src('../HybridStationLayer.tsx')).toContain('uid={profile?.id}');
  });
});

describe('skip works', () => {
  it('"דלג" is rendered on every step (outside the step branch) and finishes with "skip"', () => {
    const cm = src('../../../../components/ui/CoachMarks.tsx');
    expect(cm).toContain("skipLabel = 'דלג'");
    expect(cm).toContain("onClick={() => onFinish('skip')}");
    // the skip button is not inside any step-conditional block
    const skipBlock = cm.slice(cm.lastIndexOf('<button'), cm.lastIndexOf('</button>'));
    expect(skipBlock).toContain("onFinish('skip')");
  });
  it('skipping records the seen flag, same as finishing', () => {
    const screen = src('../StationWelcomeScreen.tsx');
    const finish = screen.slice(screen.indexOf('const finishTutorial'), screen.indexOf('const rows'));
    expect(finish).toContain('setOnboardingPref(stationTutorialSeenKey(uid), reason)');
    expect(finish).not.toContain("reason === 'done'");
  });
});

describe('guided only', () => {
  it('never in fast mode', () => {
    expect(shouldShowStationTutorial(false, null)).toBe(false);
  });
  it('only the guided welcome screen hosts it (the welcome screen itself is guided-only)', () => {
    const layer = src('../HybridStationLayer.tsx');
    expect(layer).toContain('guided && stationContext && welcomeDoneFor !== stationContext.stationNumber ? (');
    expect(layer).toContain('guided={guided}');
    expect(src('../StationWelcomeScreen.tsx')).toContain('if (!guided) { setShowTutorial(false); return; }');
  });
});

describe('the three bubbles', () => {
  it('start CTA with the tapping finger, ⏱/🔁 chips gendered, pause & skip', () => {
    const [start, chips, skip] = stationTutorialSteps('male');
    expect(start).toEqual({ target: COACH_TARGET_START, text: 'כשמוכנים, לוחצים כאן', finger: true });
    expect(chips.target).toBe(COACH_TARGET_CHIPS);
    expect(chips.text).toBe('⏱ = על זמן, אנחנו סופרים · 🔁 = על חזרות, אתה סופר ולוחץ סיימתי');
    expect(stationTutorialSteps('female')[1].text).toBe('⏱ = על זמן, אנחנו סופרים · 🔁 = על חזרות, את סופרת ולוחצת סיימתי');
    expect(stationTutorialSteps('other')[1].text).toContain('את/ה סופר/ת ולוחץ/ת סיימתי');
    expect(skip.target).toBe(COACH_TARGET_SKIP);
    expect(skip.text).toContain('⏸');
    expect(skip.text).toContain('⏭');
  });
  it('every target exists on screen', () => {
    const screen = src('../StationWelcomeScreen.tsx');
    expect(screen).toContain('data-coach={COACH_TARGET_START}');
    expect(screen).toContain('data-coach={idx === 0 ? COACH_TARGET_CHIPS : undefined}');
    expect(src('../HybridStationLayer.tsx')).toContain('data-coach={COACH_TARGET_SKIP}');
  });
  it('the finger is pure CSS (keyframes), no image/lottie', () => {
    const cm = src('../../../../components/ui/CoachMarks.tsx');
    expect(cm).toContain('@keyframes coachTap');
    expect(cm).not.toMatch(/lottie|\.gif|\.json/);
  });
});
