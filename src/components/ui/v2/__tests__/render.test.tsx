/**
 * Basic render tests for the v2 primitives — server-rendered to static markup
 * (react-dom/server), so they run in vitest's node environment with no jsdom.
 * They prove each primitive renders, picks the right variant/recipe and
 * respects its hide/empty rules; interaction is covered by the pure-logic
 * suite (logic.test.ts) and the screen PRs' on-device checks.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Footprints } from 'lucide-react';
import {
  Button,
  Card,
  CardTile,
  GlassSurface,
  Chip,
  IconTile,
  StatNumber,
  DeltaBadge,
  DraggableSheet,
  BarChart,
} from '../index';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('Button', () => {
  it.each(['primary', 'dark', 'ghost'] as const)('renders the %s variant as a pill button', (variant) => {
    const out = html(<Button variant={variant}>שמור</Button>);
    expect(out).toContain(`data-v2-button="${variant}"`);
    expect(out).toContain('rounded-full');
    expect(out).toContain('type="button"');
    expect(out).toContain('שמור');
  });
  it('primary uses the gradient CTA tokens', () => {
    const out = html(<Button>go</Button>);
    expect(out).toContain('bg-v2-cta');
    expect(out).toContain('text-v2-on-cta');
    expect(out).toContain('shadow-v2-cta');
  });
});

describe('Card / CardTile / GlassSurface', () => {
  it.each(['light', 'dark', 'glass'] as const)('renders the %s card', (variant) => {
    const out = html(<Card variant={variant}>x</Card>);
    expect(out).toContain(`data-v2-card="${variant}"`);
    expect(out).toContain('rounded-v2-card');
  });
  it('dark tile uses the site white/10 inner tile', () => {
    expect(html(<CardTile tone="dark">x</CardTile>)).toContain('bg-white/10');
  });
  it.each(['bar', 'card', 'chip'] as const)('maps the %s recipe to its glass class', (recipe) => {
    expect(html(<GlassSurface recipe={recipe} />)).toContain(`v2-glass-${recipe}`);
  });
});

describe('Chip / IconTile', () => {
  it('renders a chip label', () => {
    const out = html(<Chip tone="accent">חדש</Chip>);
    expect(out).toContain('data-v2-chip="accent"');
    expect(out).toContain('חדש');
  });
  it('decorative IconTile is aria-hidden and contains an svg', () => {
    const out = html(<IconTile icon={Footprints} tone="steps" />);
    expect(out).toContain('data-v2-icon-tile="steps"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('<svg');
  });
  it('labelled IconTile is exposed as an image', () => {
    const out = html(<IconTile icon={Footprints} label="צעדים" />);
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="צעדים"');
  });
});

describe('StatNumber', () => {
  it('renders the formatted value, unit and label with tabular-nums', () => {
    const out = html(<StatNumber value={8432} unit="צעדים" label="היום" size="hero" />);
    expect(out).toContain('8,432');
    expect(out).toContain('צעדים');
    expect(out).toContain('היום');
    expect(out).toContain('tabular-nums');
    expect(out).toContain('font-black');
  });
  it('honours a custom formatter', () => {
    expect(html(<StatNumber value={1421} format={(v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`} />)).toContain('23:41');
  });
  it('count-up starts from 0 on first paint', () => {
    expect(html(<StatNumber value={500} countUp />)).toContain('>0<');
  });
});

describe('DeltaBadge', () => {
  it('shows ▲ and the percent for a rise', () => {
    const out = html(<DeltaBadge current={1200} previous={1000} />);
    expect(out).toContain('data-v2-delta="up"');
    expect(out).toContain('▲');
    expect(out).toContain('20%');
  });
  it('shows ▼ for a drop', () => {
    expect(html(<DeltaBadge current={500} previous={1000} />)).toContain('▼');
  });
  it('renders nothing without a baseline', () => {
    expect(html(<DeltaBadge current={500} previous={0} />)).toBe('');
  });
});

describe('DraggableSheet', () => {
  it('renders handle, header, content and a pinned footer', () => {
    const out = html(
      <DraggableSheet snapPoints={[160, 0.9]} header={<h2>סיכום</h2>} footer={<button>שמור</button>}>
        <p>content</p>
      </DraggableSheet>,
    );
    expect(out).toContain('data-v2-sheet');
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('סיכום');
    expect(out).toContain('content');
    expect(out).toContain('data-v2-sheet-footer');
  });
});

describe('BarChart', () => {
  const data = [
    { key: 'sun', label: 'א', value: 9000 },
    { key: 'mon', label: 'ב', value: 4000 },
    { key: 'tue', label: 'ג', value: 0 },
  ];
  it('renders one bar per datum with accessible labels', () => {
    const out = html(<BarChart data={data} />);
    expect(out.match(/data-v2-bar=/g)).toHaveLength(3);
    expect(out).toContain('aria-label="א: 9,000"');
  });
  it('draws a goal line only when a goal is given', () => {
    expect(html(<BarChart data={data} goal={8000} goalLabel="יעד" />)).toContain('data-v2-goal-line');
    expect(html(<BarChart data={data} />)).not.toContain('data-v2-goal-line');
  });
  it('marks the highlighted bar', () => {
    expect(html(<BarChart data={data} highlightKey="mon" />)).toMatch(/data-v2-bar="mon"[^>]*data-highlight="true"/);
  });
  it('is RTL by default', () => {
    expect(html(<BarChart data={data} />)).toContain('dir="rtl"');
  });
});
