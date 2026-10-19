/**
 * JourneyStrip + WorkoutOverviewHeader were extracted from HybridOverviewScreen
 * (19.10.2026). These tests pin that the extraction is byte-identical: the
 * pre-extraction markup is reproduced verbatim below (`legacy*`) and compared
 * with the primitives' output in both flag states.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronLeft } from 'lucide-react';
import { JourneyStrip, WorkoutOverviewHeader, type JourneyStripItem } from '../index';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { HYBRID_AER as AER, HYBRID_STR as STR, HYBRID_WALK as WALK_LEG_COLOR } from '@/features/parks/core/components/hybrid/hybrid-colors';
import { formatMinutes } from '@/features/parks/core/components/hybrid/hybrid-format';

type Seg = { kind: 'aerobic' | 'strength'; aerobicType?: string; domainFocus?: string; durationSec: number };

// ── Verbatim copy of the pre-extraction HybridOverviewScreen strip ──
function legacyStrip(v2: boolean, segments: Seg[], legs: { walkThereMin: number; walkBackMin: number } | null) {
  const aerobicKind = 'walking';
  const journeyStrip: JSX.Element[] = [];
  const walkChip = (key: string, min: number) => (
    <span key={key} className="inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap rounded-full"
      style={{ color: v2 ? '#64748b' : '#9CA3AF', border: '1px dashed #BAE6FD', padding: '2px 9px', opacity: 0.8 }}>
      <span className="inline-flex" style={{ color: WALK_LEG_COLOR }}><ActivityGlyph kind="aerobic" subtype="walking" className="w-[19px] h-[19px]" /></span>
      {formatMinutes(min * 60)}
    </span>
  );
  if (legs && legs.walkThereMin > 0) journeyStrip.push(walkChip('walk-there', legs.walkThereMin));
  segments.forEach((seg, i) => {
    if (journeyStrip.length > 0) {
      journeyStrip.push(<ChevronLeft key={`sep${i}`} size={16} style={{ color: v2 ? '#dfe7ed' : '#CBD5E1', flexShrink: 0 }} />);
    }
    if (seg.kind === 'aerobic') {
      const kind = seg.aerobicType ?? aerobicKind;
      journeyStrip.push(
        <span key={`leg${i}`} className="inline-flex items-center gap-1.5 text-[14px] font-bold whitespace-nowrap" style={{ color: v2 ? '#0e1419' : '#374151' }}>
          <span className="inline-flex" style={{ color: AER }}><ActivityGlyph kind="aerobic" subtype={kind} className="w-[23px] h-[23px]" /></span>
          {formatMinutes(seg.durationSec)}
        </span>,
      );
    } else {
      journeyStrip.push(
        <span key={`stn${i}`} className="inline-flex items-center gap-1.5 text-[14px] font-extrabold whitespace-nowrap" style={{ color: '#0E7490' }}>
          <span className="inline-flex" style={{ color: STR }}><ActivityGlyph kind="strength" subtype={seg.domainFocus} className="w-[23px] h-[23px]" /></span>
          {formatMinutes(seg.durationSec)}
        </span>,
      );
    }
  });
  if (legs && legs.walkBackMin > 0) {
    if (journeyStrip.length > 0) journeyStrip.push(<ChevronLeft key="sep-walk-back" size={16} style={{ color: v2 ? '#dfe7ed' : '#CBD5E1', flexShrink: 0 }} />);
    journeyStrip.push(walkChip('walk-back', legs.walkBackMin));
  }
  return (
    <div className="overflow-x-auto" style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}>
      <div className={v2 ? 'inline-flex items-center gap-2.5 bg-white rounded-[20px] shadow-v2-card' : 'inline-flex items-center gap-2.5 bg-white rounded-xl'}
        style={v2 ? { padding: '11px 15px' } : { border: '0.5px solid #E0E9FF', boxShadow: '0 3px 14px rgba(0,0,0,.07)', padding: '11px 15px' }}>
        {journeyStrip}
      </div>
    </div>
  );
}

// The new call site's mapping (HybridOverviewScreen → items).
function newItems(segments: Seg[], legs: { walkThereMin: number; walkBackMin: number } | null): JourneyStripItem[] {
  const items: JourneyStripItem[] = [];
  if (legs && legs.walkThereMin > 0) items.push({ key: 'walk-there', kind: 'transport', seconds: legs.walkThereMin * 60 });
  segments.forEach((seg, i) => {
    if (seg.kind === 'aerobic') items.push({ key: `leg${i}`, kind: 'aerobic', subtype: seg.aerobicType ?? 'walking', seconds: seg.durationSec });
    else items.push({ key: `stn${i}`, kind: 'strength', subtype: seg.domainFocus, seconds: seg.durationSec });
  });
  if (legs && legs.walkBackMin > 0) items.push({ key: 'walk-back', kind: 'transport', seconds: legs.walkBackMin * 60 });
  return items;
}

function legacyHeader(v2: boolean, title: string, totalMin: number, finishClock: string) {
  return (
    <div className={v2 ? 'flex items-center gap-x-1.5 gap-y-0.5 flex-wrap text-[13px]' : 'flex items-center gap-1.5 flex-wrap text-[13px]'}>
      <span className={v2 ? 'basis-full text-[22px] font-black leading-tight !tracking-[-0.02em] text-v2-ink' : 'text-[18px] font-black'} style={v2 ? undefined : { color: '#111827' }}>
        {title}
      </span>
      {!v2 && <span style={{ color: '#D1D5DB' }}>·</span>}
      <span className={v2 ? 'whitespace-nowrap font-extrabold text-v2-ink-2' : 'font-black'} style={v2 ? undefined : { color: '#374151' }}>{`${totalMin} דק׳`}</span>
      <span className={v2 ? 'text-v2-pill-border' : undefined} style={v2 ? undefined : { color: '#D1D5DB' }}>·</span>
      <span className={v2 ? 'whitespace-nowrap font-bold text-v2-muted' : 'font-bold'} style={v2 ? undefined : { color: '#6B7280' }}>{`מסיים ~${finishClock}`}</span>
    </div>
  );
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const SEGMENTS: Seg[] = [
  { kind: 'aerobic', aerobicType: 'running', durationSec: 720 },
  { kind: 'strength', domainFocus: 'pull', durationSec: 600 },
  { kind: 'aerobic', durationSec: 20 },
  { kind: 'strength', domainFocus: 'legs_core', durationSec: 480 },
];

describe('JourneyStrip — byte-identical to the hybrid overview strip', () => {
  for (const v2 of [false, true]) {
    for (const legs of [null, { walkThereMin: 6, walkBackMin: 0 }, { walkThereMin: 4, walkBackMin: 9 }]) {
      it(`v2=${v2} legs=${JSON.stringify(legs)}`, () => {
        expect(html(<JourneyStrip v2={v2} items={newItems(SEGMENTS, legs)} />)).toBe(html(legacyStrip(v2, SEGMENTS, legs)));
      });
    }
  }
  it('repeat items carry the repeat glyph and their label', () => {
    const out = html(<JourneyStrip v2 items={[{ key: 'r', kind: 'repeat', subtype: 'running', label: '6 × 400 מ׳' }]} />);
    expect(out).toContain('6 × 400 מ׳');
    expect(out).toContain('aria-label="חזרות"');
  });
});

describe('WorkoutOverviewHeader — byte-identical to the hybrid overview header', () => {
  for (const v2 of [false, true]) {
    it(`v2=${v2}`, () => {
      const out = html(
        <WorkoutOverviewHeader
          v2={v2}
          title="מסלול + עצירות"
          meta={[
            { key: 'time', text: '42 דק׳', tone: 'primary' },
            { key: 'finish', text: 'מסיים ~07:42', tone: 'secondary' },
          ]}
        />,
      );
      expect(out).toBe(html(legacyHeader(v2, 'מסלול + עצירות', 42, '07:42')));
    });
  }
});
