'use client';
/** "משוב דמו" — one item: life feedback or a tester finding, with its triage actions. */
import { useState } from 'react';
import { Check, ClipboardCopy, Image as ImageIcon, RotateCcw, X } from 'lucide-react';
import { Button, Panel, StatusPill, type PillTone } from '@/features/admin/components/ui';
import { STATUS_LABEL, TYPE_LABEL, buildTaskMarkdown, type FeedbackItem, type TriageStatus } from '@/lib/demo-control/feedback-model';
import { fmtWhen } from '../demo-client';
import DesignScoreChips from '../DesignScoreChips';

const SEVERITY_TONE: Record<string, PillTone> = { P0: 'bad', P1: 'bad', P2: 'warn', P3: 'neutral' };
const STATUS_TONE: Record<TriageStatus, PillTone> = { open: 'info', handled: 'good', irrelevant: 'neutral' };

export default function FeedbackCard({
  item,
  onStatus,
  onScreenshot,
}: {
  item: FeedbackItem;
  onStatus: (item: FeedbackItem, status: TriageStatus) => void;
  onScreenshot: (item: FeedbackItem) => void;
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const tester = item.source === 'testers';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildTaskMarkdown(item));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        {item.severity && <StatusPill tone={SEVERITY_TONE[item.severity]}>{item.severity}</StatusPill>}
        <StatusPill tone="neutral">{tester ? 'בודקי AI' : 'משתמש דמו'}</StatusPill>
        <span className="whitespace-nowrap text-[13px] font-extrabold text-slate-600">{TYPE_LABEL[item.type]}</span>
        {item.rule && <span className="whitespace-nowrap text-[12px] font-bold text-slate-400">חוק {item.rule}</span>}
        <span className="ms-auto whitespace-nowrap text-[12px] font-bold text-slate-400">{fmtWhen(item.createdAtMs || null)}</span>
      </div>

      <h3 className="mt-2 text-[15px] font-black text-slate-900">{item.title}</h3>
      <p className="mt-0.5 truncate text-[12.5px] font-bold text-slate-500">
        {item.personaName || '—'}
        {tester && item.device ? ` · ${item.device}` : ''}
        {tester && item.mission ? ` · משימה ${item.mission}` : ''}
        {tester && item.route ? ` · ${item.route}` : ''}
        {item.count > 1 ? ` · ${item.count} פעמים` : ''}
        {!tester && item.generatedBy ? ` · ${item.generatedBy === 'llm' ? 'נכתב ב-AI' : 'משפט מוכן'}` : ''}
      </p>

      {item.designScores && (
        <div className="mt-2">
          <DesignScoreChips scores={item.designScores} />
        </div>
      )}

      {tester ? (
        <div className="mt-2 space-y-1.5 text-[14px] text-slate-700">
          {item.expected && (
            <p>
              <b className="font-extrabold text-slate-900">ציפינו: </b>
              {item.expected}
            </p>
          )}
          {item.text && (
            <p>
              <b className="font-extrabold text-slate-900">קרה: </b>
              {item.text}
            </p>
          )}
          {item.repro.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer font-extrabold text-slate-700">צעדי שחזור ({item.repro.length})</summary>
              <ol className="mt-1 list-decimal space-y-0.5 ps-5 text-slate-600" dir="ltr">
                {item.repro.map((r, i) => (
                  <li key={i} className="break-words">
                    {r}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-[14px] text-slate-700">{item.text}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusPill>
        {item.status === 'open' ? (
          <>
            <Button onClick={() => onStatus(item, 'handled')}>
              <Check size={14} aria-hidden /> טופל
            </Button>
            <Button onClick={() => onStatus(item, 'irrelevant')}>
              <X size={14} aria-hidden /> לא רלוונטי
            </Button>
          </>
        ) : (
          <Button onClick={() => onStatus(item, 'open')}>
            <RotateCcw size={14} aria-hidden /> פתח מחדש
          </Button>
        )}
        <Button onClick={() => void copy()}>
          <ClipboardCopy size={14} aria-hidden /> {copied === 'ok' ? 'הועתק' : copied === 'fail' ? 'ההעתקה נכשלה' : 'העתק כמשימה'}
        </Button>
        {item.hasScreenshot && (
          <Button onClick={() => onScreenshot(item)}>
            <ImageIcon size={14} aria-hidden /> צילום מסך
          </Button>
        )}
      </div>
    </Panel>
  );
}
