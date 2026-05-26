/**
 * /library — legacy route, now permanently redirects to /search?tab=exercises.
 *
 * The Exercise Library is embedded as a tab inside the unified /search page.
 * Existing bookmarks, saved deep links, or external references continue to
 * land on the same content — the user never sees a 404.
 *
 * Implemented as a server-side redirect so it runs before the heavy library
 * client bundle is even requested.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LibraryRoutePage() {
  redirect('/search?tab=exercises');
}
