'use client';

import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

/** "אני מגיע…" / "אני מגיעה…" / neutral "מגיעים…" — useT injects the user's gender. */
export default function ArrivalWheelCtaLabel() {
  const t = useT(map);
  return <>{t('arrivalWheel.cta')}</>;
}
