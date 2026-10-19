import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileStrip } from '../index';

describe('ProfileStrip', () => {
  it('renders one bar per segment with its flex, height and colour, plus labels', () => {
    const out = renderToStaticMarkup(
      <ProfileStrip
        segments={[
          { key: 'a', color: '#bfe48a', flex: 10, height: 40 },
          { key: 'b', color: '#e5484d', flex: 1.9, height: 100 },
        ]}
        labels={['חימום · 10′', 'עיקר · 6 חזרות']}
        ariaLabel="פרופיל"
      />,
    );
    expect(out).toContain('flex:10');
    expect(out).toContain('height:100%');
    expect(out).toContain('background:#e5484d');
    expect(out).toContain('עיקר · 6 חזרות');
    expect(out).toContain('aria-label="פרופיל"');
  });
  it('renders nothing without segments', () => {
    expect(renderToStaticMarkup(<ProfileStrip segments={[]} />)).toBe('');
  });
});
