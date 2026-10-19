'use client';

/** A results / empty-state section title with an optional "לכל N" / "ניקוי" action. */
export default function SectionHead({ title, action, onAction, tone = 'deep', id }: { title: string; action?: string; onAction?: () => void; tone?: 'deep' | 'ink'; id?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 id={id} className={tone === 'deep' ? 'm-0 text-[13px] font-bold text-[#007399]' : 'm-0 text-[15px] font-bold text-[#171717]'}>{title}</h2>
      {action && onAction && (
        <button type="button" onClick={onAction} className={`text-[13px] font-bold ${tone === 'deep' ? 'text-[#007399]' : 'text-[#6b7280]'} active:opacity-70`}>
          {action}
        </button>
      )}
    </div>
  );
}
