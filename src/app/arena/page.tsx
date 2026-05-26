/**
 * Legacy /arena redirect stub.
 *
 * /feed and /arena were merged into a single /community page. This stub
 * issues a server-side 307 redirect to /community?tab=leagues while
 * preserving any incoming query params.
 *
 * The full former implementation now lives in src/app/community/page.tsx.
 * This file (and src/app/feed/page.tsx) will be deleted in a follow-up
 * step once we're confident no external links point here.
 *
 * NOTE: /arena/create still exists and is unchanged — it uses the new
 * /community?tab=leagues path for its post-success redirects.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface ArenaRedirectProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function ArenaRedirect({ searchParams }: ArenaRedirectProps) {
  const params = new URLSearchParams();
  params.set('tab', 'leagues');
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'tab') continue; // never let an incoming ?tab= override our default
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else if (value != null) {
      params.set(key, value);
    }
  }
  redirect(`/community?${params.toString()}`);
}
