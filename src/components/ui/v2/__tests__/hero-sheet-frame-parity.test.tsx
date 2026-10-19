/**
 * HeroSheetFrame (classic) must render BYTE-IDENTICAL markup to the chrome
 * WorkoutPreviewDrawer and ParkDetailSheet had inline before sheets batch 2.
 * `Original` is that inline JSX copied verbatim; the two strings that differed
 * (panel class, frame style) are its parameters, exactly as each copy had them.
 * Flag on: the shared <Sheet> in its 'follow' drag mode.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motion, AnimatePresence, motionValue, type DragControls } from 'framer-motion';
import HeroSheetFrame from '../../HeroSheetFrame';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const controls = { start: noop } as unknown as DragControls;
const children = <div className="h-full overflow-y-auto overscroll-contain pb-36">גוף</div>;

function Original({ panel, style }: { panel: string; style: Record<string, string> }) {
  const isOpen = true;
  const onClose = noop;
  const y = motionValue(0);
  const opacity = motionValue(1);
  const dragControls = controls;
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />

          {/* Bottom Sheet */}
          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={noop}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
            style={{ y, opacity, ...style }}
            className={panel}
            dir="rtl"
          >
            {/* Drag handle — full-width touch target */}
            <div
              className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-4 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const CASES = [
  [
    'WorkoutPreviewDrawer',
    'fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden',
    { height: '95vh', maxHeight: '95vh', fontFamily: 'var(--font-simpler)', willChange: 'transform' },
  ],
  [
    'ParkDetailSheet',
    'kb-sheet fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden',
    { height: '92vh', maxHeight: '92vh', willChange: 'transform' },
  ],
] as const;

describe('HeroSheetFrame classic = the pre-migration inline chrome', () => {
  it.each(CASES)('%s', (_, panel, style) => {
    const want = html(<Original panel={panel} style={style} />);
    const got = html(
      <HeroSheetFrame
        isOpen
        onClose={noop}
        v2={false}
        y={motionValue(0)}
        opacity={motionValue(1)}
        dragControls={controls}
        onDragEnd={noop}
        frameStyle={style}
        classicClassName={panel}
      >
        {children}
      </HeroSheetFrame>,
    );
    expect(got).toBe(want);
  });
});

describe('HeroSheetFrame v2 = <Sheet> follow mode', () => {
  it('z 100 backdrop + panel, overlaid drag handle, caller styles on the frame', () => {
    const out = html(
      <HeroSheetFrame
        isOpen
        onClose={noop}
        v2
        y={motionValue(0)}
        opacity={motionValue(1)}
        dragControls={controls}
        onDragEnd={noop}
        frameStyle={{ height: '92vh', maxHeight: '92vh', willChange: 'transform' }}
        classicClassName="unused"
        keyboardAware
        ariaLabel="פארק"
      >
        {children}
      </HeroSheetFrame>,
    );
    expect(out.match(/z-index:100/g)?.length).toBe(2);
    expect(out).toContain('bg-black/40 backdrop-blur-sm');
    expect(out).toContain('data-v2-sheet-drag-handle');
    expect(out).toContain('height:92vh');
    expect(out).toContain('kb-sheet fixed inset-x-0 bottom-0');
    expect(out).toContain('rounded-t-[28px] bg-white shadow-v2-sheet');
    expect(out).toContain('aria-label="פארק"');
    expect(out).not.toContain('data-v2-sheet-grabber'); // the overlaid handle replaces it
    expect(out).not.toContain('unused');
  });
});
