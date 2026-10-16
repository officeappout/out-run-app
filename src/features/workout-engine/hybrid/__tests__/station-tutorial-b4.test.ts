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
  it('start CTA with the tapping finger, time/reps chip legend gendered, pause & skip', () => {
    const [start, chips, skip] = stationTutorialSteps('male');
    expect(start).toEqual({ target: COACH_TARGET_START, text: 'כשמוכנים, לוחצים כאן', finger: true });
    expect(chips.target).toBe(COACH_TARGET_CHIPS);
    expect(chips.text).toBe('כל תרגיל מסומן לפי הסוג שלו');
    expect(chips.legend).toEqual([
      { icon: 'time', text: 'זמן: אנחנו סופרים' },
      { icon: 'reps', text: 'חזרות: אתה סופר ולוחץ סיימתי' },
    ]);
    expect(stationTutorialSteps('female')[1].legend?.[1].text).toBe('חזרות: את סופרת ולוחצת סיימתי');
    expect(stationTutorialSteps('other')[1].legend?.[1].text).toBe('חזרות: סופרים ולוחצים סיימתי');
    expect(skip.target).toBe(COACH_TARGET_SKIP);
    // Gender-neutral, identical for everyone.
    for (const gen of ['male', 'female', 'other', null] as const) {
      expect(stationTutorialSteps(gen)[2].text).toBe('בכל רגע אפשר לעצור או לדלג על תרגיל או על כל התחנה');
      expect(stationTutorialSteps(gen)[2].legend).toEqual([
        { icon: 'pause', text: 'עצירה' },
        { icon: 'skip', text: 'דילוג' },
      ]);
    }
  });
  it('no emoji glyphs in any bubble copy — icons are rendered, not typed (design v2 §6)', () => {
    // Misc symbols (\u23F1 \u23F8 \u23ED \u2026) + astral emoji (\uD83D\uDD01 \uD83D\uDC46 \u2026) as surrogate pairs (no `u` flag: es5 target).
    const glyph = /[\u2300-\u23FF\u2600-\u27BF]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;
    for (const gen of ['male', 'female', 'other', null] as const) {
      for (const step of stationTutorialSteps(gen)) {
        expect(step.text).not.toMatch(glyph);
        for (const row of step.legend ?? []) expect(row.text).not.toMatch(glyph);
      }
    }
    const screen = src('../StationWelcomeScreen.tsx');
    expect(screen).toContain('time: { icon: Timer');
    expect(screen).toContain('reps: { icon: Repeat');
    expect(screen).toContain('pause: { icon: Pause');
    expect(screen).toContain('skip: { icon: SkipForward');
  });
  it('no slash forms (/י, /ת, את/ה) in any bubble, any gender', () => {
    for (const gen of ['male', 'female', 'other', null] as const) {
      for (const step of stationTutorialSteps(gen)) {
        expect(step.text).not.toMatch(/[א-ת]\/[א-ת]/);
        for (const row of step.legend ?? []) expect(row.text).not.toMatch(/[א-ת]\/[א-ת]/);
      }
    }
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
