'use client';

/**
 * "מה קלי זוכר" — the user's Kelly memory (Kelly phase 3, flag ai_coach_memory): every fact
 * Kelly keeps, grouped by kind, with a per-fact delete and "מחק הכל". Opened from the Kelly
 * chat header. Reads and deletes through /api/ai-coach/memory (server-only collection).
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { MEMORY_CATEGORY_HE } from '@/lib/ai/coach/memory/types';
import { deleteAllMemory, deleteMemoryFact, listMemory, type MemoryFactView } from '../services/kelly-phase3-api';

export default function KellyMemorySheet({ onClose }: { onClose: () => void }) {
  const [facts, setFacts] = useState<MemoryFactView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    let alive = true;
    void listMemory().then((f) => {
      if (!alive) return;
      if (f) setFacts(f);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const remove = async (id: string) => {
    setBusy(id);
    if (await deleteMemoryFact(id)) setFacts((cur) => (cur ?? []).filter((f) => f.id !== id));
    setBusy(null);
  };

  const removeAll = async () => {
    setBusy('all');
    if (await deleteAllMemory()) setFacts([]);
    setBusy(null);
    setConfirmAll(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/30" dir="rtl" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pt-4 text-gray-900"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', colorScheme: 'light' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="מה קלי זוכר"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">מה קלי זוכר</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-gray-100" aria-label="סגור">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] leading-snug text-gray-500">
          דברים שסיפרת לקלי בשיחות ושעוזרים לו להתאים לך אימונים: פציעות, לו״ז, יעדים והעדפות. אפשר למחוק כל אחד מהם.
        </p>

        {!facts && !failed && <p className="py-6 text-center text-sm text-gray-400 animate-pulse">טוען...</p>}
        {failed && <p className="py-6 text-center text-sm text-gray-500">לא הצלחנו לטעון כרגע. נסו שוב בעוד רגע.</p>}
        {facts && facts.length === 0 && <p className="py-6 text-center text-sm text-gray-500">קלי עוד לא זוכר שום דבר.</p>}

        {facts && facts.length > 0 && (
          <ul className="space-y-2">
            {facts.map((f) => (
              <li key={f.id} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="text-[10.5px] font-black text-cyan-700">{MEMORY_CATEGORY_HE[f.category] ?? ''}</span>
                  <p className="text-sm leading-snug">{f.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(f.id)}
                  disabled={!!busy}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-gray-500 shadow-sm disabled:opacity-40"
                  aria-label="מחק"
                >
                  {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {facts && facts.length > 0 && (
          <div className="mt-4">
            {confirmAll ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-bold text-gray-700">למחוק את כל מה שקלי זוכר?</span>
                <button type="button" onClick={() => setConfirmAll(false)} className="rounded-full bg-gray-100 px-4 py-2 text-[13px] font-bold">
                  ביטול
                </button>
                <button type="button" onClick={() => void removeAll()} disabled={!!busy} className="rounded-full bg-red-500 px-4 py-2 text-[13px] font-black text-white disabled:opacity-50">
                  {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק הכל'}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmAll(true)} disabled={!!busy} className="w-full rounded-full border border-red-200 py-2.5 text-[13px] font-black text-red-600">
                מחק הכל
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
