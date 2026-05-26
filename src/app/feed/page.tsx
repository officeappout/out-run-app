/**
 * Legacy /feed redirect stub.
 *
 * /feed and /arena were merged into a single /community page. This stub
 * issues a server-side 307 redirect to /community while preserving any
 * incoming query params (e.g. ?groupId=, ?editGroup=) that the new page
 * still consumes.
 *
 * The full former implementation now lives in src/app/community/page.tsx.
 * This file (and src/app/arena/page.tsx) will be deleted in a follow-up
 * step once we're confident no external links point here.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface FeedRedirectProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function FeedRedirect({ searchParams }: FeedRedirectProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else if (value != null) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  redirect(`/community${qs ? `?${qs}` : ''}`);
}
