/** The tutorial's step bars (board SchedDays: 3 segments, the done ones filled). */
export default function StepBars({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1 px-5 pt-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-v2-deep' : 'bg-v2-hairline'}`} />
      ))}
    </div>
  );
}
