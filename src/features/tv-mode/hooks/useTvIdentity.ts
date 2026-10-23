'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { identityOf, type TvIdentity } from '../core/join-plan';

/** Account / guest / nobody — follows sign-in changes (a guest who links an account becomes an account). */
export function useTvIdentity(): TvIdentity {
  const [identity, setIdentity] = useState<TvIdentity>(() => identityOf(auth.currentUser));
  useEffect(() => onAuthStateChanged(auth, (u) => setIdentity(identityOf(u))), []);
  return identity;
}
