'use client';
/**
 * /admin/demo → "משוב דמו": what the demo personas said about parks and the app (life engine)
 * and what the AI testers found (qa_findings), newest first, 30 at a time. Everything goes
 * through /api/admin/demo/feedback/** (super admin; both collections are server-only).
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@/features/admin/components/ui';
import type { FeedbackItem, TriageStatus } from '@/lib/demo-control/feedback-model';
import FeedbackFilters from './FeedbackFilters';
import FeedbackCard from './FeedbackCard';
import { DEFAULT_FILTERS, openScreenshot, useDemoFeedback, type FeedbackFilterState } from './useDemoFeedback';

const PERSONA_DEBOUNCE_MS = 400;

export default function DemoFeedbackTab({ enabled }: { enabled: boolean }) {
  const [filters, setFilters] = useState<FeedbackFilterState>(DEFAULT_FILTERS);
  const [personaDraft, setPersonaDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.persona === personaDraft.trim() ? f : { ...f, persona: personaDraft.trim() })), PERSONA_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [personaDraft]);

  const { items, hasMore, loading, loaded, error, loadMore, reload, setStatus } = useDemoFeedback(enabled, filters);

  const onStatus = useCallback(
    async (item: FeedbackItem, status: TriageStatus) => {
      setNotice(null);
      const err = await setStatus(item, status);
      if (err) setNotice(err);
    },
    [setStatus],
  );

  const onScreenshot = useCallback(async (item: FeedbackItem) => {
    setNotice(null);
    const err = await openScreenshot(item.id);
    if (err) setNotice(err);
  }, []);

  return (
    <div className="space-y-4">
      <FeedbackFilters value={filters} personaDraft={personaDraft} onChange={setFilters} onPersonaDraft={setPersonaDraft} />

      {notice && (
        <p role="status" className="rounded-xl bg-rose-50 px-3 py-2 text-[14px] font-bold text-rose-800">
          {notice}
        </p>
      )}

      {!loaded && loading && <Skeleton height={120} count={3} />}
      {error && !items.length && <ErrorState message={error} onRetry={reload} />}

      {loaded && !items.length && !error && (
        <EmptyState title={hasMore ? 'אין התאמות בקטע שנסרק' : 'אין משוב שמתאים לסינון'}>
          {hasMore
            ? 'נסרקו הפריטים החדשים ביותר ולא נמצאה התאמה. "טען עוד" ימשיך לפריטים ישנים יותר.'
            : 'משוב מגיע ממנוע החיים של הדמו (פארקים ואפליקציה) ומסיורי בודקי ה-AI.'}
        </EmptyState>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <FeedbackCard key={`${it.source}:${it.id}`} item={it} onStatus={(i, s) => void onStatus(i, s)} onScreenshot={(i) => void onScreenshot(i)} />
        ))}
      </div>

      {error && items.length > 0 && <p className="text-[13px] font-bold text-amber-700">הטעינה האחרונה נכשלה ({error}).</p>}

      {hasMore && (
        <div className="flex justify-center">
          <Button onClick={loadMore} disabled={loading}>
            <ChevronDown size={15} aria-hidden /> {loading ? 'טוען…' : 'טען עוד'}
          </Button>
        </div>
      )}
    </div>
  );
}
