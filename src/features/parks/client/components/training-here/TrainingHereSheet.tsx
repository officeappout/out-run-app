'use client';

/**
 * TrainingHereSheet — the ONE "I'm training here" sheet (enable_where_to_train_v1, board RP-13
 * phones 5–6). Opened by a park card in the workout preview's "איפה מתאמנים?" carousel and by the
 * "שתף שאני יוצא…" toggle (ShareAsLiveToggle) on the workout and route pages.
 *
 * Prefilled: the workout and the place (a "החלף" link when the caller passes alternatives).
 * מתי: עכשיו / מאוחר יותר (hour chips + אחר). "שתף שאני מתאמן כאן" (on by default). למי גלוי.
 * CTA: start now / share now (no start handler) / save for later. Quiet link "רק לבחור את הגינה"
 * when the caller passes onPickOnly. Sharing writes a planned_sessions arrival (useTrainingHerePublish).
 */

import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, MapPin, Route as RouteIcon } from 'lucide-react';
import Sheet from '@/components/ui/v2/Sheet';
import Button from '@/components/ui/v2/Button';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { DrumTimePicker } from '@/components/ui/DrumTimePicker';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import { formatTime } from '@/lib/i18n/core/fmt';
import { shortDistanceLabel } from '../park-preview/park-card-meta';
import { ChoicePills, InfoRow, SECTION_LABEL, ShareSwitch } from './TrainingHereParts';
import { useTrainingHerePublish } from './useTrainingHerePublish';
import {
  laterTimeOptions,
  nextOccurrence,
  reminderTimeFor,
  resolveStartTime,
  type TrainingHereActivity,
  type TrainingHerePlace,
  type TrainingHereVisibility,
  type TrainingHereWhen,
} from './training-here.logic';

export interface TrainingHereSheetProps {
  open: boolean;
  onClose: () => void;
  activity: TrainingHereActivity;
  /** Already-formatted workout line ("אימון עליון · 45 דק׳"); hidden when null. */
  workoutLabel: string | null;
  place: TrainingHerePlace;
  /** Other places the user may switch to ("החלף"); the link shows only when there is more than one. */
  alternatives?: readonly TrainingHerePlace[];
  /** Start the workout right away (the "now" CTA). Without it the "now" CTA only shares. */
  onStartNow?: () => void;
  /** "רק לבחור את הגינה, בלי לשתף" — hidden when omitted. */
  onPickOnly?: (place: TrainingHerePlace) => void;
  /** A planned_sessions arrival was written. */
  onPublished?: (sessionId: string, place: TrainingHerePlace) => void;
}

const OTHER_KEY = 'other';

export default function TrainingHereSheet({
  open, onClose, activity, workoutLabel, place, alternatives, onStartNow, onPickOnly, onPublished,
}: TrainingHereSheetProps) {
  const t = useT(map);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const { publish, saving, failed, resetFailed } = useTrainingHerePublish();

  const [current, setCurrent] = useState<TrainingHerePlace>(place);
  const [changing, setChanging] = useState(false);
  const [when, setWhen] = useState<TrainingHereWhen>('now');
  const [chipKey, setChipKey] = useState<string>('0');
  const [otherTime, setOtherTime] = useState('18:00');
  const [share, setShare] = useState(true);
  const [visibility, setVisibility] = useState<TrainingHereVisibility>('verified_global');
  const [openedAt, setOpenedAt] = useState(() => new Date());

  // Every open starts from the caller's prefill.
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setOpenedAt(now);
    setCurrent(place);
    setChanging(false);
    setWhen('now');
    setChipKey('0');
    setOtherTime(`${String(laterTimeOptions(now, 1)[0].getHours()).padStart(2, '0')}:00`);
    setShare(true);
    setVisibility('verified_global');
    resetFailed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place.id]);

  const chips = useMemo(() => laterTimeOptions(openedAt), [openedAt]);
  const pickedLater = chipKey === OTHER_KEY ? nextOccurrence(otherTime, openedAt) : chips[Number(chipKey)] ?? null;
  const fmt = (d: Date) => formatTime(d, locale);

  const title = activity === 'workout'
    ? t('trainingHere.title.workout', { place: current.name })
    : t(activity === 'running' ? 'trainingHere.title.running' : 'trainingHere.title.walking');
  const placeLine = current.distanceM != null
    ? t('trainingHere.place.line', { name: current.name, distance: shortDistanceLabel(current.distanceM, locale, tc) })
    : current.name;
  const canChange = (alternatives?.length ?? 0) > 1;

  const ctaLabel = saving
    ? t('trainingHere.cta.saving')
    : when === 'later'
      ? (share && pickedLater ? t('trainingHere.cta.saveLater', { time: fmt(reminderTimeFor(pickedLater, openedAt)) }) : t('trainingHere.cta.done'))
      : onStartNow
        ? t('trainingHere.cta.startNow')
        : share ? t('trainingHere.cta.shareNow') : t('trainingHere.cta.done');

  const handleSubmit = async () => {
    if (share) {
      const start = resolveStartTime(when, pickedLater, new Date());
      const id = await publish({ place: current, activity, startTime: start, visibility });
      if (!id) return; // stays open with the error line
      onPublished?.(id, current);
    }
    onClose();
    if (when === 'now') onStartNow?.();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={t('parkCard.close')}
      layout="nested"
      scroll="panel"
      zIndex={SHEET_Z.nestedModal}
      className="max-h-[88vh]"
      keyboardAware={false}
    >
      <div className="space-y-4 px-5 pb-4" dir="rtl">
        <div className="space-y-2">
          {workoutLabel && (
            <InfoRow icon={<Dumbbell size={18} />} label={t('trainingHere.workout.label')} value={workoutLabel} />
          )}
          <InfoRow
            icon={current.kind === 'route' ? <RouteIcon size={18} /> : <MapPin size={18} />}
            label={t('trainingHere.place.label')}
            value={placeLine}
            action={canChange ? (
              <button type="button" onClick={() => setChanging((c) => !c)} aria-expanded={changing}
                className="shrink-0 text-[13px] font-extrabold text-v2-deep">
                {t('trainingHere.place.change')}
              </button>
            ) : undefined}
          />
          {changing && alternatives && (
            <ChoicePills
              compact
              ariaLabel={t('trainingHere.place.label')}
              options={alternatives.map((a) => ({ key: a.id, label: a.name }))}
              value={current.id}
              onChange={(id) => {
                const next = alternatives.find((a) => a.id === id);
                if (next) setCurrent(next);
                setChanging(false);
              }}
            />
          )}
        </div>

        <div>
          <div className={SECTION_LABEL}>{t('trainingHere.when.label')}</div>
          <ChoicePills
            ariaLabel={t('trainingHere.when.label')}
            options={[
              { key: 'now', label: t('trainingHere.when.now') },
              { key: 'later', label: t('trainingHere.when.later') },
            ]}
            value={when}
            onChange={setWhen}
          />
          {when === 'later' && (
            <div className="mt-2 space-y-2">
              <ChoicePills
                compact
                ariaLabel={t('trainingHere.when.later')}
                options={[
                  ...chips.map((d, i) => ({ key: String(i), label: fmt(d) })),
                  { key: OTHER_KEY, label: t('trainingHere.when.other') },
                ]}
                value={chipKey}
                onChange={setChipKey}
              />
              {chipKey === OTHER_KEY && <DrumTimePicker value={otherTime} onChange={setOtherTime} />}
            </div>
          )}
        </div>

        <ShareSwitch
          on={share}
          onToggle={() => setShare((s) => !s)}
          title={t('trainingHere.share.title')}
          sub={t(current.kind === 'route' ? 'trainingHere.share.sub.route' : 'trainingHere.share.sub.park')}
        />

        {share && (
          <div>
            <div className={SECTION_LABEL}>{t('trainingHere.visibility.label')}</div>
            <ChoicePills
              ariaLabel={t('trainingHere.visibility.label')}
              options={[
                { key: 'verified_global', label: t('trainingHere.visibility.everyone') },
                { key: 'squad', label: t('trainingHere.visibility.partners') },
              ]}
              value={visibility}
              onChange={setVisibility}
            />
          </div>
        )}

        {failed && (
          <p role="alert" className="text-center text-[13px] font-bold text-red-600">{t('trainingHere.error')}</p>
        )}

        <Button variant="cta" size="cta" block disabled={saving} onClick={() => { void handleSubmit(); }}>
          {ctaLabel}
        </Button>

        {onPickOnly && current.kind === 'park' && (
          <button
            type="button"
            onClick={() => { onPickOnly(current); onClose(); }}
            className="block w-full text-center text-[13px] font-extrabold text-v2-muted"
          >
            {t('trainingHere.pickOnly')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
