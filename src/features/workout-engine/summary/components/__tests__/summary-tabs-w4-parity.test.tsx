/**
 * i18n wave 4: Hebrew markup of SummaryTabs and the strength row details, recorded from main BEFORE the layout codemod.
 * Afterwards the file may differ only in class names / `dir` attributes (scripts/i18n/wave4-snapshot-proof.ts).
 */
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SummaryTabs from '../../blocks/SummaryTabs';
import ExerciseRowDetails from '../../../players/strength/components/ExerciseRowDetails';

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');

it('summary tabs + exercise row details', async () => {
  const noop = () => {};
  const parts = [
    html(<SummaryTabs tabs={[{ id: 'overview', label: 'סקירה' }, { id: 'aerobic', label: 'אירובי' }, { id: 'strength', label: 'כוח' }]} active="overview" onChange={noop} />),
    html(<ExerciseRowDetails exercise={{ name: 'סקוואט', highlights: ['גב ישר'], muscleGroups: ['רגליים', 'ישבן'], goal: 'חיזוק' }} className="x" />),
  ];
  await expect(parts.join('\n')).toMatchFileSnapshot('./__snapshots__/summary-tabs-w4/tabs-row.html');
});
