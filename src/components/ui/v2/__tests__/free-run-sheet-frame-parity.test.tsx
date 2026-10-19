/**
 * FreeRunSheetFrame (flag off) must render BYTE-IDENTICAL markup to the chrome
 * FreeRunDrawer's sheets had inline before sheets batch 2. The `Original*`
 * components below are that inline JSX copied verbatim with v2 = false.
 * Flag on: the shared <Sheet> with the same z-bands, spring and drag rule.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { FreeRunSubSheet, FreeRunMainFrame } from '@/features/parks/core/components/free-run/FreeRunSheetFrame';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const body = <div className="px-5 mb-5">גוף</div>;

function OriginalGoalSheet() {
  const isOpen = true;
  const onClose = noop;
  const dragControls = useDragControls();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[102] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`kb-sheet fixed bottom-0 left-0 right-0 z-[103] pointer-events-auto ${'bg-white rounded-t-3xl shadow-2xl'}`}
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            <div className="flex items-center justify-between px-5 pb-4">
              <h2 className="text-base font-black text-gray-900">מטרת אימון</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            {body}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function OriginalLegPlanSheet() {
  const isOpen = true;
  const onClose = noop;
  const dragControls = useDragControls();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[104] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 z-[105] pointer-events-auto ${'bg-white rounded-t-3xl shadow-2xl'}`}
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            <div className="flex items-center justify-between px-5 pb-4 shrink-0">
              <h2 className="text-base font-black text-gray-900">עצירות בדרך</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            {body}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function OriginalExtrasSheet() {
  const isOpen = true;
  const onClose = noop;
  const dragControls = useDragControls();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[104] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 z-[105] pointer-events-auto ${'bg-white rounded-t-3xl shadow-2xl'}`}
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            <div className="px-5 pb-4">
              <h2 className="text-base font-black text-gray-900">הגדרות נוספות</h2>
            </div>

            {body}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function OriginalMainDrawer() {
  const onClose = noop;
  const dragControls = useDragControls();
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Scrim */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- verbatim legacy copy */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 300) onClose();
        }}
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 pointer-events-auto"
      >
        <div
          className={'bg-white rounded-t-3xl shadow-2xl'}
          dir="rtl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div
            className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none' }}
          >
            <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
          </div>

          <div className="flex items-center justify-between px-5 pb-4">
            <h2 className="text-base font-black text-gray-900">אירובי חופשי</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform shrink-0"
              aria-label="סגור"
            >
              <X size={14} className="text-gray-600" />
            </button>
          </div>

          {body}
        </div>
      </motion.div>
    </div>
  );
}

const SAFE = { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' };

describe('FreeRunSheetFrame — flag off = the pre-migration inline chrome', () => {
  it('GoalSheet', () => {
    const got = html(
      <FreeRunSubSheet
        isOpen onClose={noop} v2={false} title="מטרת אימון" tier="goal" v2Layout="scroll" keyboardAware
        legacy={{
          backdropClassName: 'fixed inset-0 bg-black/30 z-[102] pointer-events-auto',
          panelClassName: 'kb-sheet fixed bottom-0 left-0 right-0 z-[103] pointer-events-auto bg-white rounded-t-3xl shadow-2xl',
          panelStyle: SAFE,
          handleClassName: 'flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing',
          headerClassName: 'flex items-center justify-between px-5 pb-4',
          headerClose: true,
        }}
      >
        {body}
      </FreeRunSubSheet>,
    );
    expect(got).toBe(html(<OriginalGoalSheet />));
  });

  it('LegPlanSheet', () => {
    const got = html(
      <FreeRunSubSheet
        isOpen onClose={noop} v2={false} title="עצירות בדרך" tier="extras" v2Layout="column"
        legacy={{
          backdropClassName: 'fixed inset-0 bg-black/30 z-[104] pointer-events-auto',
          panelClassName: 'fixed bottom-0 left-0 right-0 z-[105] pointer-events-auto bg-white rounded-t-3xl shadow-2xl',
          panelStyle: { ...SAFE, maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
          handleClassName: 'flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing shrink-0',
          headerClassName: 'flex items-center justify-between px-5 pb-4 shrink-0',
          headerClose: true,
        }}
      >
        {body}
      </FreeRunSubSheet>,
    );
    expect(got).toBe(html(<OriginalLegPlanSheet />));
  });

  it('ExtrasSheet', () => {
    const got = html(
      <FreeRunSubSheet
        isOpen onClose={noop} v2={false} title="הגדרות נוספות" tier="extras" v2Layout="plain"
        legacy={{
          backdropClassName: 'fixed inset-0 bg-black/30 z-[104] pointer-events-auto',
          panelClassName: 'fixed bottom-0 left-0 right-0 z-[105] pointer-events-auto bg-white rounded-t-3xl shadow-2xl',
          panelStyle: SAFE,
          handleClassName: 'flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing',
          headerClassName: 'px-5 pb-4',
          headerClose: false,
        }}
      >
        {body}
      </FreeRunSubSheet>,
    );
    expect(got).toBe(html(<OriginalExtrasSheet />));
  });

  it('the drawer', () => {
    const got = html(<FreeRunMainFrame onClose={noop} v2={false} title="אירובי חופשי">{body}</FreeRunMainFrame>);
    expect(got).toBe(html(<OriginalMainDrawer />));
  });
});

describe('FreeRunSheetFrame — flag on = <Sheet>', () => {
  const legacy = {
    backdropClassName: '', panelClassName: '', panelStyle: {}, handleClassName: '', headerClassName: '', headerClose: true,
  };
  it('GoalSheet: z 102/103, keyboard-aware, scrolls, clickable over the map layer', () => {
    const out = html(
      <FreeRunSubSheet isOpen onClose={noop} v2 title="מטרת אימון" tier="goal" v2Layout="scroll" keyboardAware legacy={legacy}>{body}</FreeRunSubSheet>,
    );
    expect(out).toContain('z-index:102');
    expect(out).toContain('z-index:103');
    expect(out).toContain('kb-sheet fixed inset-x-0 bottom-0 pointer-events-auto');
    expect(out).toContain('bg-black/30 pointer-events-auto');
    expect(out).toContain('max-h-[90dvh]');
    expect(out).toContain('padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 16px)');
    expect(out).toContain('data-v2-icon-button="surface"');
    expect(out).toContain('cursor-grab'); // handle-only drag
  });
  it('LegPlanSheet: z 104/105, column layout, header pinned, no kb classes', () => {
    const out = html(
      <FreeRunSubSheet isOpen onClose={noop} v2 title="עצירות בדרך" tier="extras" v2Layout="column" legacy={legacy}>{body}</FreeRunSubSheet>,
    );
    expect(out).toContain('z-index:105');
    expect(out).toContain('flex max-h-[80vh] flex-col');
    expect(out).toContain('flex justify-center pt-3 pb-2 shrink-0');
    expect(out).not.toContain('kb-');
  });
  it('the drawer: nested, transparent scrim at z 100, rises 400px', () => {
    const out = html(<FreeRunMainFrame onClose={noop} v2 title="אירובי חופשי">{body}</FreeRunMainFrame>);
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('z-index:100');
    expect(out).toContain('transform:translateY(400px)');
    expect(out).toContain('max-h-[90dvh]');
    expect(out).toContain('אירובי חופשי');
  });
});
