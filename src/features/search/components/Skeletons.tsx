'use client';

const bar = 'animate-pulse rounded-full bg-[#e2e8f0]';

/** Loading placeholders while providers answer (aria-hidden; the live region says "מחפש…"). */
export function RowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_0_0_1px_rgba(14,27,42,0.05)]">
      <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#e2e8f0]" />
      <span className="flex flex-1 flex-col gap-2">
        <span className={`${bar} h-3 w-2/3`} />
        <span className={`${bar} h-2.5 w-1/3`} />
      </span>
    </div>
  );
}

export function TileSkeleton() {
  return <div aria-hidden className="h-[150px] animate-pulse rounded-[18px] bg-[#e2e8f0]" />;
}

export function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5"><TileSkeleton /><TileSkeleton /></div>
      <RowSkeleton />
      <RowSkeleton />
    </div>
  );
}
