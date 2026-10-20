'use client';
/**
 * /admin/demo — the three live switches. Each press writes ONE key of
 * system_config/feature_flags (demo-switch.service.ts). The two sub-switches are
 * inert while "חיים" is off (the engines ignore them then anyway).
 */
import { Panel } from '@/features/admin/components/ui';
import type { DemoSwitchKey } from '@/lib/demo-control/paths';

const ROWS: Array<{ key: DemoSwitchKey; title: string; hint: string; costly?: boolean; child?: boolean }> = [
  { key: 'enable_demo_users', title: 'חיים', hint: 'מנוע החיים של עולם הדמו: מתאמנים, הולכים, כותבים. כבוי = שום דבר לא נכתב, והבודקים לא רצים.' },
  { key: 'demo_life_llm', title: 'AI בצ׳אט', hint: 'תגובות בצ׳אטים של הדמו נכתבות במודל AI קטן (עולה כסף). כבוי = משפטים מוכנים.', costly: true, child: true },
  { key: 'enable_ai_testers', title: 'בודקים', hint: 'מאפשר סיורי בודקי AI באפליקציה. כיבוי עוצר גם סיור שכבר רץ.', costly: true, child: true },
];

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40 ${on ? 'bg-cyan-500' : 'bg-slate-200'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[inset-inline-start] duration-150 ${on ? 'start-[22px]' : 'start-0.5'}`}
      />
    </button>
  );
}

export default function DemoSwitches({
  values,
  busyKey,
  onToggle,
}: {
  values: Record<DemoSwitchKey, boolean>;
  busyKey: DemoSwitchKey | null;
  onToggle: (key: DemoSwitchKey, next: boolean) => void;
}) {
  return (
    <Panel title="מתגים">
      <ul className="divide-y divide-slate-100">
        {ROWS.map((r) => {
          const parentOff = r.child && !values.enable_demo_users;
          const on = values[r.key];
          return (
            <li key={r.key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-[15px] font-extrabold text-slate-900">
                  {r.title}
                  {r.costly && <span className="ms-2 text-[12px] font-bold text-amber-600">בעלות</span>}
                </p>
                <p className="text-[13px] text-slate-500">{parentOff ? 'פועל רק כש"חיים" דולק.' : r.hint}</p>
              </div>
              <Switch
                on={on}
                label={r.title}
                disabled={busyKey !== null || (!!parentOff && !on)}
                onClick={() => onToggle(r.key, !on)}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
