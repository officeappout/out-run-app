/**
 * GroupSheetFrame (classic) must render BYTE-IDENTICAL markup to the chrome
 * GroupDetailsDrawer had inline before sheets batch 2 (`Original`, verbatim
 * with v2 = false). Flag on: the shared <Sheet> ('follow' drag, z 80/81).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motion, AnimatePresence, motionValue, type DragControls } from 'framer-motion';
import GroupSheetFrame, { resolveGroupSheetRelease } from '@/features/arena/components/group-details/GroupSheetFrame';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const controls = { start: noop } as unknown as DragControls;
const PEEK_Y_PX = 80;
const children = <div className="relative flex-shrink-0 h-56">hero</div>;

function Original() {
  const isOpen = true;
  const onClose = noop;
  const v2 = false;
  const y = motionValue(0);
  const opacity = motionValue(1);
  const dragControls = controls;
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: v2 ? 0 : PEEK_Y_PX }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={noop}
            className="kb-sheet fixed bottom-0 left-0 right-0 z-[81] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ height: '95vh', y, opacity }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const frame = (v2: boolean) =>
  html(
    <GroupSheetFrame isOpen onClose={noop} v2={v2} y={motionValue(0)} opacity={motionValue(1)} dragControls={controls} peekY={PEEK_Y_PX} ariaLabel="קבוצה">
      {children}
    </GroupSheetFrame>,
  );

describe('GroupSheetFrame', () => {
  it('classic = the pre-migration inline chrome', () => {
    expect(frame(false)).toBe(html(<Original />));
  });
  it('v2 = <Sheet>: z 80/81, width-capped, keyboard-aware, 95vh, no grabber (the cover is the drag zone)', () => {
    const out = frame(true);
    expect(out).toContain('z-index:80');
    expect(out).toMatch(/z-index:81;[^"]*height:95vh/);
    expect(out).toContain('kb-sheet fixed inset-x-0 bottom-0 mx-auto max-w-md');
    expect(out).toContain('backdrop-filter:blur(4px)');
    expect(out).toContain('flex h-full flex-col');
    expect(out).not.toContain('data-v2-sheet-grabber');
    expect(out).toContain('aria-label="קבוצה"');
  });
  it('release rule: close past 100px / 500px/s, expand past -50px, else peek', () => {
    expect(resolveGroupSheetRelease(101, 0)).toBe('close');
    expect(resolveGroupSheetRelease(0, 501)).toBe('close');
    expect(resolveGroupSheetRelease(-51, 0)).toBe('expand');
    expect(resolveGroupSheetRelease(100, 500)).toBe('peek');
    expect(resolveGroupSheetRelease(-50, 0)).toBe('peek');
  });
});
