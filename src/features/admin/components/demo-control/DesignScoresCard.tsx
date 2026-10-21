'use client';
/**
 * /admin/demo — "ציוני עיצוב": the worst screens of the last tester summary's design block
 * (demo_registry/qa_summary.design, via /api/admin/demo/status). Per screen: the overall 1–5,
 * one chip per dimension, devices, findings, and the screenshot (signed by the screenshot route
 * from the summary doc — the Storage path never reaches the browser).
 */
import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Button, Panel, StatusPill } from '@/features/admin/components/ui';
import type { DemoStatusPayload } from '@/lib/demo-control/status';
import { DESIGN_LOW_SCORE, fmtScore, scoreTone, worstDesignScreens } from '@/lib/demo-control/qa-design';
import { fmtInt, fmtWhen } from './demo-client';
import { openDesignScreenshot } from './feedback/useDemoFeedback';
import DesignScoreChips from './DesignScoreChips';

export default function DesignScoresCard({ qa }: { qa: DemoStatusPayload['qa'] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const design = qa.design;
  const worst = design ? worstDesignScreens(design.screens) : [];

  const onShot = async (screen: string) => {
    setNotice(null);
    const err = await openDesignScreenshot(screen);
    if (err) setNotice(err);
  };

  return (
    <Panel title="ציוני עיצוב">
      {!design || !worst.length ? (
        <p className="text-[13px] font-bold text-slate-500">
          עוד אין ציוני עיצוב. הם מגיעים מסיור עיצוב של הבודקים (משימות D01–D12), אחרי שהמסכם רץ.
        </p>
      ) : (
        <>
          <p className="text-[13px] font-bold text-slate-500">
            {fmtInt(design.screensScored)} מסכים קיבלו ציון · ממוצע <b dir="ltr">{fmtScore(design.avgScore)}</b>/5 ·{' '}
            {fmtInt(design.lowScreens)} מסכים ב-{DESIGN_LOW_SCORE} ומטה · {fmtInt(design.findings)} ממצאי עיצוב
            {qa.generatedAtMs ? ` · עודכן ${fmtWhen(qa.generatedAtMs)}` : ''}
          </p>
          <ol className="mt-3 space-y-3">
            {worst.map((s) => (
              <li key={s.screen} className="rounded-xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={scoreTone(s.score)}>
                    <b dir="ltr">{fmtScore(s.score)}</b>
                  </StatusPill>
                  <span className="min-w-0 truncate text-[15px] font-black text-slate-900">{s.label ?? s.screen}</span>
                  {s.label && (
                    <span className="truncate text-[12px] font-bold text-slate-400" dir="ltr">
                      {s.screen}
                    </span>
                  )}
                  {s.hasScreenshot && (
                    <Button className="ms-auto" onClick={() => void onShot(s.screen)}>
                      <ImageIcon size={14} aria-hidden /> צילום מסך
                    </Button>
                  )}
                </div>
                <div className="mt-2">
                  <DesignScoreChips scores={s} />
                </div>
                <p className="mt-1.5 truncate text-[12.5px] font-bold text-slate-500">
                  {s.devices.length ? s.devices.join(', ') : 'מכשיר לא ידוע'}
                  {` · ${fmtInt(s.findings)} ממצאים`}
                  {s.worst ? ` · הכי חמור ${s.worst}` : ''}
                  {s.topRule ? ` · חוק מוביל ${s.topRule}` : ''}
                  {s.route && s.route !== s.screen ? ` · ${s.route}` : ''}
                </p>
              </li>
            ))}
          </ol>
          {design.resume.length > 0 && (
            <p className="mt-3 text-[12.5px] font-bold text-slate-500">
              להמשך הסיור: <span dir="ltr">{design.resume.join(', ')}</span>
            </p>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[14px] font-bold text-rose-800">
          {notice}
        </p>
      )}
    </Panel>
  );
}
