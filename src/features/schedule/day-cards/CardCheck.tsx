/** The small circle on a day card's top-end corner: empty until the card is closed, then a check. */
import { Check } from 'lucide-react';

export default function CardCheck({ done = false }: { done?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute -end-[5px] -top-[5px] grid h-[18px] w-[18px] place-items-center rounded-full ring-2 ring-white ${
        done ? 'bg-v2-accent text-white' : 'bg-white shadow-[inset_0_0_0_2px_#cfd9e1]'
      }`}
    >
      {done && <Check size={11} strokeWidth={3.2} />}
    </span>
  );
}
