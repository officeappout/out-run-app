/**
 * Error boundaries + lazy overlay wrappers (node env, static markup — no
 * jsdom). Boundaries can't catch during SSR, so the boundary lifecycle is
 * exercised on an instance directly; rendering paths use renderToStaticMarkup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const report = vi.fn();
vi.mock('../report-boundary-error', () => ({ reportBoundaryError: (...a: unknown[]) => report(...a) }));
const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace, push: vi.fn() }) }));

import WidgetBoundary, { withWidgetBoundary } from '../WidgetBoundary';
import { lazyOverlay } from '../lazyOverlay';
import { stickyMounted } from '../lazy-overlay-logic';
import RouteErrorFallback from '../RouteErrorFallback';
import LiveSessionErrorFallback from '../LiveSessionErrorFallback';
import { compactWidgetFallback } from '../CompactWidgetFallback';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

beforeEach(() => {
  report.mockReset();
});

describe('stickyMounted', () => {
  it('stays unmounted until the first open, then stays mounted after close', () => {
    let m = false;
    m = stickyMounted(m, false);
    expect(m).toBe(false);
    m = stickyMounted(m, true);
    expect(m).toBe(true);
    m = stickyMounted(m, false); // closed again → still mounted (exit animation, kept state)
    expect(m).toBe(true);
  });
});

describe('WidgetBoundary', () => {
  it('renders children when nothing throws', () => {
    expect(html(<WidgetBoundary name="t"><p>ok</p></WidgetBoundary>)).toBe('<p>ok</p>');
  });

  it('flags failure, reports to Sentry with its name, and renders the fallback', () => {
    expect(WidgetBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const b = new WidgetBoundary({ name: 'home.X', fallback: <i>fb</i>, children: <p>ok</p> });
    b.componentDidCatch(new Error('boom'), { componentStack: '\n at X' } as React.ErrorInfo);
    expect(report).toHaveBeenCalledWith(expect.any(Error), 'home.X', '\n at X');
    b.state = { failed: true };
    expect(html(<>{b.render()}</>)).toBe('<i>fb</i>');
  });

  it('defaults to rendering nothing, and passes retry to a function fallback', () => {
    const silent = new WidgetBoundary({ name: 'n', children: <p /> });
    silent.state = { failed: true };
    expect(silent.render()).toBeNull();

    const fn = vi.fn(() => <b>retry</b>);
    const b = new WidgetBoundary({ name: 'n', fallback: fn, children: <p /> });
    b.state = { failed: true };
    b.render();
    expect(fn).toHaveBeenCalledWith(b.retry);
  });

  it('clears the failure when resetKeys change', () => {
    const b = new WidgetBoundary({ name: 'n', resetKeys: [true], children: <p /> });
    b.state = { failed: true };
    const setState = vi.spyOn(b, 'setState').mockImplementation(() => {});
    b.componentDidUpdate({ name: 'n', resetKeys: [true], children: <p /> });
    expect(setState).not.toHaveBeenCalled();
    b.componentDidUpdate({ name: 'n', resetKeys: [false], children: <p /> });
    expect(setState).toHaveBeenCalledWith({ failed: false });
  });

  it('withWidgetBoundary is a drop-in: same props, same markup', () => {
    const Card = ({ label }: { label: string }) => <span>{label}</span>;
    const Bounded = withWidgetBoundary(Card, 'home.Card');
    expect(html(<Bounded label="שלום" />)).toBe('<span>שלום</span>');
  });

  it('compact fallback is a v2 card with a retry pill', () => {
    const out = html(<>{compactWidgetFallback(() => {})}</>);
    expect(out).toContain('data-v2-error-state="compact"');
    expect(out).toContain('נסו שוב');
  });
});

describe('lazyOverlay', () => {
  const Sheet = ({ isOpen, label }: { isOpen: boolean; label: string }) => (isOpen ? <div>{label}</div> : <div>closed</div>);
  const load = vi.fn(() => Promise.resolve({}));
  const LazySheet = lazyOverlay('t.Sheet', Sheet, (p) => p.isOpen, load);

  it('mounts nothing while never opened', () => {
    expect(html(<LazySheet isOpen={false} label="x" />)).toBe('');
  });

  it('renders the real component with the same props once open', () => {
    expect(html(<LazySheet isOpen label="פתוח" />)).toBe('<div>פתוח</div>');
  });

  it('preload triggers the loader and swallows failures', async () => {
    LazySheet.preload();
    expect(load).toHaveBeenCalled();
    const failing = lazyOverlay('t.F', Sheet, (p) => p.isOpen, () => Promise.reject(new Error('offline')));
    expect(() => failing.preload()).not.toThrow();
  });
});

describe('route error fallbacks', () => {
  const err = Object.assign(new Error('boom'), { digest: 'd' });

  it('RouteErrorFallback shows the friendly v2 screen with "נסו שוב"', () => {
    const out = html(<RouteErrorFallback error={err} reset={() => {}} boundary="route.home" />);
    expect(out).toContain('data-v2-error-state="screen"');
    expect(out).toContain('משהו השתבש');
    expect(out).toContain('נסו שוב');
  });

  it('a ChunkLoadError offers a refresh instead of a retry (same as global-error)', () => {
    const chunk = Object.assign(new Error('Loading chunk 123 failed'), { name: 'ChunkLoadError' });
    const out = html(<RouteErrorFallback error={chunk} reset={() => {}} boundary="route.home" />);
    expect(out).toContain('רענן עמוד');
    expect(out).not.toContain('נסו שוב');
  });

  it('live strength workout: "המשך אימון" + exit home', () => {
    const out = html(<LiveSessionErrorFallback error={err} reset={() => {}} boundary="route.workout-active" />);
    expect(out).toContain('המשך אימון');
    expect(out).toContain('יציאה לדף הבית');
  });

  it('live run: back to the map, never "exit home"', () => {
    const out = html(<LiveSessionErrorFallback error={err} reset={() => {}} boundary="route.run" kind="run" />);
    expect(out).toContain('המשך אימון');
    expect(out).toContain('חזרה למפה');
    expect(out).not.toContain('יציאה לדף הבית');
  });
});
