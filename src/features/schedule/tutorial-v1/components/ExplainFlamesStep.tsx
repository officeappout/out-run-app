'use client';

/**
 * ל5 (board ExplainFlames): how flames and the streak count, right after the week is built.
 * The strip shows a sample week (two flames, a shield, today's flame, then empty days), Sunday first.
 */
import type { ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { common } from '@/messages/ns/common';
import { weekdayLabel } from '@/lib/i18n/units';
import { FlameGlyph, HeroFlame, ShieldGlyph } from './FlameGlyphs';

const SAMPLE: Array<'flame' | 'shield' | 'empty'> = ['flame', 'flame', 'shield', 'flame', 'empty', 'empty', 'empty'];
const SAMPLE_TODAY = 3;

export default function ExplainFlamesStep({ onDone }: { onDone: () => void }) {
  const t = useT(schedule);
  const tc = useT(common);
  const b = (c: ReactNode) => <b>{c}</b>;
  return (
    <div className="relative flex min-h-full flex-col items-center gap-3.5 overflow-hidden bg-[#fffaf5] px-5 pb-7 pt-4 text-v2-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[70px] h-[380px] w-[380px] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.2), rgba(249,115,22,0) 65%)' }}
      />
      <span className="relative self-start rounded-full bg-[#ffedd5] px-3 py-1.5 text-[13px] font-extrabold text-[#9a3412]">{t('tutorial.flames.badge')}</span>
      <HeroFlame />
      <div className="relative flex flex-col gap-1.5 text-center">
        <h1 className="text-[28px] font-black leading-[34px]">{t('tutorial.flames.title')}</h1>
        <p className="text-[15px] leading-[23px] text-[#475569]">{t('tutorial.flames.text')}</p>
      </div>
      <div className="relative flex gap-2.5 rounded-[20px] bg-white px-4 py-3 shadow-v2-ring">
        {SAMPLE.map((kind, dow) => (
          <div key={dow} className="flex w-[30px] flex-col items-center gap-1">
            {kind === 'flame' ? <FlameGlyph /> : kind === 'shield' ? <ShieldGlyph /> : (
              <span className="grid h-[25px] w-6 place-items-center"><span className="h-5 w-5 rounded-full bg-[#eef2f6]" /></span>
            )}
            <span className={`text-[12px] font-extrabold ${dow === SAMPLE_TODAY ? 'text-v2-ink' : 'text-v2-muted'}`}>{weekdayLabel(dow, 'short', tc)}</span>
          </div>
        ))}
      </div>
      <div className="relative flex flex-col gap-2 self-stretch">
        <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-v2-ring">
          <span className="shrink-0"><FlameGlyph size={22} /></span>
          <span className="text-[14px] leading-5">{t.rich('tutorial.flames.bigger', { b })}</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-v2-ring">
          <span className="shrink-0"><ShieldGlyph /></span>
          <span className="text-[14px] leading-5">{t.rich('tutorial.flames.shield', { b })}</span>
        </div>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onDone}
        className="relative h-[54px] self-stretch rounded-full bg-v2-ink text-[16.5px] font-extrabold text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        {t('tutorial.flames.cta')}
      </button>
    </div>
  );
}
