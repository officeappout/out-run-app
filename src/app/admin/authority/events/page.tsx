'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthorityEventsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/authority/community?tab=rsvp');
  }, [router]);
  return null;
}
