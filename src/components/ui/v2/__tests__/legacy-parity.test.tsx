/**
 * ClassicFormSheet must render BYTE-IDENTICAL markup to the flag-off chrome
 * AddWorkoutModal / PlannedActivityComposeSheet had inline before the v2
 * primitives round. `Original` below is that inline JSX, copied verbatim
 * (incl. #455's kb-fit / kb-cap on AddWorkoutModal).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ClassicFormSheet from '../../ClassicFormSheet';

const noop = () => {};

function Original({ backdrop, panel, title, children }: { backdrop: string; panel: string; title: string; children: React.ReactNode }) {
  const isOpen = true;
  const onClose = noop;
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={backdrop}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className={panel}
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-black text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                aria-label="סגירה"
                className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

describe('ClassicFormSheet = the pre-PR inline chrome', () => {
  it.each([
    ['AddWorkoutModal', 'kb-fit fixed inset-0 z-[60] flex items-end justify-center bg-black/40', 'kb-cap w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden', 'הוסף אימון'],
    ['PlannedActivityComposeSheet', 'fixed inset-0 z-[100] flex items-end justify-center bg-black/40', 'w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto', 'יוצא להתאמן'],
  ])('%s', (_, backdrop, panel, title) => {
    const body = <div className="px-5 space-y-4 pb-4">גוף</div>;
    const want = renderToStaticMarkup(<Original backdrop={backdrop} panel={panel} title={title}>{body}</Original>);
    const got = renderToStaticMarkup(
      <ClassicFormSheet isOpen onClose={noop} title={title} backdropClassName={backdrop} panelClassName={panel}>{body}</ClassicFormSheet>,
    );
    expect(got).toBe(want);
  });
});
