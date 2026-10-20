'use client';
/** /admin/demo — the status row: population, life engine, testers, last session, findings. */
import { KpiCard, KpiGrid, StatusPill } from '@/features/admin/components/ui';
import type { DemoStatusPayload } from '@/lib/demo-control/status';
import { fmtInt, fmtWhen } from './demo-client';

const TESTER_LABEL = { running: 'רצים', idle: 'במנוחה', unknown: 'לא ידוע' } as const;
const TESTER_TONE = { running: 'info', idle: 'neutral', unknown: 'warn' } as const;

export default function DemoStatusCards({ data }: { data: DemoStatusPayload }) {
  const { population, switches, control } = data;
  return (
    <KpiGrid>
      <KpiCard
        label="משתמשי דמו"
        value={`${fmtInt(population.demoUsers)}${population.capped ? '+' : ''}`}
        sub={population.demoUsers === 0 ? 'עוד לא נזרע עולם דמו' : 'בעולם הדמו הסגור'}
      />
      <KpiCard label="פעילים היום" value={fmtInt(population.activeToday)} sub="לפי כניסה אחרונה" />
      <KpiCard
        label="מנוע החיים"
        value={<StatusPill tone={switches.enable_demo_users ? 'good' : 'neutral'}>{switches.enable_demo_users ? 'דולק' : 'כבוי'}</StatusPill>}
        sub={switches.demo_life_llm ? 'AI בצ׳אט דולק' : 'משפטים מוכנים בצ׳אט'}
      />
      <KpiCard
        label="בודקי AI"
        value={<StatusPill tone={TESTER_TONE[control.testers.state]}>{TESTER_LABEL[control.testers.state]}</StatusPill>}
        sub={control.testersStopRequested ? 'נשלחה בקשת עצירה' : switches.enable_ai_testers ? 'מותר להריץ' : 'כבויים'}
      />
      <KpiCard label="סיור אחרון" value={<span style={{ fontSize: 18 }}>{fmtWhen(control.testers.lastSessionAtMs)}</span>} sub={control.testers.runId ? `ריצה ${control.testers.runId}` : undefined} />
      <KpiCard
        label="ממצאים"
        value={control.testers.findingsCount === null ? '—' : fmtInt(control.testers.findingsCount)}
        sub={control.testers.findingsCount === null ? 'עוד אין דוח בודקים' : 'פתוחים בדוח האחרון'}
      />
    </KpiGrid>
  );
}
