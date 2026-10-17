import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LineChart from '../LineChart';

const data = [
  { key: 'a', label: 'א', value: 4000 },
  { key: 'b', label: 'ב', value: 9000 },
  { key: 'c', label: 'ג', value: 12500 },
];

describe('LineChart', () => {
  it('draws the line, the goal and calls out the highlighted value', () => {
    const html = renderToStaticMarkup(<LineChart data={data} goal={10000} highlightKey="b" />);
    expect(html).toContain('data-v2-linechart');
    expect(html).toContain('stroke-dasharray="4 5"');
    expect(html).toMatch(/9,000|9000/);
  });

  it('defaults the call-out to the last point', () => {
    const html = renderToStaticMarkup(<LineChart data={data} />);
    expect(html).toMatch(/12,500|12500/);
  });

  it('renders nothing without data', () => {
    expect(renderToStaticMarkup(<LineChart data={[]} />)).toBe('');
  });
});
