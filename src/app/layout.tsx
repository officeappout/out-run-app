import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import ClientLayout from "./ClientLayout";
import NativeBootstrap from "@/components/system/NativeBootstrap";
import MarketingAttributionBootstrap from "@/components/system/MarketingAttributionBootstrap";
import AppSessionBootstrap from "@/components/system/AppSessionBootstrap";
import AccessibilityWidgetLoader from "@/components/system/AccessibilityWidgetLoader";
import { APP_ORIGIN } from '@/lib/config/domain';
import { LOCALE_COOKIE, parseLocaleCookie } from '@/lib/i18n/locale-cookie';
import { dirOf, SOURCE_LOCALE } from '@/lib/i18n/locales';

/**
 * Server-side locale for the first paint: the out_locale cookie that LocaleSync writes only while
 * enable_i18n is on (and removes otherwise). No cookie = Hebrew, so Hebrew users and crawlers get
 * exactly the markup they always did.
 */
function serverLocale() {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  return parseLocaleCookie(raw ? `${LOCALE_COOKIE}=${raw}` : null) ?? SOURCE_LOCALE;
}

const OG_LOCALE = { he: 'he_IL', en: 'en_US', ru: 'ru_RU', de: 'de_DE' } as const;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Title/description are already English-only today and stay as they were; only the Open Graph
// locale follows the user (he_IL by default, so Hebrew output is unchanged).
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(APP_ORIGIN),
    title: "Out Run App",
    description: "Your personal running companion",
    openGraph: { locale: OG_LOCALE[serverLocale()] },
  };
}

// Force dynamic rendering to prevent static generation
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Force dynamic rendering by calling headers() - this prevents static generation
  // and ensures the layout is always rendered dynamically
  headers();
  const locale = serverLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className="light" suppressHydrationWarning>
      <head>
        {/* The manifest stays a static Hebrew file on purpose: it carries the installed app's
            name/description (the store listing language) and is cached by the browser per URL,
            so it must not vary per user. lang/dir are declared in it ("he"/"rtl"). */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00BAF7" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Out" />
        {/* Material Icons Round — used by RunControls, EquipmentSelector, MapTabs,
            and several other components. Preconnect hints reduce handshake latency. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
        {/* Assistant, Rubik, and Inter are removed: Simpler Pro is self-hosted in
            globals.css with font-display:swap and covers all UI text. Loading those
            three families from Google Fonts was adding 3 render-blocking round-trips
            for fonts that the browser never fell back to. */}
        {/* Mapbox DNS Prefetch for faster map loading */}
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
      </head>
      
      <body className="antialiased bg-[#F8FAFC]">
        <NativeBootstrap />
        <MarketingAttributionBootstrap />
        <AppSessionBootstrap />
        <ClientLayout>{children}</ClientLayout>
        {/* Opt-in only (Settings toggle, default OFF) — renders nothing until enabled. */}
        <AccessibilityWidgetLoader />
      </body>
    </html>
  );
}