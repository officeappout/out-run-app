'use client';
/** "לא רלוונטי" with an optional "למה לא רלוונטי" — the testers learn from the reason. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/features/admin/components/ui';
import { REASON_MAX } from '@/lib/demo-control/owner-rules-model';

export default function DismissReasonForm({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
      <label className="block">
        <span className="mb-1 block text-[13px] font-extrabold text-slate-700">למה לא רלוונטי? (לא חובה)</span>
        <textarea
          className="min-h-[64px] w-full rounded-xl bg-white px-3 py-2 text-[14px] text-slate-900 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          maxLength={REASON_MAX}
          value={reason}
          placeholder="למשל: במסך הזה זה בכוונה, הכפתור הצף לא מסתיר כלום"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className="mt-1 text-[12px] font-bold text-slate-500">אם אותו חוק נפסל פעמיים באותו מסך, הבודקים יפסיקו לדווח עליו שם.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => onConfirm(reason.trim())}>
          <X size={14} aria-hidden /> סמן לא רלוונטי
        </Button>
        <Button onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}
