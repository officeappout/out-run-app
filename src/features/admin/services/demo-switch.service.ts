/**
 * The /admin/demo switches write system_config/feature_flags exactly like the
 * system-settings page does (client SDK, setDoc merge, updated_at / updated_by;
 * firestore.rules: admins only) — one key per press, so the other flags are never
 * touched. Pressing the switch IS the owner's approval to flip it.
 */
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_SWITCH_KEYS, type DemoSwitchKey } from '@/lib/demo-control/paths';

export async function writeDemoSwitch(key: DemoSwitchKey, value: boolean, uid: string): Promise<void> {
  await setDoc(
    doc(db, 'system_config', 'feature_flags'),
    { [key]: value, updated_at: serverTimestamp(), updated_by: uid },
    { merge: true },
  );
}

/** Live raw values of the three switches (one doc listener; call the returned fn to stop). */
export function subscribeDemoSwitches(
  onValue: (v: Record<DemoSwitchKey, boolean>) => void,
  onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'system_config', 'feature_flags'),
    (snap) => {
      const data = snap.data() ?? {};
      onValue(Object.fromEntries(DEMO_SWITCH_KEYS.map((k) => [k, data[k] === true])) as Record<DemoSwitchKey, boolean>);
    },
    (e) => onError(e),
  );
}
