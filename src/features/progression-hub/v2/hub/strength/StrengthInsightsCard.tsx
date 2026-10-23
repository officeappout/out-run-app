'use client';

/**
 * Insights (PG-4): most improved · imbalance · new record. Each row exists only
 * when the data supports it; no insight → no card.
 */
import { AlertTriangle, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { formatDateLoose } from '@/lib/i18n/fmt-display';
import { HUB_COLORS } from '../hub-colors';
import type { ImbalanceInsight, ImprovedInsight, RecordInsight } from './strength-page.model';

function Row({ icon: Icon, tone, title, line }: { icon: LucideIcon; tone: { bg: string; fg: string }; title: string; line: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: tone.bg, color: tone.fg }} aria-hidden>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-black text-v2-ink">{title}</span>
        <span className="block text-[12.5px] font-bold text-v2-muted">{line}</span>
      </span>
    </li>
  );
}

export default function StrengthInsightsCard({
  improved,
  imbalance,
  record,
}: {
  improved: ImprovedInsight | null;
  imbalance: ImbalanceInsight | null;
  record: RecordInsight | null;
}) {
  const t = useT(profileNs);
  if (!improved && !imbalance && !record) return null;
  const n = (v: number) => formatNumber(v, t.locale);
  const cyan = { bg: HUB_COLORS.strength.tile, fg: HUB_COLORS.strength.text };
  return (
    <Card padding="none" className="px-4 py-2" data-strength-insights>
      <h3 className="pt-1.5 text-[15px] font-black text-v2-ink">{t('hubV2.strength.insights.title')}</h3>
      <ul className="divide-y divide-v2-hairline">
        {improved && (
          <Row
            icon={TrendingUp}
            tone={cyan}
            title={t('hubV2.strength.insights.improved.title', { name: improved.name, pct: n(improved.pct) })}
            line={t('hubV2.strength.insights.improved.line', { from: n(improved.from), to: n(improved.to), sessions: n(improved.sessions) })}
          />
        )}
        {imbalance && (
          <Row
            icon={AlertTriangle}
            tone={{ bg: 'rgba(14,27,42,0.06)', fg: '#4b5a66' }}
            title={t('hubV2.strength.insights.imbalance.title', { domain: imbalance.low.domain })}
            line={t('hubV2.strength.insights.imbalance.line', {
              low: imbalance.low.domain,
              lowSets: n(imbalance.low.sets),
              high: imbalance.high.domain,
              highSets: n(imbalance.high.sets),
            })}
          />
        )}
        {record && (
          <Row
            icon={Trophy}
            tone={{ bg: '#fff4d6', fg: '#7a4a00' }}
            title={t('hubV2.strength.insights.record.title', { name: record.name })}
            line={t('hubV2.strength.insights.record.line', {
              reps: n(record.reps),
              date: formatDateLoose(record.at, t.locale, { day: 'numeric', month: 'numeric' }),
            })}
          />
        )}
      </ul>
    </Card>
  );
}
