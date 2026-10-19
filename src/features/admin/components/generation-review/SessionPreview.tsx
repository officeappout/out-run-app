'use client';
/** One flagged session, expanded: findings, LLM note, reports, legs, exercises (with patterns), map. */
import dynamicImport from 'next/dynamic';
import { RULE_BY_ID } from '@/lib/generation-review/invariants';
import { patternGroup } from '@/lib/generation-review/invariants/helpers';
import { REPORT_REASON_LABEL_HE, type ExerciseSummary } from '@/lib/generation-review/types';
import type { FlaggedRow } from '@/lib/generation-review/review/list';

const SessionMap = dynamicImport(() => import('./SessionMap'), { ssr: false });

const GROUP_CLASS: Record<string, string> = {
  push: 'bg-orange-100 text-orange-800',
  pull: 'bg-sky-100 text-sky-800',
  legs: 'bg-violet-100 text-violet-800',
  core: 'bg-amber-100 text-amber-800',
  other: 'bg-slate-100 text-slate-600',
};
const GROUP_HE: Record<string, string> = { push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', core: 'ליבה', other: 'אחר' };
const ACT_HE: Record<string, string> = { walk: 'הליכה', run: 'ריצה', cycle: 'רכיבה', strength: 'כוח', rest: 'מנוחה', other: 'אחר' };
const VERDICT_HE: Record<string, string> = { ok: 'הגיוני', questionable: 'מפוקפק', bad: 'לא טוב' };

function ExerciseList({ list }: { list: ExerciseSummary[] }) {
  if (!list.length) return <p className="text-xs text-slate-400">אין תרגילים.</p>;
  return (
    <ul className="space-y-1">
      {list.map((e, i) => {
        const g = patternGroup(e.pattern) ?? 'other';
        return (
          <li key={`${e.id}-${i}`} className="flex items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded font-bold ${GROUP_CLASS[g]}`}>{GROUP_HE[g]}</span>
            <span className="font-mono text-slate-700" dir="ltr">{e.id}</span>
            <span className="text-slate-500">{e.sets ?? '?'} סטים{typeof e.level === 'number' ? ` · רמה ${e.level}` : ''}</span>
            {e.gearOk === false && <span className="text-red-600 font-bold">אין ציוד</span>}
            {e.hasMedia === false && <span className="text-slate-400">בלי סרטון</span>}
          </li>
        );
      })}
    </ul>
  );
}

export default function SessionPreview({ row }: { row: FlaggedRow }) {
  const { input, output } = row;
  return (
    <div className="grid gap-4 md:grid-cols-2 p-4 bg-slate-50 border-t border-slate-200">
      <div className="space-y-3">
        <section>
          <h4 className="text-xs font-bold text-slate-500 mb-1">ממצאים</h4>
          <ul className="space-y-1">
            {row.findings.map((f, i) => (
              <li key={i} className="text-sm text-slate-800">
                <span className="font-bold">{RULE_BY_ID[f.ruleId]?.titleHe ?? f.ruleId}:</span> {f.messageHe}
              </li>
            ))}
            {row.findings.length === 0 && <li className="text-xs text-slate-400">אין ממצאי חוקים (דיווח משתמש בלבד).</li>}
          </ul>
        </section>
        {row.llm && (
          <section className="rounded-lg bg-white border border-slate-200 p-2">
            <h4 className="text-xs font-bold text-slate-500 mb-1">חוות דעת AI {row.llm.verdict ? `· ${VERDICT_HE[row.llm.verdict] ?? row.llm.verdict}` : ''}</h4>
            {row.llm.error && <p className="text-xs text-red-600">שגיאה: {row.llm.error}</p>}
            {(row.llm.problems ?? []).map((p, i) => <p key={i} className="text-sm text-slate-700">• {p}</p>)}
            {row.llm.suggestion && <p className="text-xs text-slate-500 mt-1">הצעה: {row.llm.suggestion}</p>}
          </section>
        )}
        {row.reports.length > 0 && (
          <section>
            <h4 className="text-xs font-bold text-slate-500 mb-1">דיווחי משתמש</h4>
            {row.reports.map((r, i) => (
              <p key={i} className="text-sm text-slate-700">
                {r.reasons.map((x) => REPORT_REASON_LABEL_HE[x] ?? x).join(' · ')}{r.note ? ` — "${r.note}"` : ''}
              </p>
            ))}
          </section>
        )}
        <section className="text-xs text-slate-500 space-y-0.5">
          <p>בקשה: {input.requestedActivity ? ACT_HE[input.requestedActivity] : '—'}{input.targetMinutes ? ` · ${input.targetMinutes} דק׳` : ''}{input.targetKm ? ` · ${input.targetKm} ק״מ` : ''}{input.focus ? ` · פוקוס ${input.focus}` : ''}{input.location ? ` · ${input.location}` : ''}</p>
          <p>רמות: {Object.entries(input.levels ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} · אזור {input.areaGeohash5 ?? '—'}</p>
          <p>הוצג: {output.planLabel ?? output.title ?? '—'} · {output.totalMinutes ?? '?'} דק׳ · גרסה {row.appVersion ?? '—'} · {row.platform ?? ''}</p>
          {row.outcome && <p>מה קרה: {String(row.outcome.last ?? '—')}{typeof row.outcome.swappedExercises === 'number' ? ` · ${row.outcome.swappedExercises} החלפות` : ''}</p>}
        </section>
      </div>
      <div className="space-y-3">
        {output.legs.length > 0 && (
          <section>
            <h4 className="text-xs font-bold text-slate-500 mb-1">מקטעים</h4>
            <ol className="space-y-2">
              {output.legs.map((l, i) => (
                <li key={i} className="text-xs">
                  <span className="font-bold">{i + 1}. {ACT_HE[l.activity] ?? l.activity}</span>{' '}
                  <span className="text-slate-500">
                    {l.minutes ?? '?'} דק׳{typeof l.distanceM === 'number' ? ` · ${l.distanceM} מ׳` : ''}{l.parkId ? ` · ${l.parkId}` : ''}
                  </span>
                  {l.exercises && l.exercises.length > 0 && <div className="mt-1 ms-3"><ExerciseList list={l.exercises} /></div>}
                </li>
              ))}
            </ol>
          </section>
        )}
        {output.exercises.length > 0 && (
          <section>
            <h4 className="text-xs font-bold text-slate-500 mb-1">תרגילים</h4>
            <ExerciseList list={output.exercises} />
          </section>
        )}
        {output.route && (
          <p className="text-xs text-slate-500">
            מסלול {output.route.source} · {(output.route.metrics.lengthM / 1000).toFixed(2)} ק״מ · ענפים מתים {output.route.metrics.spurCount} · חזרה {Math.round(output.route.metrics.retracedPct * 100)}%
            {typeof output.route.metrics.unmarkedCrossings === 'number' ? ` · חציות לא מסומנות ${output.route.metrics.unmarkedCrossings}` : ''}
          </p>
        )}
        {(output.route || output.stations.length > 0) && <SessionMap output={output} />}
      </div>
    </div>
  );
}
