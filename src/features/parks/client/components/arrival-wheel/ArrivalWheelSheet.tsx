'use client';

/**
 * "מתי מגיעים?" — compact sheet with the v2 WheelPicker (today/tomorrow ·
 * hour · minute, 15-min steps, future slots only) and one "פרסום" CTA.
 * enable_map_polish_v1 only: replaces the hours slider in the park sheet
 * (ArrivalPublishPanel) and the route sheet (RouteDetailSheet). The caller
 * writes the returned window with its existing createPlannedSession call.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Sheet, SHEET_Z, WheelPicker } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import {
  arrivalDayOptions,
  arrivalHourOptions,
  arrivalMinuteOptions,
  arrivalWindow,
  defaultArrival,
  normalizeArrival,
  pad2,
  type ArrivalDay,
  type ArrivalSelection,
} from './arrival-wheel-logic';

export interface ArrivalWheelSheetProps {
  open: boolean;
  onClose: () => void;
  publishing: boolean;
  onPublish: (window: { startTime: Date; endTime: Date }) => void;
  /** Start on tomorrow (e.g. the park sheet's "מחר" chip) when a slot exists there. */
  preferTomorrow?: boolean;
}

function initialSelection(now: Date, preferTomorrow: boolean): ArrivalSelection {
  const d = defaultArrival(now);
  if (!preferTomorrow || d.day === 1) return d;
  return normalizeArrival({ day: 1, hour: d.hour, minute: d.minute }, now);
}

export default function ArrivalWheelSheet({ open, onClose, publishing, onPublish, preferTomorrow = false }: ArrivalWheelSheetProps) {
  const t = useT(map);
  // "now" is pinned per open, so the option lists don't shift under the finger.
  const [now, setNow] = useState(() => new Date());
  const [sel, setSel] = useState<ArrivalSelection>(() => initialSelection(now, preferTomorrow));

  useEffect(() => {
    if (!open) return;
    const n = new Date();
    setNow(n);
    setSel(initialSelection(n, preferTomorrow));
  }, [open, preferTomorrow]);

  const update = (patch: Partial<ArrivalSelection>) => setSel((s) => normalizeArrival({ ...s, ...patch }, now));

  const columns = useMemo(() => [
    {
      key: 'hour',
      ariaLabel: t('arrivalWheel.hourAria'),
      options: arrivalHourOptions(sel.day, now).map((h) => ({ value: h, label: pad2(h) })),
      value: sel.hour,
      onChange: (hour: number) => update({ hour }),
    },
    {
      key: 'minute',
      ariaLabel: t('arrivalWheel.minuteAria'),
      options: arrivalMinuteOptions(sel.day, sel.hour, now).map((m) => ({ value: m, label: pad2(m) })),
      value: sel.minute,
      onChange: (minute: number) => update({ minute }),
    },
    {
      key: 'day',
      ariaLabel: t('arrivalWheel.dayAria'),
      options: arrivalDayOptions(now).map((d) => ({ value: d, label: t('arrivalWheel.day', { day: d === 0 ? 'today' : 'tomorrow' }) })),
      value: sel.day,
      onChange: (day: ArrivalDay) => update({ day }),
      className: 'flex-[1.3]',
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [sel, now, t]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('arrivalWheel.title')}
      zIndex={SHEET_Z.nestedModalPanel}
      backdropZIndex={SHEET_Z.nestedModal}
      frameClassName="w-full max-w-md mx-auto"
      dragToDismiss
      closeOnEscape
      respectReducedMotion
      footer={
        <div className="px-5 pt-2">
          <Button
            variant="cta"
            size="cta"
            block
            disabled={publishing}
            onClick={() => onPublish(arrivalWindow(sel, now))}
          >
            {publishing ? '…' : t('arrivalWheel.publish')}
          </Button>
        </div>
      }
    >
      <div className="px-5 pb-2 pt-1">
        {/* LTR so the time reads HH · MM; the day column sits at the reading start (right). */}
        <WheelPicker dir="ltr" columns={columns} />
      </div>
    </Sheet>
  );
}
