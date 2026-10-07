import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "سیستم دبیرخانه و صدور پیش فاکتور بهسا",
  description: "سیستم جامع دبیرخانه، مدیریت نامه‌ها و صدور پیش فاکتور",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        {/* فونت وزیرمتن به‌صورت کاملاً آفلاین از همان سرور سرو می‌شود؛
            پیش‌بارگذاری تا اولین رندر با فونت درست انجام شود */}
        <link
          rel="preload"
          href="/fonts/vazirmatn-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/vazirmatn-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
