import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import ClientLayout from "./ClientLayout";
import NativeBootstrap from "@/components/system/NativeBootstrap";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://out-run-app.vercel.app'),
  title: "Out Run App",
  description: "Your personal running companion",
};

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
  return (
    <html lang="he" dir="rtl" className="light" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00BAF7" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}