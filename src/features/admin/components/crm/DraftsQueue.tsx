'use client';

import { useEffect, useState } from 'react';
import { Lock, ExternalLink, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface DraftItem {
  authorityId: string;
  authorityName: string;
  draftId: string;
  subject: string;
  threadId: string;
}

export default function DraftsQueue() {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    getDoc(doc(db, 'crm_runs', todayKey))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as { draftsPending?: DraftItem[] };
          setDrafts(data.draftsPending ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || drafts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <Mail size={18} className="text-gray-400" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">טיוטות ממתינות לאישור</h2>
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                {drafts.length}
              </span>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <Lock size={10} />
              שום דבר לא נשלח ללא אישורך
            </p>
          </div>
        </div>
        <button onClick={() => setOpen(v => !v)} className="text-gray-300 hover:text-gray-500 transition-colors">
          {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </div>

      {/* Draft list */}
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {drafts.map(draft => (
            <div key={draft.draftId} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">
                    {draft.authorityName}
                  </p>
                  <p className="text-sm font-medium text-gray-900 truncate">{draft.subject}</p>
                </div>
                <a
                  href={`https://mail.google.com/mail/u/0/#drafts/${draft.draftId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <ExternalLink size={13} />
                  פתח ב-Gmail
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
