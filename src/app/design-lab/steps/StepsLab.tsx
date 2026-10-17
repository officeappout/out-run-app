'use client';

import { useState } from 'react';
import { Calendar, Check, Flame, Route, Target, Trophy } from 'lucide-react';
import { Card, DeltaBadge, StatNumber, EASE_V2 } from '@/components/ui/v2';
import { motion } from 'framer-motion';
import LabFrame from '../_shared/LabFrame';
import { AppIcon, BackBar, BottomNav, ICON, LineChart, Segmented } from '../_app/parts';
import { STEPS_DETAIL } from '../home/fixtures';

type Range = 'day' | 'week' | 'month';
const RANGES: { id: Range; label: string }[] = [
  { id: 'day', label: 'יום' },
  { id: 'week', label: 'שבוע' },
  { id: 'month', label: 'חודש' },
];

const HOURS = [
  { label: '6', value: 200 },
  { label: '8', value: 2100 },
  { label: '10', value: 3300 },
  { label: '12', value: 6400 },
  { label: '14', value: 8900 },
  { label: '16', value: 11200 },
  { label: '18', value: 14800 },
  { label: '20', value: 16554 },
];

/** Steps detail — the existing analytics screen, with a line chart instead of bars. */
export default function StepsLab() {
  const [range, setRange] = useState<Range>('week');
  const s = STEPS_DETAIL;
  const pct = Math.min(100, Math.round((s.today / s.goal) * 100));
  const data = range === 'day' ? HOURS : range === 'week' ? s.week.slice(0, 6) : s.month;
  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · צעדים</div>
          <p className="text-[14px] leading-relaxed text-v2-ink-2">גרף קו במקום עמודות, טבעת עבה בדף הבית. נתוני דמו בלבד.</p>
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain bg-gradient-to-b from-[#e7f8f0] via-v2-surface to-v2-surface pb-32">
        <BackBar
          eyebrow="ניתוח פעילות"
          title="צעדים"
          end={
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-activity-steps/10">
              <AppIcon src={ICON.walk} size={24} />
            </span>
          }
        />
        <div className="space-y-3 px-4">
          <Segmented id="steps-range" options={RANGES} value={range} onChange={setRange} dark />

          <Card padding="lg" className="!rounded-v2-card-lg">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-extrabold text-[#00865a]">היום</span>
              <DeltaBadge current={132} previous={100} suffix="מול שבוע שעבר" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <StatNumber value={s.today} size="hero" countUp />
              <span className="text-[15px] font-bold text-v2-muted">צעדים</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e7f8f0]">
              <motion.div
                className="h-full origin-right rounded-full"
                style={{ background: 'linear-gradient(90deg,#00c07a,#0cf2e3)' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct / 100 }}
                transition={{ duration: 0.9, ease: EASE_V2 }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[13px] font-bold">
              <span className="flex items-center gap-1 text-[#00865a]">
                <Check size={15} strokeWidth={3} aria-hidden /> היעד הושג
              </span>
              <span className="text-v2-muted">יעד {s.goal.toLocaleString('he-IL')}</span>
            </div>
          </Card>

          <Card padding="md">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[16px] font-black">{range === 'day' ? 'לאורך היום' : range === 'week' ? 'צעדים לפי יום' : '14 הימים האחרונים'}</span>
              <span className="text-[12px] font-bold text-v2-muted">{range === 'day' ? 'מצטבר' : 'יעד יומי מקווקו'}</span>
            </div>
            <LineChart key={range} data={data} goal={range === 'day' ? undefined : s.goal} height={170} highlight={range === 'week' ? 5 : undefined} />
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Calendar, label: 'ממוצע יומי', value: s.dailyAvg.toLocaleString('he-IL'), unit: 'צעדים' },
              { icon: Trophy, label: 'שיא', value: s.best.toLocaleString('he-IL'), unit: 'צעדים' },
              { icon: Target, label: 'ימים ביעד', value: `${s.daysOnGoal}/7`, unit: '' },
              { icon: Flame, label: 'רצף', value: String(s.streak), unit: 'ימים' },
            ].map(({ icon: Icon, label, value, unit }) => (
              <Card key={label} padding="md">
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-v2-muted">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-activity-steps/10 text-[#00865a]">
                    <Icon size={16} strokeWidth={2.4} aria-hidden />
                  </span>
                  {label}
                </div>
                <div className="mt-2 text-[24px] font-black leading-none tabular-nums tracking-v2-tighter">
                  {value} <span className="text-[13px] font-bold text-v2-muted">{unit}</span>
                </div>
              </Card>
            ))}
          </div>
          <Card padding="md" className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14px] font-extrabold text-v2-muted">
              <Route size={17} strokeWidth={2.4} className="text-[#00865a]" aria-hidden />
              מרחק היום
            </span>
            <span className="text-[24px] font-black tabular-nums">
              {s.distanceKm} <span className="text-[13px] font-bold text-v2-muted">ק״מ</span>
            </span>
          </Card>
        </div>
      </div>
      <BottomNav active="progress" />
    </LabFrame>
  );
}
