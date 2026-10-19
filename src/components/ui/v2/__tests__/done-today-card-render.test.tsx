import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import DoneTodayCard from '@/features/home/components/DoneTodayCard';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';

const cards: TodayActivityCardData[] = [
  { key: 'run', category: 'cardio', title: 'ריצה קלה', minutes: 35, streak: 1, workoutType: 'running' },
  { key: 'str', category: 'strength', title: 'כל הגוף', minutes: 42, streak: 1, workoutType: 'strength' },
];
const workouts = [{ id: 'run', distance: 5.2 }, { id: 'str', setsCompleted: 18 }];

const render = (v2: boolean, onTap?: () => void) =>
  renderToStaticMarkup(
    <HomeV2Context.Provider value={v2}>
      <DoneTodayCard cards={cards} workouts={workouts} onCardTap={onTap} />
    </HomeV2Context.Provider>,
  );

describe('DoneTodayCard (compact)', () => {
  it('renders nothing with the flag off', () => expect(render(false)).toBe(''));

  it('one compact done row per workout, with its meta and a check', () => {
    const html = render(true, () => {});
    expect(html.match(/data-v2-done-row/g)).toHaveLength(2);
    expect(html).toContain('ריצה קלה');
    expect(html).toContain('35 דק׳ · 5.2 ק״מ');
    expect(html).toContain('42 דק׳ · 18 סטים');
    expect(html.match(/aria-label="בוצע"/g)).toHaveLength(2);
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it('no stat tiles / XP / streak / next-planned any more', () => {
    const html = render(true);
    expect(html).not.toContain('XP');
    expect(html).not.toContain('ברצף');
    expect(html).not.toContain('האימון הבא');
    expect(html).not.toContain('<button');
  });
});
