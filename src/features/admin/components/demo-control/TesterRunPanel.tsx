'use client';
/** /admin/demo — run / stop the AI testers now (POST /api/admin/demo/testers). */
import { Play, Square } from 'lucide-react';
import { Button, Panel, StatusPill } from '@/features/admin/components/ui';
import type { DemoStatusPayload } from '@/lib/demo-control/status';
import { errorLabel, fmtWhen } from './demo-client';

export default function TesterRunPanel({
  data,
  busy,
  onRun,
  onStop,
}: {
  data: DemoStatusPayload;
  busy: 'run' | 'stop' | null;
  onRun: () => void;
  onStop: () => void;
}) {
  const { switches, control, caps, dispatchConfigured } = data;
  const switchesOn = switches.enable_demo_users && switches.enable_ai_testers;
  const why = !switchesOn
    ? 'צריך ש"חיים" וגם "בודקים" יהיו דולקים.'
    : caps.blocksTesterRun
      ? 'הגעתם לתקרה של היום או של החודש.'
      : !dispatchConfigured
        ? 'ההרצה מהפאנל עוד לא מחוברת (חסר GITHUB_DISPATCH_TOKEN בשרת).'
        : null;
  const ld = control.lastDispatch;

  return (
    <Panel title="סיור בודקים">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onRun} disabled={busy !== null || why !== null}>
          <Play size={15} aria-hidden /> {busy === 'run' ? 'מפעיל…' : 'הרץ סיור בודקים עכשיו'}
        </Button>
        <Button variant="danger" onClick={onStop} disabled={busy !== null || control.testersStopRequested}>
          <Square size={14} aria-hidden /> {busy === 'stop' ? 'עוצר…' : control.testersStopRequested ? 'נשלחה עצירה' : 'עצור'}
        </Button>
      </div>
      {why && <p className="mt-3 text-[13px] font-bold text-slate-500">{why}</p>}
      <p className="mt-3 text-[13px] text-slate-500">
        &quot;עצור&quot; מסמן לבודקים לסיים את הצעד הנוכחי ולצאת. הם בודקים את הסימון בין צעד לצעד.
      </p>
      {ld && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          הפעלה אחרונה: {fmtWhen(ld.atMs)}
          <StatusPill tone={ld.ok ? 'good' : 'bad'}>{ld.ok ? 'נשלחה' : errorLabel(ld.error ?? 'github_error')}</StatusPill>
        </p>
      )}
    </Panel>
  );
}
