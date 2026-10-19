/**
 * Sheet's generic drag options added for the media-hero sheets (sheets
 * batch 2): caller-owned dragControls / y MotionValue, frameStyle, and the
 * 'follow' drag mode. Static markup only — the gesture itself is framer's.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motionValue } from 'framer-motion';
import type { DragControls } from 'framer-motion';
import { Sheet, SHEET_Z, SPRING_HERO_SNAP } from '../index';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const fakeControls = { start: noop } as unknown as DragControls;

describe('Sheet drag options', () => {
  it('default: the grabber is the drag zone', () => {
    const out = html(<Sheet open onClose={noop} portal={false} dragToDismiss>b</Sheet>);
    expect(out).toContain('cursor-grab active:cursor-grabbing');
  });

  it('external dragControls: the grabber is a plain pill (the caller starts the drag)', () => {
    const out = html(
      <Sheet open onClose={noop} portal={false} dragToDismiss={{ mode: 'follow' }} dragControls={fakeControls}>b</Sheet>,
    );
    expect(out).not.toContain('cursor-grab');
    expect(out).toContain('data-v2-sheet-grabber');
  });

  it('frameStyle lands on the moving frame, next to the split z-index', () => {
    const out = html(
      <Sheet open onClose={noop} portal={false} zIndex={SHEET_Z.groupPanel} frameStyle={{ height: '95vh', willChange: 'transform' }}>
        b
      </Sheet>,
    );
    expect(out).toMatch(/z-index:81;[^"]*height:95vh/);
    expect(out).toContain('will-change:transform');
    expect(out).toContain('z-index:80'); // backdrop one step under
  });

  it('a caller-owned y MotionValue drives the frame (follow mode)', () => {
    const y = motionValue(0);
    const out = html(
      <Sheet open onClose={noop} portal={false} y={y} dragToDismiss={{ mode: 'follow' }} frameStyle={{ opacity: motionValue(0.5) }}>
        b
      </Sheet>,
    );
    expect(out).toContain('opacity:0.5');
    expect(out).toContain('data-v2-sheet-modal="split"');
  });

  it('without the new props the frame style is unchanged (z-index only)', () => {
    const out = html(<Sheet open onClose={noop} portal={false} zIndex={SHEET_Z.profilePanel}>b</Sheet>);
    expect(out).toMatch(/style="z-index:99;transform:translateY\(100%\)"/);
  });

  it('the hero snap spring keeps the old inline values', () => {
    expect(SPRING_HERO_SNAP).toEqual({ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 });
  });
});
