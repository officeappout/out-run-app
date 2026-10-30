'use client';

/**
 * Shell of a hub deeper page (PG-3/4/5, PG-6 navigation): a sticky header with
 * ONE back arrow, the page title and a one-line subtitle, then the body.
 *
 * Back = the browser history (so a page opened from home returns home, one
 * opened from the progress tab returns there); a page opened cold (deep link,
 * no history) goes to the progress tab. The iOS right-edge swipe (ClientLayout,
 * enable_home_v2) calls the same history back.
 *
 * Flag guard: until the flags are known → a neutral skeleton; hub off → the
 * progress tab (the route does not exist for users without the flag).
 */
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import ScreenSkeleton from '@/components/ui/v2/ScreenSkeleton';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { HUB_HOME } from '../hub-routes';
import { useProgressHubFlag } from '../useProgressHubFlag';
import type { HubKind } from '../hub-colors';
import HubKindIcon from './HubKindIcon';

export function goBackOrHub(router: { back: () => void; replace: (href: string) => void }): void {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back();
  else router.replace(HUB_HOME);
}

export default function HubPageShell({
  kind,
  title,
  subtitle,
  children,
}: {
  kind: HubKind;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useT(profileNs);
  const router = useRouter();
  const { ready, on } = useProgressHubFlag();

  useEffect(() => {
    if (ready && !on) router.replace(HUB_HOME);
  }, [ready, on, router]);

  if (!ready || !on) return <ScreenSkeleton />;

  return (
    <div className="min-h-[100dvh] bg-v2-surface text-v2-ink" data-hub-page={kind}>
      <header className="sticky top-0 z-30 bg-v2-surface shadow-[0_1px_0_rgba(14,27,42,0.06)]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={() => goBackOrHub(router)}
            aria-label={t('hubV2.page.back')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <ChevronRight className="h-5 w-5 ltr:rotate-180" strokeWidth={2.4} aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-black !tracking-[-0.02em] text-v2-ink">{title}</h1>
            {subtitle && <p className="truncate text-[12.5px] font-bold text-v2-muted">{subtitle}</p>}
          </div>
          <HubKindIcon kind={kind} size={36} />
        </div>
      </header>
      <div className="mx-auto max-w-md space-y-3 px-4 pb-28 pt-3">{children}</div>
    </div>
  );
}
