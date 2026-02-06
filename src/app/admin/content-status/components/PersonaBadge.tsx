'use client';

interface PersonaBadgeProps {
  tag: string;
}

export default function PersonaBadge({ tag }: PersonaBadgeProps) {
  return (
    <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">
      {tag}
    </span>
  );
}
