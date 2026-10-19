'use client';

/** "כללי הקהילה" — the group's rules, from Firestore. */
export default function GroupRulesCard({ v2, rules }: { v2: boolean; rules: string }) {
  return (
    <div className={v2 ? 'rounded-[20px] bg-v2-surface px-4 py-3 ring-1 ring-inset ring-v2-hairline' : 'bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 border border-amber-100 dark:border-amber-800/40'}>
      <p className={v2 ? 'mb-1.5 text-[13px] font-extrabold text-v2-deep' : 'text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5'}>כללי הקהילה</p>
      <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed whitespace-pre-line">
        {rules}
      </p>
    </div>
  );
}
