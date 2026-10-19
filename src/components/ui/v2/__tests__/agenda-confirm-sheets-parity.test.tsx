/**
 * The planner's two confirm sheets (RollingAgenda's drag-reschedule sheet,
 * AgendaDayCard's delete sheet). `OriginalMove` / `OriginalDelete` are the
 * JSX those components had inline before sheets batch 3, copied VERBATIM; the
 * snapshot was recorded from them before the move into the classic frame
 * modules, which must render byte-identical markup.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { motion } from 'framer-motion';
import { MoveConfirmSheetClassic, MoveConfirmSheetV2 } from '@/features/home/components/agenda/MoveConfirmSheet';
import { DeleteEntrySheetClassic, DeleteEntrySheetV2 } from '@/features/home/components/agenda/DeleteEntrySheet';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

// ── RollingAgenda helpers (verbatim) ────────────────────────────────────────
const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HEBREW_DAY_FULL: Record<string, string> = {
  'א': 'יום ראשון', 'ב': 'יום שני', 'ג': 'יום שלישי',
  'ד': 'יום רביעי', 'ה': 'יום חמישי', 'ו': 'יום שישי', 'ש': 'שבת',
};
function getDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const letter = DAY_LETTERS[d.getDay()];
  return HEBREW_DAY_FULL[letter] ?? '';
}
function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`;
}

interface MoveIntent { fromDate: string; toDate: string; targetHasEntry: boolean; entryId: string | undefined }

function OriginalMove({ moveIntent }: { moveIntent: MoveIntent | null }) {
  const setMoveIntent = (_: null) => {};
  const handleMoveOnce = noop;
  const handleMoveAll = noop;
  return (
        <>
          <motion.div
            key="drag-confirm-backdrop"
            className="fixed inset-0 z-[140] bg-black/40"
            style={{ pointerEvents: moveIntent ? 'auto' : 'none' }}
            animate={{ opacity: moveIntent ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMoveIntent(null)}
          />
          <motion.div
            key="drag-confirm-sheet"
            className="fixed bottom-0 inset-x-0 z-[150] flex flex-col bg-white rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
            style={{
              paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom, 28px))',
            }}
            initial={{ y: '100%' }}
            animate={{ y: moveIntent ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            dir="rtl"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="px-5 pt-3 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-black text-gray-900">
                {moveIntent
                  ? moveIntent.targetHasEntry
                    ? `הוסף לאימון ב${getDayLabel(moveIntent.toDate)}`
                    : `העברת אימון ל${getDayLabel(moveIntent.toDate)}`
                  : ''
                }
              </h2>
              {moveIntent && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatShortDate(moveIntent.fromDate)} ← {formatShortDate(moveIntent.toDate)}
                </p>
              )}
            </div>

            <div className="px-5 pt-4 space-y-3 shrink-0">
              <button
                type="button"
                className="w-full py-3.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: '#00C9F2' }}
                onClick={handleMoveOnce}
              >
                שנה רק את האימון הזה
              </button>
              <button
                type="button"
                className="w-full py-3.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700 active:scale-[0.98] transition-transform"
                onClick={handleMoveAll}
              >
                שנה את כל הלוז קדימה
              </button>
              <button
                type="button"
                className="w-full py-3 text-sm text-gray-400 active:scale-[0.98] transition-transform"
                onClick={() => setMoveIntent(null)}
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </>
  );
}

function OriginalDelete({ deleteEntryId }: { deleteEntryId: { entryId: string; groupId?: string } | null }) {
  const setDeleteEntryId = (_: null) => {};
  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/40"
        style={{ zIndex: 300, pointerEvents: deleteEntryId ? 'auto' : 'none' }}
        animate={{ opacity: deleteEntryId ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => setDeleteEntryId(null)}
      />
      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 inset-x-0 bg-white rounded-t-2xl"
        style={{
          zIndex: 301,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: deleteEntryId ? 0 : '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        dir="rtl"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {/* Title */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">מחיקת אימון?</h2>
          <p className="text-xs text-gray-500 mt-1">האימון יוסר מהלוח השבועי</p>
        </div>
        {/* Buttons */}
        <div className="px-5 py-4 space-y-3">
          <button
            type="button"
            className="w-full py-3.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-transform"
            style={{ background: '#EF4444' }}
            onClick={() => {
              setDeleteEntryId(null);
            }}
          >
            מחק
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm text-gray-400 active:scale-[0.98] transition-transform"
            onClick={() => setDeleteEntryId(null)}
          >
            ביטול
          </button>
        </div>
      </motion.div>
    </>
  );
}

const intents: Array<MoveIntent | null> = [
  null,
  { fromDate: '2026-10-19', toDate: '2026-10-21', targetHasEntry: false, entryId: 'e1' },
  { fromDate: '2026-10-19', toDate: '2026-10-22', targetHasEntry: true, entryId: undefined },
];

describe('pre-migration markup (recorded)', () => {
  it('RollingAgenda move-confirm sheet', () => {
    expect(intents.map((m) => html(<OriginalMove moveIntent={m} />))).toMatchSnapshot();
  });
  it('AgendaDayCard delete sheet', () => {
    expect([null, { entryId: 'e1' }].map((d) => html(<OriginalDelete deleteEntryId={d} />))).toMatchSnapshot();
  });
});

const moveProps = (m: MoveIntent | null) => ({
  open: !!m,
  title: m ? (m.targetHasEntry ? `הוסף לאימון ב${getDayLabel(m.toDate)}` : `העברת אימון ל${getDayLabel(m.toDate)}`) : '',
  fromLabel: m ? formatShortDate(m.fromDate) : '',
  toLabel: m ? formatShortDate(m.toDate) : '',
  onMoveOnce: noop,
  onMoveAll: noop,
  onCancel: noop,
});

describe('flag off — the classic frame modules are byte-identical', () => {
  it('MoveConfirmSheetClassic === the pre-migration RollingAgenda markup', () => {
    for (const m of intents) {
      expect(html(<MoveConfirmSheetClassic {...moveProps(m)} />)).toBe(html(<OriginalMove moveIntent={m} />));
    }
  });
  it('DeleteEntrySheetClassic === the pre-migration AgendaDayCard markup', () => {
    for (const d of [null, { entryId: 'e1' }]) {
      expect(html(<DeleteEntrySheetClassic open={!!d} onConfirm={noop} onCancel={noop} />)).toBe(html(<OriginalDelete deleteEntryId={d} />));
    }
  });
});

describe('flag on — the shared ConfirmSheet', () => {
  it('MoveConfirmSheetV2 renders nothing server-side (portalled after mount) and nothing while closed', () => {
    expect(html(<MoveConfirmSheetV2 {...moveProps(intents[1])} />)).toBe('');
  });
  it('DeleteEntrySheetV2: in place, z 300/301, danger + ghost actions', () => {
    const out = html(<DeleteEntrySheetV2 open onConfirm={noop} onCancel={noop} />);
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('data-v2-confirm-sheet');
    expect(out).toContain('z-index:300');
    expect(out).toContain('z-index:301');
    expect(out).toContain('bg-v2-down');
    expect(out).toContain('מחיקת אימון?');
    expect(out).not.toContain('kb-');
    expect(html(<DeleteEntrySheetV2 open={false} onConfirm={noop} onCancel={noop} />)).toBe('');
  });
});
