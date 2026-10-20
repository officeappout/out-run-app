import { describe, expect, it } from 'vitest';
import { recommendWalkPlan } from '../walkPlan';
import { addOnDays, walkRampLine, walkRecommendationTitle, walkWeekDays, walkWeekSubtitle } from '../walkWeekView';

const plan = recommendWalkPlan({ goal: 'belly', comfort: 'medium', stepGoal: 8000, availableDays: [0, 1, 2, 3, 4, 5], audience: 'general' });
const core = { kind: 'core' as const, minutes: 10, perWeek: 2, labelHe: 'ליבה 10′ ×2 בערב' };

describe('walk week view', () => {
  it('add-on days avoid the long walk', () => {
    expect(addOnDays([0, 1, 3, 4], 2, 4)).toEqual([0, 3]);
    expect(addOnDays([0, 2], 2, 2)).toEqual([0]);
    expect(addOnDays([0, 2, 4], 0, 4)).toEqual([]);
  });
  it('seven rows, walks on the plan days, two core days', () => {
    const rows = walkWeekDays(plan.weeks[0], core);
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.walk).map((r) => r.dow)).toEqual(plan.days);
    expect(rows.filter((r) => r.addOn)).toHaveLength(2);
    expect(rows.find((r) => r.walk?.isLong)?.addOn).toBeNull();
    expect(rows.find((r) => r.walk)?.walk?.subtitle).toMatch(/^קצב מהיר · /);
  });
  it('titles', () => {
    expect(walkRecommendationTitle(plan)).toMatch(/^\d הליכות בשבוע · ~\d+ דק׳$/);
    expect(walkWeekSubtitle(plan, core)).toMatch(/\+ ליבה פעמיים$/);
    expect(walkWeekSubtitle(plan, null)).not.toMatch(/ליבה/);
    expect(walkRampLine(plan)).toMatch(/^שבוע 1: \d+ דק׳ ← שבוע 4: \d+ דק׳$/);
  });
});

import { plannedWalkSteps, plannedWalkTargetHe, walkStepsHint } from '../walkWeekView';

describe('home walk lines', () => {
  it('steps from the saved goal', () => {
    expect(plannedWalkSteps({ goal: { type: 'time', value: 30 } })).toBe(3300);
    expect(plannedWalkSteps({ goal: { type: 'distance', value: 2.7 } })).toBe(3300);
    expect(plannedWalkSteps(null)).toBeNull();
    expect(plannedWalkTargetHe({ goal: { type: 'distance', value: 2.5 } })).toBe('2.5 ק״מ');
  });
  it('closes the ring / adds / nothing', () => {
    expect(walkStepsHint(5600, 8000, 3300)).toMatch(/^ההליכה של היום תסגור את הטבעת/);
    expect(walkStepsHint(1000, 8000, 3300)).toMatch(/^ההליכה של היום תוסיף/);
    expect(walkStepsHint(9000, 8000, 3300)).toBeNull();
  });
});
