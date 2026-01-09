import type { Metadata } from "next";
import "./globals.css"; // וודא שזה קיים אצלך

export const metadata: Metadata = {
  title: "Simpler Map",
  description: "Map interface for Simpler",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        {/* --- שים לב: השורה עברה לכאן, לתוך ה-HEAD --- */}
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
      </head>
      
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}