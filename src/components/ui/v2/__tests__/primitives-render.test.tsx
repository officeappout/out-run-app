/**
 * Static-markup checks for the shared v2 primitives added with the
 * primitives round: Sheet, IconButton, Button "cta", SectionHeader,
 * HScroller and the unified StoryBars options.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { X } from 'lucide-react';
import { Sheet, IconButton, Button, SectionHeader, HScroller, StoryBars, SHEET_Z } from '../index';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    expect(html(<Sheet open={false} onClose={noop} portal={false} title="x">body</Sheet>)).toBe('');
  });
  it('split layout: backdrop one z-step below the panel, v2 surface, grabber, title + close', () => {
    const out = html(
      <Sheet open onClose={noop} portal={false} title="הוסף אימון" zIndex={SHEET_Z.filterPanel}>
        גוף
      </Sheet>,
    );
    expect(out).toContain('data-v2-sheet-backdrop');
    expect(out).toContain('z-index:70');
    expect(out).toContain('z-index:71');
    expect(out).toContain('rounded-t-[28px] bg-white shadow-v2-sheet');
    expect(out).toContain('h-1.5 w-10 rounded-full bg-v2-pill-border');
    expect(out).toContain('text-[22px] font-black');
    expect(out).toContain('הוסף אימון');
    expect(out).toContain('aria-label="סגירה"');
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('גוף');
  });
  it('pads the bottom by the safe area; keyboard layer classes per layout', () => {
    const split = html(<Sheet open onClose={noop} portal={false}>b</Sheet>);
    expect(split).toContain('padding-bottom:max(1.5rem, env(safe-area-inset-bottom))');
    expect(split).toContain('kb-sheet fixed inset-x-0 bottom-0');
    expect(split).toContain('kb-cap');
    const nested = html(<Sheet open onClose={noop} portal={false} layout="nested">b</Sheet>);
    expect(nested).toContain('kb-fit fixed inset-0');
    expect(nested).toContain('kb-cap');
    const off = html(<Sheet open onClose={noop} portal={false} keyboardAware={false}>b</Sheet>);
    expect(off).not.toContain('kb-');
  });
  it('nested layout: panel inside the backdrop, width-capped', () => {
    const out = html(<Sheet open onClose={noop} portal={false} layout="nested" zIndex={SHEET_Z.drawer}>b</Sheet>);
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('items-end justify-center bg-black/40');
    expect(out).toContain('w-full max-w-md');
    expect(out).toContain('z-index:60');
  });
  it('scroll modes', () => {
    expect(html(<Sheet open onClose={noop} portal={false} scroll="panel">b</Sheet>)).toContain('overflow-y-auto overscroll-contain');
    const body = html(<Sheet open onClose={noop} portal={false} footer={<span>F</span>}>b</Sheet>);
    expect(body).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(body).toContain('data-v2-sheet-footer');
  });
  it('no backdrop → not modal; custom header replaces the title row', () => {
    const out = html(
      <Sheet open onClose={noop} portal={false} backdrop={false} header={<div>H</div>} ariaLabel="pick">b</Sheet>,
    );
    expect(out).not.toContain('data-v2-sheet-backdrop');
    expect(out).not.toContain('aria-modal');
    expect(out).toContain('aria-label="pick"');
    expect(out).not.toContain('aria-label="סגירה"');
  });
  it('portal mode renders nothing on the server (mounted guard)', () => {
    expect(html(<Sheet open onClose={noop}>b</Sheet>)).toBe('');
  });
});

describe('IconButton', () => {
  it.each([
    ['white-ring', 'bg-white text-v2-ink shadow-v2-ring'],
    ['tint', 'bg-v2-tint text-v2-deep'],
    ['glass', 'v2-glass-chip'],
    ['surface', 'bg-v2-surface text-v2-ink ring-1 ring-inset ring-v2-hairline'],
  ] as const)('%s tone', (tone, cls) => {
    const out = html(<IconButton aria-label="סגור" tone={tone}><X /></IconButton>);
    expect(out).toContain(cls);
    expect(out).toContain('rounded-full');
    expect(out).toContain('aria-label="סגור"');
    expect(out).toContain('type="button"');
  });
  it.each([[36, 'h-9 w-9'], [40, 'h-10 w-10'], [48, 'h-12 w-12'], [56, 'h-14 w-14']] as const)('size %i', (size, cls) => {
    expect(html(<IconButton aria-label="x" size={size}><X /></IconButton>)).toContain(cls);
  });
});

describe('Button cta', () => {
  it('gradient CTA tokens at h-12 / 16px by default, h-14 with size lg', () => {
    const out = html(<Button variant="cta" block>שמור</Button>);
    expect(out).toContain('data-v2-button="cta"');
    expect(out).toContain('bg-v2-cta text-v2-on-cta shadow-v2-cta');
    expect(out).toContain('h-12 px-6 text-[16px]');
    expect(out).toContain('w-full');
    expect(html(<Button variant="cta" size="lg">x</Button>)).toContain('h-14');
    // Other variants keep their md default.
    expect(html(<Button>x</Button>)).toContain('h-11');
  });
});

describe('SectionHeader', () => {
  it('title, eyebrow and a button action', () => {
    const out = html(<SectionHeader title="אימונים" eyebrow="השבוע" action={{ label: 'הכל', onClick: noop }} />);
    expect(out).toContain('<h2');
    expect(out).toContain('text-[17px]');
    expect(out).toContain('השבוע');
    expect(out).toContain('<button type="button"');
    expect(out).toContain('הכל');
  });
  it('href action renders a link; size + heading level', () => {
    const out = html(<SectionHeader title="t" size={15} as="h3" action={{ label: 'עוד', href: '/x' }} />);
    expect(out).toContain('<h3');
    expect(out).toContain('text-[15px]');
    expect(out).toContain('href="/x"');
  });
});

describe('HScroller', () => {
  it('rtl rail, hidden scrollbar, edge padding and snap', () => {
    const out = html(<HScroller><div>a</div><div>b</div></HScroller>);
    expect(out).toContain('dir="rtl"');
    expect(out).toContain('overflow-x-auto');
    expect(out).toContain('[&amp;::-webkit-scrollbar]:hidden');
    expect(out).toContain('scrollbar-width:none');
    expect(out).toContain('px-5 scroll-px-5');
    expect(out).toContain('snap-x snap-proximity');
  });
  it('snap off, no edge', () => {
    const out = html(<HScroller snap={false} edge={0} gap={3}><div /></HScroller>);
    expect(out).not.toContain('snap-x');
    expect(out).not.toContain('px-5');
    expect(out).toContain('gap-3');
  });
});

describe('StoryBars (unified options)', () => {
  const segs = [{ key: 'a', color: '#5BC2F2', doneColor: '#10b981' }, { key: 'b', color: '#5BC2F2' }, { key: 'c', color: '#5BC2F2' }];
  it('continuous mode renders a fill on every bar (upcoming at 0 %), doneColor when done', () => {
    const out = html(<StoryBars segments={segs} currentIndex={1} progress={0.5} fillMode="continuous" direction="inherit" minFillPercent={0} />);
    expect(out).toContain('background:#10b981');
    expect(out).toContain('width:50%');
    expect(out).toContain('width:0%');
    expect(out).not.toContain('flex-row-reverse');
  });
  it('per-segment state override, glow and no-floor progress (strength runner header)', () => {
    const out = html(
      <StoryBars
        segments={[{ key: '0', color: '#00AEEF', state: 'done' }, { key: '1', color: '#00AEEF', state: 'current' }]}
        currentIndex={-1}
        progress={0}
        minFillPercent={0}
        glow="0 0 6px #00AEEF80"
      />,
    );
    expect(out).toContain('box-shadow:0 0 6px #00AEEF80');
    expect(out).toContain('width:0%');
    expect(out).toContain('flex:3');
    expect(out).toContain('flex-row-reverse');
  });
  it('renderOverlay draws above done bars', () => {
    const out = html(<StoryBars segments={segs} currentIndex={2} progress={0} renderOverlay={(i, st) => st === 'done' && <i data-badge={i} />} />);
    expect(out.match(/data-badge=/g)).toHaveLength(2);
  });
});
