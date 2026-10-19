'use client';

/** Nothing found (NoResults board): near matches, browse by, Kelly with the query, "הצע להוסיף". */
import Link from 'next/link';
import { useState } from 'react';
import { SearchX, Dumbbell, MapPin, BookOpen } from 'lucide-react';
import { BRAND_GRADIENT } from '@/components/ui/v2';
import { auth } from '@/lib/firebase';
import SectionHead from './SectionHead';
import { askKellyHref } from './AskKellyRow';
import type { ResultCategory, SearchCategory } from '../core/types';

interface Props {
  query: string;
  category: SearchCategory;
  nearMatches: string[];
  onPick: (q: string) => void;
  onBrowse: (c: ResultCategory) => void;
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

async function sendSuggestion(query: string, category: SearchCategory): Promise<boolean> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return false;
  const res = await fetch('/api/content/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, category }),
  });
  return res.ok;
}

export default function NoResults({ query, category, nearMatches, onPick, onBrowse }: Props) {
  const [send, setSend] = useState<SendState>('idle');
  const suggest = async () => {
    setSend('sending');
    try {
      setSend((await sendSuggestion(query, category)) ? 'sent' : 'error');
    } catch {
      setSend('error');
    }
  };
  const browse: Array<{ c: ResultCategory; label: string; Icon: typeof MapPin }> = [
    { c: 'exercises', label: 'שריר', Icon: Dumbbell },
    { c: 'parks', label: 'גינה', Icon: MapPin },
    { c: 'articles', label: 'מאמר', Icon: BookOpen },
  ];
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col items-center gap-1.5 pt-4 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.06)]" aria-hidden>
          <SearchX size={22} className="text-[#007399]" />
        </span>
        <div className="text-[17px] font-bold text-[#171717]">לא מצאנו בדיוק את זה</div>
        <div className="text-[13px] text-[#6b7280]">אין תוצאה ל״{query}״{nearMatches.length ? ', אבל יש דברים קרובים.' : '.'}</div>
      </div>

      {nearMatches.length > 0 && (
        <section aria-labelledby="nr-near" className="flex flex-col gap-2">
          <SectionHead id="nr-near" tone="ink" title="אולי חיפשת" />
          <div className="flex flex-wrap gap-1.5">
            {nearMatches.map((m) => (
              <button key={m} type="button" onClick={() => onPick(m)} className="h-9 rounded-full border border-[#bae6fd] bg-[#f0faff] px-3.5 text-[14px] font-bold text-[#007399] active:scale-[0.97]">
                {m}
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="nr-browse" className="flex flex-col gap-2">
        <SectionHead id="nr-browse" tone="ink" title="או לחפש לפי" />
        <div className="grid grid-cols-3 gap-2">
          {browse.map(({ c, label, Icon }) => (
            <button key={c} type="button" onClick={() => onBrowse(c)} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white py-3 text-[13px] font-bold text-[#171717] shadow-[0_0_0_1px_rgba(14,27,42,0.06)] active:scale-[0.97]">
              <Icon size={20} className="text-[#007399]" aria-hidden />{label}
            </button>
          ))}
        </div>
      </section>

      <Link href={askKellyHref(query)} className="flex flex-col gap-1.5 rounded-2xl bg-[#04222b] p-3.5 text-white active:scale-[0.99]">
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-[#04222b]" style={{ background: BRAND_GRADIENT }} aria-hidden>ק</span>
          <span className="text-[14px] font-bold">קלי יודע לענות על זה</span>
        </span>
        <span className="text-[12.5px] text-[#bae6fd]">״{query}״ · הוא יבנה לך תשובה או אימון ברמה שלך.</span>
        <span className="mt-1 w-fit rounded-full px-3.5 py-1.5 text-[13px] font-bold text-[#04222b]" style={{ background: BRAND_GRADIENT }}>לשאול את קלי</span>
      </Link>

      <div className="text-center" aria-live="polite">
        {send === 'sent' ? (
          <p className="m-0 text-[13px] font-bold text-[#047857]">תודה! העברנו לצוות</p>
        ) : (
          <button type="button" onClick={suggest} disabled={send === 'sending'} className="text-[13px] font-bold text-[#007399] underline-offset-2 hover:underline disabled:opacity-60">
            {send === 'sending' ? 'שולח…' : 'חסר משהו? הצע לנו להוסיף'}
          </button>
        )}
        {send === 'error' && <p className="m-0 mt-1 text-[12px] text-[#b91c1c]">לא הצלחנו לשלוח, נסו שוב</p>}
      </div>
    </div>
  );
}
