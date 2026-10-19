/**
 * Kelly phase 2 — the "never claims it saved" guard. Pure. After propose_schedule_change the
 * schedule is NOT changed until the user taps "אשר"; a reply that says it already changed,
 * moved or saved the schedule is re-prompted once (turn-engine reply guards). Future /
 * conditional wording ("אחרי שתאשר הלו״ז יתעדכן") is fine.
 */
const DONE_FIRST_PERSON = /(?:^|[\s,.])(שיניתי|עדכנתי|שמרתי|הזזתי|העברתי|קבעתי|סידרתי)(?=[\s,.!?]|$)/;
const DONE_PASSIVE = /(?:^|[\s,.])(עודכן|עודכנה|נשמר|נשמרה|הוזז|הוזזה|הועבר|הועברה|שונה|שונתה)(?=[\s,.!?]|$)/;

/** The first past-tense "done" claim in a reply, or null. */
export function findSavedClaim(text: string): string | null {
  const t = (text ?? '').normalize('NFC');
  const m = t.match(DONE_FIRST_PERSON) ?? t.match(DONE_PASSIVE);
  return m ? m[1] : null;
}

export const PROPOSE_TOOL = 'propose_schedule_change';
