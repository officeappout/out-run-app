import type { Metadata } from "next";
import "./globals.css";
import BottomNavigation from "@/components/BottomNavigation"; // 1. ייבוא הקומפוננטה

export const metadata: Metadata = {
  title: "Out Run App",
  description: "Your personal running companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
      </head>
      
      <body className="antialiased pb-20"> {/* הוספנו pb-20 כדי שהתוכן לא יוסתר ע"י הבר התחתון */}
        <main>
          {children}
        </main>
        
        <BottomNavigation /> {/* 2. הזרקת הניווט שיופיע בכל הדפים */}
      </body>
    </html>
  );
}