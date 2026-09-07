import { AlertTriangle } from 'lucide-react';

export interface MailboxCoverage {
  mailbox: string;
  threadsScanned: number;
  truncated: boolean;
  oldestCoveredDate: string | null;
}

/**
 * A truncated scan on financial data is more dangerous than one that errors
 * out — it has no symptom otherwise, and a month can get closed on the
 * assumption everything was captured. Rendered as its own card, above the
 * routine stats box, so it can't be missed the way a small inline note can.
 */
export function TruncationWarning({ mailboxCoverage }: { mailboxCoverage?: MailboxCoverage[] }) {
  const truncatedMailboxes = (mailboxCoverage ?? []).filter((m) => m.truncated);
  if (truncatedMailboxes.length === 0) return null;
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm space-y-1.5">
      <div className="font-black text-red-700 flex items-center gap-1.5">
        <AlertTriangle className="w-4 h-4 shrink-0" /> הסריקה נחתכה — לא כל הטווח כוסה
      </div>
      {truncatedMailboxes.map((m) => (
        <div key={m.mailbox} className="text-red-600 text-xs">
          {m.mailbox}: נסרקו {m.threadsScanned} שרשורים
          {m.oldestCoveredDate
            ? ` · כוסה עד ${m.oldestCoveredDate} — מיילים ישנים יותר בתיבה זו לא נסרקו`
            : ' · טווח הכיסוי בפועל לא ידוע'}
        </div>
      ))}
      <div className="text-red-700 font-bold text-xs">צמצם את הטווח והרץ שוב כדי לכסות את התקופה שנותרה.</div>
    </div>
  );
}
