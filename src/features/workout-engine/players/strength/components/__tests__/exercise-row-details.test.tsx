/**
 * enable_strength_drawer_v1 — session-list row details: the plan exercise →
 * muscles / cues / goal / equipment / tutorial (same derivation as the live
 * card), the collapsed toggle render, and the corner "הסבר" chip.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));

import { toRowDetails } from '../../logic/exercise-row-details';
import ExerciseRowDetails from '../ExerciseRowDetails';
import TutorialChip from '../TutorialChip';

const tutorial = { provider: 'bunny', videoId: 'v1' } as never;

describe('toRowDetails', () => {
  it('first muscle is primary, the rest secondary; highlights win over instructions', () => {
    const d = toRowDetails({
      name: 'מתח',
      muscleGroups: ['back', 'biceps', 'core'],
      highlights: ['גב ישר', 'כתפיים למטה'],
      instructions: ['לא זה'],
      equipment: ['pullup_bar'],
      goal: 'כוח משיכה',
      fullTutorial: tutorial,
    });
    expect(d.primaryMuscle).toBe('back');
    expect(d.secondaryMuscles).toEqual(['biceps', 'core']);
    expect(d.cues).toEqual(['גב ישר', 'כתפיים למטה']);
    expect(d.equipment).toEqual(['pullup_bar']);
    expect(d.goal).toBe('כוח משיכה');
    expect(d.tutorial).toBe(tutorial);
    expect(d.hasAny).toBe(true);
  });
  it('falls back to instructions and description; ignores junk', () => {
    const d = toRowDetails({ name: 'x', instructions: ['צעד אחד'], description: 'תיאור', muscleGroups: 'nope', equipment: [1, ''] });
    expect(d.cues).toEqual(['צעד אחד']);
    expect(d.goal).toBe('תיאור');
    expect(d.primaryMuscle).toBeNull();
    expect(d.equipment).toBeUndefined();
  });
  it('nothing to show → hasAny false (a tutorial without a video id does not count)', () => {
    expect(toRowDetails({ name: 'x', fullTutorial: { videoId: '' } as never }).hasAny).toBe(false);
  });
});

describe('ExerciseRowDetails', () => {
  it('renders the collapsed "פרטי התרגיל" toggle', () => {
    const html = renderToStaticMarkup(<ExerciseRowDetails exercise={{ name: 'מתח', muscleGroups: ['back'] }} />);
    expect(html).toContain('פרטי התרגיל');
    expect(html).toContain('aria-expanded="false"');
  });
  it('renders nothing when the exercise has no details', () => {
    expect(renderToStaticMarkup(<ExerciseRowDetails exercise={{ name: 'מתח' }} />)).toBe('');
  });
});

describe('TutorialChip', () => {
  it('sits at the top corner under the header, inside the top safe area', () => {
    const html = renderToStaticMarkup(<TutorialChip onClick={() => {}} />);
    expect(html).toContain('הסבר');
    expect(html).toContain('env(safe-area-inset-top, 44px)');
    expect(html).not.toContain('bottom-[236px]');
  });
});
