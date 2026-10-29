/**
 * Translators for the run utils' generated text (titles, labels, unit words next to numbers). Pure modules
 * cannot call useT(), so these read the app's current locale at CALL time (makeLiveT): Hebrew stays
 * byte-identical, other languages follow the UI. Logic that parses or matches Hebrew (stored `block.label`,
 * section titles) never goes through these.
 */
import { makeLiveT } from '@/lib/i18n/live-t';
import { withUnit, type UnitId } from '@/lib/i18n/units';
import { common } from '@/messages/ns/common';
import { player } from '@/messages/ns/player';

/** Run-utils copy (`player` namespace, `runUtils.*`). */
export const rt = makeLiveT(player);
/** Unit words (`common` namespace). */
export const ut = makeLiveT(common);

/** "12.3 ק״מ" / "12.3 km" in the current language. `n` is the already formatted number. */
export const unitText = (u: UnitId, n: string | number): string => withUnit(u, n, ut);
