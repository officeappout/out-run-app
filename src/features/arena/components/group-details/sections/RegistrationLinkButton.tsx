'use client';

import { ExternalLink } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/**
 * External registration — the actual enrollment action when the group has
 * one (e.g. "צו כושר" branches), shown regardless of in-app join state
 * (registering externally and joining the in-app chat/roster are
 * independent). It is the PRIMARY CTA whenever it exists; in-app join is
 * demoted to secondary (07.09.2026).
 */
export default function RegistrationLinkButton({ href }: { href: string }) {
  const t = useT(community);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-black bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg transition-all active:scale-[0.97]"
    >
      <ExternalLink className="w-4 h-4" />
      {t('group.join.register')}
    </a>
  );
}
