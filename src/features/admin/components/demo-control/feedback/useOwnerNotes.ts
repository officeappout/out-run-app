'use client';
/** The owner's notes to the AI testers: GET / POST /api/admin/demo/feedback/owner-rules. */
import { useCallback, useEffect, useState } from 'react';
import type { DismissalGroup, NoteInput, OwnerNote } from '@/lib/demo-control/owner-rules-model';
import { demoFetch, readError } from '../demo-client';

export function useOwnerNotes(enabled: boolean) {
  const [notes, setNotes] = useState<OwnerNote[]>([]);
  const [learned, setLearned] = useState<DismissalGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await demoFetch('/api/admin/demo/feedback/owner-rules');
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { notes: OwnerNote[]; learned: DismissalGroup[] };
      setNotes(body.notes);
      setLearned(body.learned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הטעינה נכשלה');
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  /** Returns an error text or null. */
  const add = useCallback(async (input: NoteInput): Promise<string | null> => {
    setSaving(true);
    try {
      const res = await demoFetch('/api/admin/demo/feedback/owner-rules', { method: 'POST', body: JSON.stringify(input) });
      if (!res.ok) throw new Error(await readError(res));
      const { note } = (await res.json()) as { note: OwnerNote };
      setNotes((prev) => [note, ...prev]);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'השמירה נכשלה';
    } finally {
      setSaving(false);
    }
  }, []);

  return { notes, learned, error, saving, add, reload };
}
