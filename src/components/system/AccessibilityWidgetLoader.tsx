'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import {
  A11Y_WIDGET_EVENT,
  readA11yWidgetEnabled,
} from '@/lib/accessibilityWidgetPref';

/**
 * Loads the UserWay accessibility toolbar ONLY when the user has opted in
 * (Settings → "הפעלת סרגל נגישות"). Off by default: nothing third-party runs
 * and no request to cdn.userway.org is made until then.
 *
 * Supplementary layer only — it does not replace any code-level fix, and the
 * /accessibility statement must not claim compliance on its account.
 *
 * The preference is read in an effect (never during render) so server HTML and
 * first client render both render nothing — no hydration mismatch. Turning the
 * toggle OFF stops future loads; a script that already ran in this session
 * cannot be unloaded, so it takes effect on the next app launch.
 */
export default function AccessibilityWidgetLoader() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    void readA11yWidgetEnabled().then((v) => {
      if (alive) setEnabled(v);
    });
    const onChange = (e: Event) => setEnabled(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(A11Y_WIDGET_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(A11Y_WIDGET_EVENT, onChange);
    };
  }, []);

  if (!enabled) return null;

  return (
    <Script
      id="userway-widget"
      src="https://cdn.userway.org/widget.js"
      data-account="UejrUF8boL"
      strategy="afterInteractive"
    />
  );
}
