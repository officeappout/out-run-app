# Finance Invoice Scan — Gmail Rate-Limit Risk on Long Scans

**Status:** Deferred (decided 07.09.2026), not fixed. See §3 for the explicit trigger to pick this up.

## 1. What was found

Investigating `/admin/finance/approvals`'s "סרוק מייל" (scan invoices) feature ahead of enabling
`FINANCE_WRITE_ENABLED` in production, two questions came up about long-running scans (going back
further than the default 40-day window, via "טווח מותאם" custom date ranges):

There is **no hidden day-based cap** on a custom `after`/`before` range — the 400-day clamp in
`src/app/api/admin/finance/scan-invoices/route.ts` only applies to the `days`-based modes ("since
last scan" / preset range), not to explicit custom dates, which pass straight through to Gmail's
`after:`/`before:` search operators unmodified.

But two real, code-level constraints CAN cut a long scan short, independent of the date range itself:

1. **`MAX_PAGES_PER_MAILBOX = 5`** — a hard cap of ~500 threads per mailbox per scan. If a long
   date range surfaces more matches than that in one mailbox, the scan stops paging there. This is
   now surfaced clearly in the UI (`TruncationWarning` component, added 07.09.2026) — this part is
   fixed, not deferred.
2. **Gmail API rate-limit risk during the metadata-fetch phase — THIS document's subject.** After
   listing candidate thread IDs, the scanner fetches each thread's metadata via
   `Promise.all(threads.map(t => gmail.users.threads.get({format:'metadata', ...})))` — fully
   concurrent, no throttling, no retry/backoff on `429`/`403` rate-limit responses anywhere in this
   route or in `src/lib/google-service-account.ts` (confirmed by grep — zero matches for
   `429`/`rateLimit`/`backoff`/`retry`/`quotaExceeded`). A mailbox returning enough matched threads
   in one scan could plausibly exceed Gmail's per-user quota and get a `429` back.
3. **What happens if it does**: that `Promise.all` sits inside an OUTER `Promise.all` across all 3
   mailboxes (the whole `scans` construction), which runs BEFORE any candidate is built. A single
   rejected promise there aborts the entire scan with a 500 and **zero recoverable progress** — not
   a partial result, not even the threads that would have succeeded. This is a real "cut off mid-way
   with nothing to show for it" failure mode, distinct from the graceful, now-visible truncation in
   point 1.

## 2. Decision — deferred, not fixed

David's mitigation for the immediate need (a one-time historical catch-up going back further than
40 days) is to split the custom range into several smaller windows (e.g. per quarter) and run them
sequentially, rather than one very long range in a single request. This sidesteps both the 500-thread
cap and the rate-limit risk in practice, without needing a code change.

Given that workaround exists and covers the actual near-term use case (one admin, occasional manual
scans), fixing the underlying concurrency/retry gap is deferred rather than built now.

## 3. Trigger to pick this up

Re-open this as a real fix the moment **either** of the following happens:

- **A `429`/rate-limit error is actually observed** in a scan run (visible as a fatal `500` with an
  error message referencing Gmail quota, or a `runLog` entry mentioning it) — proof the theoretical
  risk is now a real, live one, not just a code-reading concern.
- **Anyone other than David runs scans.** The current mitigation (manually splitting ranges,
  remembering not to fire one giant request) is a workaround that depends on the one person who knows
  about this doc. A second person running scans without that context is exactly the scenario this
  gap would bite.

When either trigger fires, the fix is: throttle/batch the per-thread metadata fetch (e.g. a
concurrency limit instead of a bare `Promise.all`, or sequential paging like the thread-listing loop
already does) plus a retry-with-backoff wrapper around Gmail API calls that checks for `429`/`403`
quota errors specifically — scoped to `scan-invoices/route.ts`'s metadata-fetch phase, since that's
the one unbounded-concurrency call site (the later per-candidate work in the classification loop is
already sequential, not at risk).
