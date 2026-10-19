'use client';

/** Title, then the session tags right under it (so users see the session type first). */
export default function GroupTitleTags({ v2, name, tags }: { v2: boolean; name: string; tags: string[] }) {
  return (
    <>
      <h2 className={v2 ? 'text-[26px] font-black leading-[1.08] !tracking-[-0.02em] text-v2-ink' : 'text-xl font-black text-gray-900 dark:text-white leading-tight'}>
        {name}
      </h2>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 -mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className={
                v2
                  ? 'whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[12.5px] font-extrabold text-v2-ink-2 shadow-v2-ring'
                  : 'px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-bold'
              }
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
