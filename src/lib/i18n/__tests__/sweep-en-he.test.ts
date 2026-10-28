/** Hardcoded-Hebrew sweep (home + player): Hebrew output byte-identical to the literals it replaced, English present. */
import { beforeAll, describe, expect, it } from 'vitest';
import enHome from '@/messages/en/home.json';
import enPlayer from '@/messages/en/player.json';
import { registerCatalog } from '../catalogs';
import { home } from '@/messages/ns/home';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const h = makeT('he', home);
const p = makeT('he', player);
const he = makeT('en', home);
const pe = makeT('en', player);

describe('sweep: Hebrew unchanged', () => {
  it('home', () => {
    expect(h('sweep.weeklyActivity.title')).toBe('יעד שבועי');
    expect(h('sweep.runningStats.title')).toBe('ריצה שבועית');
    expect(h('sweep.runningStats.of', { goal: '10 ק״מ', calories: 250 })).toBe('מתוך 10 ק״מ • 250 קל׳');
    expect(h('sweep.goalRings.cardio')).toBe('אירובי');
    expect(h('sweep.goalRings.strength')).toBe('כוח');
  });
  it('player', () => {
    expect(p('sweep.paused')).toBe('מושהה');
    expect(p('sweep.station.exercises', { n: 1 })).toBe('1 תרגילים');
    expect(p('sweep.station.exercises', { n: 5 })).toBe('5 תרגילים');
    expect(p('sweep.station.startExercise')).toBe('התחל תרגיל');
    expect(p('sweep.segment.pace', { value: '5:30' })).toBe('קצב: 5:30');
    expect(p('sweep.segment.heartRate', { value: '150' })).toBe('דופק: 150');
    expect(p('sweep.planned.workoutTab')).toBe('אימון');
    expect(p('sweep.guided.progressAria')).toBe('התקדמות במסלול');
    expect(p('sweep.guided.progressText', { done: '1.00', total: '5.00' })).toBe('1.00 / 5.00 ק"מ');
    expect(p('sweep.metrics.settingsAria')).toBe('הגדרות אימון');
    expect(p('sweep.milestone.together', { distance: '2 ק״מ' })).toBe('יחד עברתם 2 ק״מ');
  });
});

describe('sweep: English', () => {
  beforeAll(() => {
    registerCatalog('en', 'home', enHome);
    registerCatalog('en', 'player', enPlayer);
  });
  it('has no Hebrew and resolves', () => {
    expect(he('sweep.runningStats.of', { goal: '10 km', calories: 250 })).toBe('of 10 km • 250 kcal');
    expect(pe('sweep.station.exercises', { n: 1 })).toBe('1 exercise');
    expect(pe('sweep.station.exercises', { n: 3 })).toBe('3 exercises');
    expect(pe('sweep.guided.progressText', { done: '1.00', total: '5.00' })).toBe('1.00 / 5.00 km');
    expect(pe('sweep.paused')).toBe('Paused');
  });
});
