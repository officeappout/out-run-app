import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  AFTER_PILL_MS,
  DEMO_BEATS,
  DEMO_LOOP_MS,
  FINGER_LEAD_MS,
  INTERACTION_DEBOUNCE_MS,
  buildDemoLoop,
  coachCopy,
  ctaPressOutcome,
  initStripHint,
  stripHintReducer,
  stripHintView,
  type StripHintAction,
  type StripHintInit,
  type StripHintState,
} from '../strip-hint';

const FIRST: StripHintInit = { enabled: true, isFirstCategory: true, reducedMotion: false };
const LATER: StripHintInit = { enabled: true, isFirstCategory: false, reducedMotion: false };

function run(state: StripHintState, ...actions: StripHintAction[]): StripHintState {
  return actions.reduce(stripHintReducer, state);
}

describe('strip hint — first category', () => {
  it('starts with the demo running, the dark intro pill and the end labels', () => {
    const s = initStripHint(FIRST);
    expect(s.mode).toBe('demo');
    expect(s.demoRunning).toBe(true);
    const v = stripHintView(s);
    expect(v.pill).toBe('intro');
    expect(v.showEndLabels).toBe(true);
    expect(v.showDemoFinger).toBe(true);
    expect(v.showStaticFinger).toBe(false);
    expect(v.nudgeActive).toBe(false);
  });

  it('a real press stops the demo for good and switches to the "after" line', () => {
    const s = run(initStripHint(FIRST), { type: 'interact', kind: 'press', at: 1000 });
    expect(s.demoRunning).toBe(false);
    expect(s.pill).toBe('after');
    expect(stripHintView(s).showDemoFinger).toBe(false);
    expect(stripHintView(s).showEndLabels).toBe(true);
    // Nothing brings the demo back.
    const later = run(s, { type: 'afterTimeout' }, { type: 'nudgeStart' }, { type: 'nudgeDone' });
    expect(later.demoRunning).toBe(false);
  });

  it('a scroll gesture also takes over from the demo', () => {
    const s = run(initStripHint(FIRST), { type: 'interact', kind: 'scroll', at: 0 });
    expect(s.demoRunning).toBe(false);
    expect(s.pill).toBe('after');
  });

  it('the "after" line fades on its timer', () => {
    const s = run(initStripHint(FIRST), { type: 'interact', kind: 'press', at: 0 }, { type: 'afterTimeout' });
    expect(s.pill).toBeNull();
    expect(stripHintView(s).showEndLabels).toBe(false);
    expect(AFTER_PILL_MS).toBeGreaterThanOrEqual(3000);
  });

  it('the "after" line fades on the next press — but not on the same touch, nor on scroll ticks', () => {
    const after = run(initStripHint(FIRST), { type: 'interact', kind: 'press', at: 1000 });
    expect(run(after, { type: 'interact', kind: 'press', at: 1000 + INTERACTION_DEBOUNCE_MS - 1 }).pill).toBe('after');
    expect(run(after, { type: 'interact', kind: 'scroll', at: 9000 }).pill).toBe('after');
    expect(run(after, { type: 'interact', kind: 'press', at: 1000 + INTERACTION_DEBOUNCE_MS + 1 }).pill).toBeNull();
  });

  it('the intro pill has no timer — only an interaction ends it', () => {
    const s = run(initStripHint(FIRST), { type: 'afterTimeout' }, { type: 'nudgeDone' });
    expect(s.pill).toBe('intro');
    expect(s.demoRunning).toBe(true);
  });
});

describe('strip hint — other categories', () => {
  it('get the nudge only: no demo, no pill, no labels, no finger', () => {
    const s = initStripHint(LATER);
    expect(s.mode).toBe('nudge');
    expect(s.demoRunning).toBe(false);
    const v = stripHintView(s);
    expect(v.pill).toBeNull();
    expect(v.showEndLabels).toBe(false);
    expect(v.showDemoFinger).toBe(false);
    expect(v.showStaticFinger).toBe(false);
  });

  it('the nudge runs once: pending → running → done', () => {
    let s = initStripHint(LATER);
    expect(stripHintView(s).nudgeActive).toBe(false);
    s = run(s, { type: 'nudgeStart' });
    expect(stripHintView(s).nudgeActive).toBe(true);
    s = run(s, { type: 'nudgeDone' });
    expect(stripHintView(s).nudgeActive).toBe(false);
    s = run(s, { type: 'nudgeStart' });
    expect(stripHintView(s).nudgeActive).toBe(false);
  });

  it('an interaction before it starts cancels the nudge', () => {
    const s = run(initStripHint(LATER), { type: 'interact', kind: 'press', at: 0 }, { type: 'nudgeStart' });
    expect(stripHintView(s).nudgeActive).toBe(false);
    expect(s.pill).toBeNull();
  });
});

describe('strip hint — reduced motion', () => {
  it('first category: static — pill + still finger, no demo', () => {
    const s = initStripHint({ ...FIRST, reducedMotion: true });
    expect(s.mode).toBe('static');
    expect(s.demoRunning).toBe(false);
    const v = stripHintView(s);
    expect(v.pill).toBe('intro');
    expect(v.showStaticFinger).toBe(true);
    expect(v.showDemoFinger).toBe(false);
    // The interaction still switches the line, and the still finger goes away.
    const after = run(s, { type: 'interact', kind: 'press', at: 0 });
    expect(after.pill).toBe('after');
    expect(stripHintView(after).showStaticFinger).toBe(false);
  });

  it('other categories: nothing at all (no nudge)', () => {
    const s = run(initStripHint({ ...LATER, reducedMotion: true }), { type: 'nudgeStart' });
    expect(s.mode).toBe('none');
    const v = stripHintView(s);
    expect(v.nudgeActive).toBe(false);
    expect(v.pill).toBeNull();
    expect(v.showStaticFinger).toBe(false);
  });
});

describe('strip hint — flag off', () => {
  it('does nothing and ignores every action', () => {
    const off = initStripHint({ enabled: false, isFirstCategory: true, reducedMotion: false });
    expect(off.mode).toBe('off');
    const s = run(off, { type: 'interact', kind: 'press', at: 0 }, { type: 'nudgeStart' }, { type: 'afterTimeout' });
    expect(s).toEqual(off);
    const v = stripHintView(s);
    expect(v).toEqual({ pill: null, showEndLabels: false, showDemoFinger: false, showStaticFinger: false, nudgeActive: false });
  });

  it('reset re-initialises (category switch)', () => {
    const after = run(initStripHint(FIRST), { type: 'interact', kind: 'press', at: 0 });
    expect(run(after, { type: 'reset', init: FIRST }).demoRunning).toBe(true);
    expect(run(after, { type: 'reset', init: LATER }).mode).toBe('nudge');
  });
});

describe('demo loop (Q2 timing)', () => {
  it('harder by one, harder by one more, back to the start — inside a ~9 s loop', () => {
    const events = buildDemoLoop(0, 7);
    const selects = events.filter((e) => e.kind === 'select').map((e) => (e.kind === 'select' ? e.index : -1));
    expect(selects).toEqual([1, 2, 0]);
    expect(DEMO_LOOP_MS).toBe(9000);
    for (const e of events) expect(e.at).toBeLessThan(DEMO_LOOP_MS);
    // Sorted in time.
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort((a, b) => a - b));
  });

  it('a finger rides each "harder" move (just before it) but not the return', () => {
    const events = buildDemoLoop(0, 7);
    const fingers = events.filter((e) => e.kind === 'finger');
    expect(fingers).toHaveLength(DEMO_BEATS.filter((b) => b.finger).length);
    expect(fingers).toHaveLength(2);
    for (const f of fingers) {
      const sel = events.find((e) => e.kind === 'select' && e.at === f.at + FINGER_LEAD_MS);
      expect(sel).toBeDefined();
    }
    const back = events.find((e) => e.kind === 'select' && e.index === 0);
    expect(events.some((e) => e.kind === 'finger' && e.at === back!.at - FINGER_LEAD_MS)).toBe(false);
  });

  it('clamps to the last tile on a short strip', () => {
    const selects = buildDemoLoop(0, 2).filter((e) => e.kind === 'select').map((e) => (e.kind === 'select' ? e.index : -1));
    expect(selects).toEqual([1, 1, 0]);
  });
});

describe('CTA tap while the demo runs', () => {
  it('confirms nothing: snaps back to the start tile instead', () => {
    expect(ctaPressOutcome(true, 0)).toEqual({ confirm: false, snapTo: 0 });
  });

  it('stops the demo for good and switches to the "after" line, like a first interaction', () => {
    const s = run(initStripHint(FIRST), { type: 'interact', kind: 'press', at: 500 });
    expect(s.demoRunning).toBe(false);
    expect(s.pill).toBe('after');
    // So the NEXT tap confirms as usual.
    expect(ctaPressOutcome(s.demoRunning, 0)).toEqual({ confirm: true });
  });

  it('confirms as usual when no demo is running (other categories, reduced motion, after takeover)', () => {
    expect(ctaPressOutcome(initStripHint(LATER).demoRunning, 0)).toEqual({ confirm: true });
    expect(ctaPressOutcome(initStripHint({ ...FIRST, reducedMotion: true }).demoRunning, 0)).toEqual({ confirm: true });
  });

  it('VisualSlider wires it: interact + snap back + return before onLevelConfirm', () => {
    const src = readFileSync(path.resolve(__dirname, '../VisualSlider.tsx'), 'utf8');
    const body = src.slice(src.indexOf('const handleConfirm = () => {'), src.indexOf('// ── Derived values'));
    expect(body).toMatch(
      /ctaPressOutcome\(isDemoRunning\(\), 0\);\s*if \(!outcome\.confirm\) \{\s*stripHint\.interact\('press'\);\s*applyDemoSelection\(outcome\.snapTo\);\s*return;/,
    );
    expect(body).not.toMatch(/onLevelConfirm\(steps\[0\]\)/);
  });
});

describe('coach copy', () => {
  it('male / female, verbatim from the brief', () => {
    expect(coachCopy('intro', false)).toEqual({ title: 'גרור את התמונות לצדדים', sub: 'הסרטון מתחלף לתרגיל שבחרת' });
    expect(coachCopy('intro', true)).toEqual({ title: 'גררי את התמונות לצדדים', sub: 'הסרטון מתחלף לתרגיל שבחרת' });
    expect(coachCopy('after', false)).toEqual({ title: 'יפה. עכשיו עצור על הכי קשה שאתה בטוח שתבצע', sub: 'ולחץ למטה' });
    expect(coachCopy('after', true)).toEqual({ title: 'יפה. עכשיו עצרי על הכי קשה שאת בטוחה שתבצעי', sub: 'ולחצי למטה' });
  });
});

// Tripwire (no jsdom in this repo): the demo's selection path in VisualSlider must stay a
// separate path from the user's handleSliderChange — it may never mark the user as having
// chosen (userInteracted lights the CTA), buzz, or touch the tutorial state.
describe('VisualSlider demo path never counts as a choice', () => {
  const src = readFileSync(path.resolve(__dirname, '../VisualSlider.tsx'), 'utf8');
  const start = src.indexOf('const applyDemoSelection = useCallback(');
  const end = src.indexOf('const stripHint = useStripHint(');
  const body = src.slice(start, end);

  it('applyDemoSelection exists and is wired as the hook\'s onDemoSelect', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src).toContain('onDemoSelect: applyDemoSelection');
  });

  it('does not set userInteracted, fire haptics, or go through handleSliderChange', () => {
    expect(body).not.toMatch(/setUserInteracted/);
    expect(body).not.toMatch(/hapticSelection/);
    expect(body).not.toMatch(/handleSliderChange/);
    expect(body).not.toMatch(/setShowTutorial|setShowHint/);
  });

  it('strip settles during the demo are ignored, and the flag-off strip keeps handleSliderChange', () => {
    expect(src).toMatch(/if \(isDemoRunning\(\)\) return;\s*handleSliderChange\(idx\);/);
    expect(src).toContain('onSelect={handleStripSelect}');
    expect(src).toContain('onSelect={handleSliderChange}');
  });
});
