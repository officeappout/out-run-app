/**
 * Hook to prevent hydration mismatch in client components
 * Returns true only after the component has mounted on the client
 */
import { useState, useEffect } from 'react';

export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
