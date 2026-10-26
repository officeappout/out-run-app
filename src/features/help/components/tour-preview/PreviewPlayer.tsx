/**
 * Static illustration of the strength player for the 'player' tour preview: progress bars,
 * the "סיימתי" button and the how-to cues — each carrying the tour's own data-coach target.
 */
import { useT } from '@/hooks/useT';
import { legal } from '@/messages/ns/legal';

const CUES = ['help.preview.player.cue1', 'help.preview.player.cue2', 'help.preview.player.cue3'] as const;

export default function PreviewPlayer() {
  const t = useT(legal);
  return (
    <div className="absolute inset-0 flex flex-col bg-[#0e1419]">
      <div className="px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}>
        <div className="flex gap-1.5" data-coach="player-progress">
          {[1, 0.4, 0, 0, 0].map((fill, i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white" style={{ width: `${fill * 100}%` }} />
            </span>
          ))}
        </div>
        <p className="mt-3 text-[13px] font-bold text-white/70">{t('help.preview.player.progress')}</p>
      </div>
      <div className="flex-1" />
      <div className="rounded-t-[28px] bg-white px-5 pb-6 pt-5 text-v2-ink" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <p className="text-[22px] font-black">{t('help.preview.player.exercise')}</p>
        <p className="mt-0.5 text-[15px] font-bold text-v2-ink-2">{t('help.preview.player.reps')}</p>
        <div className="mt-4" data-coach="player-done">
          <div className="grid h-14 place-items-center rounded-full bg-v2-cta text-[16px] font-bold text-v2-on-cta shadow-v2-cta">{t('help.preview.player.done')}</div>
        </div>
        <div className="mt-4 rounded-2xl bg-v2-tint p-3.5" data-coach="player-how-to">
          <p className="text-[14px] font-black">{t('help.preview.player.howTo')}</p>
          <ul className="mt-1.5 space-y-1">
            {CUES.map((c) => (
              <li key={c} className="text-[13px] font-semibold text-v2-ink-2">{t(c)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
