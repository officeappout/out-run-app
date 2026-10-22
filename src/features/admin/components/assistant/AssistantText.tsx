'use client';

/**
 * Light markdown for assistant answers: paragraphs, "- " / "• " bullets, "1. " lists and
 * **bold**. Built from React nodes (no innerHTML). URLs in the text are NOT turned into links —
 * a clickable link only ever comes from a server `link` event (plan §3.4).
 */
import { Fragment, type ReactNode } from 'react';

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{p}</Fragment>
    ),
  );
}

export function AssistantText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} pr-5 space-y-0.5`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    blocks.push(
      <p key={`p${idx}`} className={heading ? 'font-semibold' : undefined}>
        {inline(heading ? heading[1] : line, `p${idx}`)}
      </p>,
    );
  });
  flush();
  return <div className="space-y-1.5 text-[14px] leading-6 text-slate-800">{blocks}</div>;
}
