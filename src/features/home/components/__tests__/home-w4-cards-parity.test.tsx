/**
 * i18n wave 4 (Home layout -> logical classes): Hebrew markup of the Home cards that no earlier parity test renders.
 * Recorded from main BEFORE the codemod. After it the files differ ONLY in class names / `dir` attributes / the
 * `ltr:-scale-x-100` mirror class (proved by scripts/i18n/wave4-snapshot-proof.ts), never in structure or text.
 */
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => {
  const router = { push() {}, replace() {}, prefetch() {}, back() {} };
  return { useRouter: () => router, usePathname: () => '/home' };
});

import { CompactMetricTile } from '../widgets/CompactMetricTile';
import { SideBySideRow } from '../rows/SideBySideRow';
import { PlaceholderRow } from '../PlaceholderRow';
import { FloorsWidget } from '../widgets/FloorsWidget';
import { StepsWidget } from '../widgets/StepsWidget';
import StatsWidgets from '../StatsWidgets';
import GuestHeroCard from '../GuestHeroCard';

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/home-w4-cards/${name}.html`;

it('metric tile + side-by-side row + placeholder', async () => {
  const parts = [
    html(<CompactMetricTile percentage={60} icon={<span>i</span>} label="צעדים" value="6,000" unit="צעדים" />),
    html(<CompactMetricTile icon={<span>i</span>} label="קלוריות" value="320" onClick={() => {}} ariaLabel="קלוריות" />),
    html(<SideBySideRow right={<div>ימין</div>} left={<div>שמאל</div>} />),
    html(<PlaceholderRow label="בקרוב" />),
  ];
  await expect(parts.join('\n')).toMatchFileSnapshot(snap('tiles'));
});

it('floors + steps widgets (below baseline / reached)', async () => {
  const parts = [
    html(<FloorsWidget floors={1} goal={3} />),
    html(<FloorsWidget floors={3} goal={3} />),
    html(<StepsWidget steps={1200} goal={8000} calories={60} />),
    html(<StepsWidget steps={8200} goal={8000} calories={410} />),
  ];
  await expect(parts.join('\n')).toMatchFileSnapshot(snap('floors-steps'));
});

it('stats widgets + guest hero', async () => {
  const parts = [
    html(<StatsWidgets stats={{ minutes: 25, steps: 4300, calories: 210 }} />),
    html(<StatsWidgets stats={{ minutes: 0, steps: 0, calories: 0 }} isGuest emphasizeSteps={false} />),
    html(<GuestHeroCard />),
  ];
  await expect(parts.join('\n')).toMatchFileSnapshot(snap('stats-guest'));
});
