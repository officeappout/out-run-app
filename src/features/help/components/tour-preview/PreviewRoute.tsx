/**
 * Static illustration of a suggested route for the 'route' tour preview: a drawn map with a
 * dashed route, one strength stop and the floating route card with its start button.
 */
import { Dumbbell } from 'lucide-react';
import PreviewMap from './PreviewMap';

export default function PreviewRoute() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <PreviewMap route />
      <div className="absolute" style={{ left: '50%', top: '37%', transform: 'translate(-50%, -100%)' }}>
        <div className="flex flex-col items-center" data-coach="route-strength-stop">
          <span className="mb-1 rounded-full bg-[#00BAF7] px-2 py-0.5 text-[11px] font-black text-white">גינת הכושר</span>
          <span className="rounded-full border-[3px] border-white bg-[#00BAF7] p-2.5 shadow-v2-float">
            <Dumbbell size={22} color="white" aria-hidden />
          </span>
        </div>
      </div>
      <div className="absolute inset-x-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        <div className="rounded-v2-card bg-white p-4 shadow-v2-float" data-coach="route-card">
          <p className="text-[17px] font-black text-v2-ink">מסלול בפארק · 3.2 ק״מ</p>
          <p className="mt-0.5 text-[13px] font-semibold text-v2-muted">כ־35 דקות · 2 עצירות כוח</p>
          <div className="mt-3" data-coach="route-start">
            <div className="grid h-12 place-items-center rounded-full bg-v2-cta text-[15px] font-bold text-v2-on-cta shadow-v2-cta">יוצאים לדרך</div>
          </div>
        </div>
      </div>
    </div>
  );
}
